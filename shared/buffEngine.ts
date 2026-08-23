import { damage, DamageType, heal, showTrigger } from './cardEngine';
import { PlayerState, ActiveBuff, BuffType, GameState, ContentSegment } from './types';

/**
 * Buff 引擎 — 纯函数，事件驱动
 */

// ===== 工具函数 =====

export function deepClonePlayer(p: PlayerState): PlayerState {
  return deepClone(p);
}

export function deepClone<T>(obj: T): T {
  // structuredClone 比 JSON.parse(JSON.stringify()) 快一个量级；GameState 只含纯数据，可安全克隆
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

export function getBuffStacks(player: PlayerState, type: BuffType, sourcePlayerId?: string): number {
  return player.buffs
    .filter(b => b.buffType === type && (!sourcePlayerId || b.sourcePlayerId === sourcePlayerId))
    .reduce((sum, b) => sum + b.stacks, 0);
}

export function findBuff(player: PlayerState, type: BuffType): ActiveBuff | undefined {
  return player.buffs.find(b => b.buffType === type);
}

// ===== 应用效果到玩家 =====
export function applyEffectToPlayer(
  player: PlayerState,
  buffType: BuffType,
  value: number,
  duration: number | undefined,
  sourceCardId: string,
  sourcePlayerId?: string,
  opponent?: PlayerState,
  state?: GameState,
) {
  const stacks = value; // 每次应用效果时，value即为层数/强度
  // 非正数层数/强度时跳过
  if (stacks <= 0 || value <= 0) return player;

  // 钻石胸甲
  if(player.equipment?.equip?.name === '钻石胸甲' && buffType === BuffType.Shield) {
    heal(player, player, value, opponent, state);
    showTrigger([
      { type: 'card', cardId: player.equipment.equip.id },
      { type: 'text', text: `${player.name}护盾→血量${value}` },
    ], 'all');
    return;
  }
  // 村庄：免疫尸潮
  if(player.equipment?.field?.name === '村庄' && buffType === BuffType.Horde) {
    showTrigger([
      { type: 'card', cardId: player.equipment.field.id },
      { type: 'text', text: `${player.name}免疫尸潮` },
    ], 'all');
    return;
  }
  // 同类型、同剩余回合、同来源 → 合并层数（P0-7：必须匹配 sourcePlayerId，
  // 否则不同来源的 buff 会被合并成一个、归属第一个来源，导致 processTurnEndBuffs
  // 按来源减时出现提前/延迟消失）
  const existing = player.buffs.find(b =>
    b.buffType === buffType &&
    b.remainingTurns === duration &&
    b.sourcePlayerId === sourcePlayerId
  );
  if (existing) {
    existing.stacks += stacks;
    existing.value = Math.max(existing.value, value);
    return;
  }

  player.buffs.push({
    buffType: buffType,
    value,
    stacks,
    remainingTurns: duration,
    sourceCardId,
    sourcePlayerId,
  });
}

// ===== 回合开始处理 =====

/** 回合开始结算事件写入战斗记录（与回合结束 buff 减少消息同位置，type: 'endTurn'） */
function logSettlementEvent(state: GameState, message: string, segments: ContentSegment[]) {
  state.log.push({
    turnNumber: state.turnNumber,
    message,
    segments: [segments],
    type: 'endTurn',
    timestamp: Date.now(),
  });
}

export function processTurnStartBuffs(player: PlayerState, opponent: PlayerState, opponentId: string, state: GameState): PlayerState {
  let p = deepClonePlayer(player);

  // 龙息/尸潮/治愈：打出者（p）回合开始时触发
  // 检查所有人身上由 p 施加的 buff，source 统一为 p
  // 1. 自身施加给自己的（自施场景，如 A 对 A 用龙息）
  const selfDamage = getBuffStacks(p, BuffType.Damage, p.id);
  if(selfDamage > 0) {
    const dealt = damage(p, p, DamageType.Real, selfDamage, false);
    showTrigger([{ type: 'buff', buffType: BuffType.Damage }], 'all');
    logSettlementEvent(state, `龙息：${p.name}受到${dealt}点魔法伤害`, [
      { type: 'buff', buffType: BuffType.Damage },
      { type: 'hpChange', playerName: p.name, hpDelta: -dealt },
    ]);
  }
  const selfHorde = getBuffStacks(p, BuffType.Horde, p.id);
  if(selfHorde > 0) {
    // 尸潮是 buff 结算，不是“打出的卡牌”，isCard=false —— 不满足烈焰粉/烈焰棒的“卡牌物理伤害”前提
    const dealt = damage(p, p, DamageType.Physical, selfHorde, false);
    showTrigger([{ type: 'buff', buffType: BuffType.Horde }], 'all');
    logSettlementEvent(state, `尸潮：${p.name}受到${dealt}点物理伤害`, [
      { type: 'buff', buffType: BuffType.Horde },
      { type: 'hpChange', playerName: p.name, hpDelta: -dealt },
    ]);
  }
  const selfHeal = getBuffStacks(p, BuffType.Heal, p.id);
  if(selfHeal > 0) {
    const healed = heal(p, p, selfHeal, opponent, state);
    showTrigger([{ type: 'buff', buffType: BuffType.Heal }], 'all');
    logSettlementEvent(state, `生命回复：${p.name}回复${healed}点血量`, [
      { type: 'buff', buffType: BuffType.Heal },
      { type: 'hpChange', playerName: p.name, hpDelta: healed, isHeal: true },
    ]);
  }

  // 2. 对方身上由自己施加的（外施场景，如 A 对 B 用龙息）
  const outDamage = getBuffStacks(opponent, BuffType.Damage, p.id);
  if(outDamage > 0) {
    const dealt = damage(p, opponent, DamageType.Real, outDamage, false);
    showTrigger([{ type: 'buff', buffType: BuffType.Damage }], 'all');
    logSettlementEvent(state, `龙息：${opponent.name}受到${dealt}点魔法伤害`, [
      { type: 'buff', buffType: BuffType.Damage },
      { type: 'hpChange', playerName: opponent.name, hpDelta: -dealt },
    ]);
  }
  const outHorde = getBuffStacks(opponent, BuffType.Horde, p.id);
  if(outHorde > 0) {
    // 同 selfHorde：尸潮是 buff 结算而非卡牌伤害，isCard=false
    const dealt = damage(p, opponent, DamageType.Physical, outHorde, false);
    showTrigger([{ type: 'buff', buffType: BuffType.Horde }], 'all');
    logSettlementEvent(state, `尸潮：${opponent.name}受到${dealt}点物理伤害`, [
      { type: 'buff', buffType: BuffType.Horde },
      { type: 'hpChange', playerName: opponent.name, hpDelta: -dealt },
    ]);
  }
  const outHeal = getBuffStacks(opponent, BuffType.Heal, p.id);
  if(outHeal > 0) {
    const healed = heal(p, opponent, outHeal, p, state);
    showTrigger([{ type: 'buff', buffType: BuffType.Heal }], 'all');
    logSettlementEvent(state, `生命回复：${opponent.name}回复${healed}点血量`, [
      { type: 'buff', buffType: BuffType.Heal },
      { type: 'hpChange', playerName: opponent.name, hpDelta: healed, isHeal: true },
    ]);
  }
  
  //钻石胸甲：每回合开始时获得1层抗性
  if(player.equipment?.equip?.name === '钻石胸甲' && player.equipment?.equip?.sourcePlayerId === opponentId) {
    applyEffectToPlayer(p, BuffType.Resistance, 1, 1, 'card_23', p.id);
    showTrigger([
      { type: 'card', cardId: player.equipment.equip.id },
      { type: 'buff', buffType: BuffType.Resistance },
      { type: 'text', text: '+1' },
    ], 'all');
    logSettlementEvent(state, `钻石胸甲：${p.name}获得1层抗性`, [
      { type: 'card', cardId: player.equipment.equip.id },
      { type: 'buff', buffType: BuffType.Resistance },
      { type: 'text', text: '+1' },
    ]);
  }

  //海龟壳：每回合开始时获得抗火
  if(player.equipment?.equip?.name === '海龟壳' && player.equipment?.equip?.sourcePlayerId === opponentId) {
    applyEffectToPlayer(p, BuffType.FireResist, 1, 1, 'card_26', p.id);
    showTrigger([
      { type: 'card', cardId: player.equipment.equip.id },
      { type: 'buff', buffType: BuffType.FireResist },
      { type: 'text', text: '+1' },
    ], 'all');
    logSettlementEvent(state, `海龟壳：${p.name}获得1层抗火`, [
      { type: 'card', cardId: player.equipment.equip.id },
      { type: 'buff', buffType: BuffType.FireResist },
      { type: 'text', text: '+1' },
    ]);
  }

  //三叉戟：每回合开始时获得1层力量
  if(player.equipment?.weapon?.name === '三叉戟' && player.equipment?.weapon?.sourcePlayerId === opponentId) {
    applyEffectToPlayer(p, BuffType.Strength, 1, 1, 'card_27', p.id);
    showTrigger([
      { type: 'card', cardId: player.equipment.weapon.id },
      { type: 'buff', buffType: BuffType.Strength },
      { type: 'text', text: '+1' },
    ], 'all');
    logSettlementEvent(state, `三叉戟：${p.name}获得1层力量`, [
      { type: 'card', cardId: player.equipment.weapon.id },
      { type: 'buff', buffType: BuffType.Strength },
      { type: 'text', text: '+1' },
    ]);
  }

  return p;
}

// ===== 回合结束处理 =====
export function processTurnEndBuffs(player: PlayerState, opponentId: string): PlayerState {
  let p = deepClonePlayer(player);
  p.buffs = p.buffs
    .map(buff => {
      const b = { ...buff };
      // 只减少来自对方施加的限时 buff 的 remainingTurns
      // 这样每个 buff 从被施加到被减少，完整走过了1个回合
      if (b.remainingTurns !== undefined && b.sourcePlayerId === opponentId) {
        b.remainingTurns -= 1;
      }
      return b;
    })
    .filter(b => {
      if (b.value <= 0) return false;
      if (b.stacks <= 0) return false;
      if (b.remainingTurns !== undefined && b.remainingTurns <= 0) return false;
      return true;
    });
  return p;
}