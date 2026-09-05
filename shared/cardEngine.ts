import {
  GameState, PlayerState, CardDef, CostType, BuffType,
  GamePhase, GameLogEntry, 
  BUFF_NAMES, ContentSegment,
} from './types';
import { deepClone, applyEffectToPlayer, getBuffStacks, findBuff } from './buffEngine';
import { DEFAULT_HAND_LIMIT, generateCardInstanceId, getCardSubtype, getLastNonGlassCard, MAX_LOG_ENTRIES } from './constants';
import { discardFromHand, findOpponent, triggerDiscardEvents, triggerDrawEvents } from './gameEngine';

// 服务端通知 handler（由 server/index.ts 设置，通过 globalThis 跨模块共享）
// target: 'all'=双方都显示 'self'=仅出牌者 'opponent'=仅对手
// category: 'hint'=提示（NotificationToast） 'trigger'=触发效果反馈（TriggerEffectPanel）
export function showMessage(msg: string, target: 'all' | 'self' | 'opponent' = 'all', category: 'hint' | 'trigger' = 'hint') {
  const h = (globalThis as any).__card_notify_handler;
  console.log('[Notify] showMessage:', msg, 'target:', target, 'category:', category, 'handler:', !!h);
  if (h) h(msg, target, category);
}

// 触发效果收集器：在 applyCard 期间收集所有触发内容，用于末尾日志结构化
// 嵌套 applyCard（玻璃板/魔咒爆发）通过保存/恢复机制隔离各自收集器，避免外层被重置
let triggerCollector: ContentSegment[][] | null = null;

// 卡牌结算递归深度护栏（玻璃板连锁复制上限），防止异常状态下无限递归
let cardRecursionDepth = 0;
const MAX_CARD_RECURSION_DEPTH = 6;

/** 提取卡牌模板 id（card_N），兼容 _drawn_/_debug_/_brew_ 等实例前缀 */
export function getTemplateCardId(cardId: string): string {
  const m = cardId.match(/card_\d+/);
  return m ? m[0] : cardId;
}

// 装备被动产生的 buff 的 sourceCardId → 卡牌模板 id（替换装备时据此移除旧装备产生的 buff）
const EQUIP_PASSIVE_SOURCE_TO_TEMPLATE: Record<string, string> = {
  golden_greaves: 'card_24',    // 金护腿：回血抵消凋零获得的护盾
  hidden_screamer: 'card_42',   // 幽匿尖啸体（武器）：造成物理伤害时全场的凋零
};

/** 替换装备时移除旧装备产生的 buff（按 sourceCardId 归属，模板/实例 id 均匹配） */
function removeEquipmentBuffs(holder: PlayerState, oldCard: CardDef) {
  const tpl = getTemplateCardId(oldCard.id);
  const sourceKeys = new Set<string>([oldCard.id, tpl]);
  for (const [src, t] of Object.entries(EQUIP_PASSIVE_SOURCE_TO_TEMPLATE)) {
    if (t === tpl) sourceKeys.add(src);
  }
  holder.buffs = holder.buffs.filter(b => !sourceKeys.has(b.sourceCardId || ''));
}

/** 发送结构化触发效果到客户端（打出效果提示面板） */
export function showTrigger(segments: ContentSegment[], target: 'all' | 'self' | 'opponent' = 'all') {
  showMessage(JSON.stringify({ type: 'rich', segments }), target, 'trigger');
  if (triggerCollector) triggerCollector.push(segments);
}

/** 卡牌效果引擎 — 处理单张卡牌打出的完整流程*/

//将卡牌添加到手牌
export function addCardToHand(player: PlayerState, card: CardDef, s: GameState, target?: PlayerState) {
    player.hand.push(card);
    handleHandLimit(player, s, target);
}

/**
 * 处理手牌上限（爆牌）
 * 当手牌数量 + 装备区数量超过手牌上限时，弃掉多余的手牌。
 * 优先弃掉最后加入手牌的牌（即数组末尾的牌）。
 */
export function handleHandLimit(player: PlayerState, s: GameState, target?: PlayerState) {
  const handLimit = DEFAULT_HAND_LIMIT + (player.handLimitBonus || 0);
  const equippedCount = [
    player.equipment.equip,
    player.equipment.weapon,
    player.equipment.field,
  ].filter(Boolean).length;

  // 超出数量 = 手牌数 + 装备数 - 上限，但最多只能弃掉所有手牌
  const excessCount = Math.min(
    player.hand.length + equippedCount - handLimit,
    player.hand.length
  );

  if (excessCount <= 0) return; // 未超出上限

  // 取出最后 excessCount 张手牌（后 push 进 hand 的牌）
  const excessCards = player.hand.slice(-excessCount);

  // 显示爆牌提示（双方都可见）
  showTrigger([{ type: 'text', text: `${player.name}爆牌` }], 'all');

  // 逐张弃牌（此时牌还在手牌中）
  for (const card of excessCards) {
    discardFromHand(s, player.id, card.id);
  }
}
export function drawCards(player: PlayerState, count: number, s: GameState, target?: PlayerState): PlayerState {
  let p = deepClone(player);
  for (let i = 0; i < count; i++) {
    // 2. 随机选择一张牌（索引）
    const randomIndex = Math.floor(Math.random() * p.deck.length);
    const sourceCard = p.deck[randomIndex];

    // 3. 复制这张牌到手牌，并赋予新的唯一 ID（防止 ID 冲突）
    const drawn: CardDef = {
      ...sourceCard,
      id: generateCardInstanceId(sourceCard.id, 'drawn'),
    };

    addCardToHand(p, drawn, s, target);

    // 触发摸牌事件（陷阱箱等）
    triggerDrawEvents(p, drawn, s);

    // 注意：这里没有执行 p.deck.splice 或 shift，原牌堆不变
  }
  return p;
}

// ===== 洗牌 =====
export function shuffleDeck(player: PlayerState): PlayerState {
  const p = deepClone(player);
  const deck = [...p.deck];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  p.deck = deck;
  return p;
}

// ===== 从手牌移除卡牌 =====
function removeFromHand(player: PlayerState, cardId: string): PlayerState {
  const p = deepClone(player);
  p.hand = p.hand.filter(c => c.id !== cardId);
  return p;
}

// ===== 应用卡牌效果到目标 =====
export interface ApplyCardResult {
  gameState: GameState;
  logMessages: string[];
}

export function heal(source: PlayerState, target: PlayerState, number: number,state: GameState, opponent?: PlayerState) {
  let healAmt = Math.max(0, number);
  //治愈增强
  healAmt += getBuffStacks(target, BuffType.HealBoost);
  //枯萎：减少层数等量回血但不消耗层数
  healAmt -= getBuffStacks(target, BuffType.Blight);
  healAmt = Math.max(0, healAmt);

  //凋零：消耗1层，减少1点回血
  const witherStacks = getBuffStacks(target, BuffType.Wither);
  if (witherStacks > 0) {
    const consumed = Math.min(witherStacks, healAmt);
    if(consumed > 0) consumeInPlace(target, BuffType.Wither, consumed);
    healAmt -= consumed;
    // 金护腿：抵消凋零获得护盾（护盾归属装备持有者）
    if (target.equipment?.equip?.name === '金护腿') {
      applyEffectToPlayer(target, BuffType.Shield, consumed, undefined, 'golden_greaves', state, target.id, opponent);
    }
    // 幽匿尖啸体：凋零被清空时，对方随机丢弃一张牌（触发完整丢弃事件）
    if (getBuffStacks(target, BuffType.Wither) === 0
        && target.equipment?.weapon?.name === '幽匿尖啸体' && opponent) {
      if (opponent.hand.length > 0) {
        const idx = Math.floor(Math.random() * opponent.hand.length);
        const [discarded] = opponent.hand.splice(idx, 1);
        discardFromHand(state, opponent.id, discarded.id);
      }
    }
  }
  
  //丛林被动
  if (target.equipment?.field?.name === '丛林') {
    // 凋零清空时：生命上限+1（凋零从有到无时触发）
    if (witherStacks > 0 && getBuffStacks(target, BuffType.Wither) === 0) {
      target.maxHp += 1;
      showTrigger([
        { type: 'card', cardId: target.equipment.field.id },
        { type: 'text', text: `${target.name}上限+1` },
      ], 'all');
    }
    // 回血时额外回复1点（每回合限1次）
    if (!target.jungleHpUpTriggered) {
      target.jungleHpUpTriggered = true;
      heal(source, target, 1, state, opponent);
      showTrigger([
        { type: 'card', cardId: target.equipment.field.id },
      ], 'all');
    }
  }
  
  const overHeal = Math.max(0, target.hp + healAmt - target.maxHp);
  //实际回血
  target.hp = Math.min(target.maxHp, target.hp + healAmt);
  //血量溢出提示
  if (overHeal > 0) {
    showTrigger([
      { type: 'hpChange', playerName: target.name, hpDelta: -overHeal, isHeal: false , text: `溢出${overHeal}` },
    ], 'all');
  }

  //中毒：回血后受伤
  const poisonStacks = getBuffStacks(target, BuffType.Poison);
  if (poisonStacks > 0) {
    damage(target, target, DamageType.Real, poisonStacks, state);
    showTrigger([
      { type: 'buff', buffType: BuffType.Poison },
    ], 'all');
  }
  showTrigger([
    { type: 'hpChange', playerName: target.name, hpDelta: healAmt, isHeal: true },
  ], 'all');
  return healAmt;
}

export enum DamageType {
  Physical,
  Fire,
  Real
}
/** 原地消耗 buff 层数（修改原对象 buffs 数组，不创建新对象） */
export function consumeInPlace(player: PlayerState, type: BuffType, amount: number): number {
  let remaining = amount;
  for (const b of player.buffs) {
    if (b.buffType !== type || remaining <= 0) continue;
    const c = Math.min(remaining, b.stacks);
    b.stacks -= c; remaining -= c;
  }
  player.buffs = player.buffs.filter(b => b.stacks > 0);
  return amount - remaining;
}

/** 重生：受到致命伤害时触发——抵消此次伤害，移除自身所有状态（含重生自身），血量改为1 */
function tryRebirth(target: PlayerState, incoming: number): boolean {
  if (getBuffStacks(target, BuffType.Rebirth) <= 0) return false;
  if (target.hp - incoming > 0) return false; // 非致命，不触发
  target.buffs = []; // 移除所有状态（重生自身一并移除）
  target.hp = 1;
  showTrigger([
    { type: 'buff', buffType: BuffType.Rebirth },
    { type: 'text', text: `${target.name}重生 HP=1` },
  ], 'all');
  return true;
}

export function damage(source: PlayerState, target: PlayerState, type: DamageType, base: number, state: GameState): number {
  let number = Math.max(0, base);
  if(type === DamageType.Physical) {
    //力量（所有实例求和）
    number += getBuffStacks(source, BuffType.Strength);
    //虚弱（所有实例求和）
    number -= getBuffStacks(source, BuffType.Weakness);
    //抗性（所有实例求和）
    number -= getBuffStacks(target, BuffType.Resistance);
    //易伤
    number += getBuffStacks(target, BuffType.Vulnerability);
    //护盾
    const shieldStacks = getBuffStacks(target, BuffType.Shield);
    if (shieldStacks > 0) {
      const blocked = Math.min(shieldStacks, Math.max(0, number));
      if (blocked > 0) {
        consumeInPlace(target, BuffType.Shield, blocked);
        number -= blocked;
      }
    }
    //格挡：减5点物理伤害，消耗全部层数后状态消失
    const blockStacks = getBuffStacks(target, BuffType.Block);
    if (blockStacks > 0) {
      const reduced = Math.min(blockStacks, number);
      number -= reduced;
      consumeInPlace(target, BuffType.Block, blockStacks);
      showTrigger([
        { type: 'buff', buffType: BuffType.Block },
        { type: 'text', text: `减伤${reduced}` },
      ], 'all');
    }
    //侦测器暴击
    const dmgBoost = getBuffStacks(source, BuffType.DamageBoost);
    if (dmgBoost > 0) {
      number = Math.ceil(number * 1.75);
      consumeInPlace(source, BuffType.DamageBoost, dmgBoost);
      showTrigger([
        { type: 'buff', buffType: BuffType.DamageBoost },
        { type: 'text', text: '×1.75' },
      ], 'all');
    }
    //滴水石锥（物伤回血）
    if (source.equipment?.weapon?.name === '滴水石锥') {
      heal(source, source, 1, state, target);
      showTrigger([
        { type: 'card', cardId: source.equipment.weapon.id },
      ], 'all');
    }
    //烈焰棒：标记触发条件（仅卡牌打出的物理伤害满足“上一张牌造成物理伤害”前提）
    if (source.equipment?.weapon?.name === '烈焰棒') {
      source.causePhysicalDamageBang = true;
      showMessage('丢弃一张牌可造成2点火焰伤害', "self")
    }
    //烈焰粉提示（同样只在卡牌物理伤害时置位）
    if (!source.blazePowderUsedThisTurn && source.hand.filter(card => card.name === '烈焰粉').length > 0) {
      source.causePhysicalDamageFen = true;
      showMessage('打出烈焰粉可额外造成3点火焰伤害', "self");
    }
    //幽匿尖啸体：造成物理伤害时所有人增加1点凋零
    if (source.equipment?.weapon?.name === '幽匿尖啸体') {
      applyEffectToPlayer(source, BuffType.Wither, 1, undefined, 'hidden_screamer', state, source.id);
      applyEffectToPlayer(target, BuffType.Wither, 1, undefined, 'hidden_screamer', state, source.id);
      showTrigger([
        { type: 'card', cardId: source.equipment.weapon.id },
        { type: 'text', text: '所有人+1' },
        { type: 'buff', buffType: BuffType.Wither },
      ], 'all');
    }
    //盾牌：受到物理伤害时摸1张牌
    if (target.equipment?.equip?.name === '盾牌') {
      const drawn = drawCards(target, 1, state, source);
      Object.assign(target, drawn);
      showTrigger([
        { type: 'card', cardId: target.equipment.equip!.id },
        { type: 'text', text: `${target.name}摸1` },
      ], 'all');
    }
     //三叉戟：攻击凋零目标额外伤害
    if (source.equipment?.weapon?.name === '三叉戟') {
    const hasWither = target.buffs.some(b => b.buffType === BuffType.Wither && b.stacks > 0);
    if (hasWither) {
      number += 1;
      showTrigger([
        { type: 'card', cardId: source.equipment.weapon.id },
        { type: 'text', text: '伤害+1' },
      ], 'all');
    }
  }

  } else if(type === DamageType.Fire) {
    //抗火：免疫
    const fireResist = getBuffStacks(target, BuffType.FireResist);
    if (fireResist > 0) return 0;
    //火焰易伤：增加火焰伤害
    number += getBuffStacks(target, BuffType.FireVuln);
    //海洋之心：失去并抵消火焰伤害
    const oceanHeartIdx = target.hand.findIndex(c => c.name === '海洋之心');
    if (oceanHeartIdx !== -1) {
      const [discarded] = target.hand.splice(oceanHeartIdx, 1);
      showTrigger([
        { type: 'card', cardId: discarded.id },
        { type: 'text', text: '抵消火焰伤害' },
      ], 'all');
      return 0;
    }
    //移除封锁：受到火焰伤害时移除封锁状态
    if (findBuff(target, BuffType.LockAction)) {
      consumeInPlace(target, BuffType.LockAction, 1);
      showTrigger([
        { type: 'buff', buffType: BuffType.LockAction },
        { type: 'text', text: `${target.name}移除` },
      ], 'all');
    }
    if (findBuff(target, BuffType.LockStrategy)) {
      consumeInPlace(target, BuffType.LockStrategy, 1);
      showTrigger([
        { type: 'buff', buffType: BuffType.LockStrategy },
        { type: 'text', text: `${target.name}移除` },
      ], 'all');
    }
 
  } else if(type === DamageType.Real) {
    //真实伤害：无视所有buff
    //重生：致命伤害时触发（描述未限定伤害类型，真实伤害同样可被重生抵消）
    if (tryRebirth(target, number)) return number;
    target.hp = Math.max(0, target.hp - number);
    showTrigger([
      { type: 'hpChange', playerName: target.name, hpDelta: -number, isHeal: false },
    ], 'all');
    return number;
  }


  //重生：致命伤害时触发（物理/火焰伤害统一出口）
  if (tryRebirth(target, number)) return number;
  target.hp = Math.max(0, target.hp - number);

  showTrigger([
    { type: 'hpChange', playerName: target.name, hpDelta: -number, isHeal: false },
  ], 'all');
  return number;
}

export function applyCard(
  gameState: GameState,
  playerId: string,
  targetId: string,
  card: CardDef
): ApplyCardResult {
  const state = deepClone(gameState);
  const msgs: string[] = [];

  const playerIndex = state.players.findIndex(p => p.id === playerId);
  const targetIndex = state.players.findIndex(p => p.id === targetId);
  if (playerIndex === -1 || targetIndex === -1) {
    return { gameState: state, logMessages: ['无效的玩家或目标'] };
  }

  const isSelfTarget = playerIndex === targetIndex;
  const cardName = card.name;

  // ===== 用一份统一的状态 p 代表卡牌使用者 =====
  // 效果产生"攻击者"和"防御者"两份修改时，最终合并回 p
  let p = deepClone(state.players[playerIndex]);
  // 当目标非己时，targetState 是另一个玩家
  let t = isSelfTarget ? p : deepClone(state.players[targetIndex]);
  // 记录卡牌处理前的血量，用于日志末尾追加血量变化
  const oldHpP = p.hp;
  const oldHpT = isSelfTarget ? p.hp : t.hp;

  // 记录卡牌处理前的 buff，用于日志末尾 buff 变化
  const oldBuffsP = deepClone(p.buffs);
  const oldBuffsT = isSelfTarget ? deepClone(p.buffs) : deepClone(t.buffs);

  // 递归深度护栏：玻璃板连锁复制超过上限时终止结算，防止无限递归
  if (cardRecursionDepth >= MAX_CARD_RECURSION_DEPTH) {
    return { gameState: state, logMessages: ['卡牌连锁结算过深，已终止'] };
  }
  cardRecursionDepth++;

  // 启动触发效果收集器
  const prevTriggerCollector = triggerCollector;
  triggerCollector = [];

  // 从手牌移除
  p = removeFromHand(p, card.id);
  // removeFromHand 会返回新克隆，重新同步 t（自瞄时 t 必须与 p 保持同一引用，
  // 否则后续 damage(p, t, ...) 会打到过期的旧克隆上）
  if (isSelfTarget) t = p;

  // 更新消耗计数
  const subtype = getCardSubtype(card);
  if (subtype === 'heal') {
    if (p.equipment?.field?.name === '冰原' && (p.healCountThisTurn || 0) >=1) {
      showTrigger([
        { type: 'card', cardId: p.equipment.field.id },
        { type: 'text', text: '触发' },
      ], 'all');
      p.attackCountThisTurn = (p.attackCountThisTurn || 0) + 1; // 冰原场地加成：回血类和攻击类消耗次数互通
    } else p.healCountThisTurn = (p.healCountThisTurn || 0) + 1;
  }
  if (subtype === 'attack'){
    if (p.equipment?.field?.name === '冰原' && (p.attackCountThisTurn || 0) >=1) {
      showTrigger([
        { type: 'card', cardId: p.equipment.field.id },
        { type: 'text', text: '触发' },
      ], 'all');
      p.healCountThisTurn = (p.healCountThisTurn || 0) + 1; // 冰原场地加成：回血类和攻击类消耗次数互通
    } else p.attackCountThisTurn = (p.attackCountThisTurn || 0) + 1;
  }
  // 所有行动牌（含回血/攻击类）+ 锦囊牌 → 共享池
  if (card.costType === CostType.Action || card.costType === CostType.Strategy) {
    p.actionStrategyCountThisTurn = (p.actionStrategyCountThisTurn || 0) + 1;
  }

  // 记录本回合消耗类型（附魔台用）
  if (!p.playedCardTypesThisTurn.includes(card.costType)) {
    p.playedCardTypesThisTurn.push(card.costType);
  }
  // 按 icon 前缀补充记录子类型（附魔台需要，因为 costType 不再区分回血/攻击/增益/减益/事件）
  const iconNums = card.icon.split(',').map(Number).slice(0, -1);
  for (const num of iconNums) {
    const mappedType = num === 3 ? CostType.Heal
      : num === 4 ? CostType.Attack
      : num === 5 ? CostType.Buff
      : num === 6 ? CostType.Debuff
      : num === 7 ? CostType.Event
      : null;
    if (mappedType && !p.playedCardTypesThisTurn.includes(mappedType)) {
      p.playedCardTypesThisTurn.push(mappedType);
    }
  }

  // 更新上一张牌为当前这张（玻璃板本身不在此 push，改在下方玻璃板特殊处理中手动 push）
  if (card.name !== '玻璃板') {
    p.lastPlayedCardDef.push(card);
    p.lastPlayedCardSelfTarget.push(isSelfTarget);
  }
  
  //处理烈焰粉判断逻辑
  if(card.name !== '烈焰粉' && p.causePhysicalDamageFen) p.causePhysicalDamageFen = false;

  // 处理装备/武器/场地替换（始终作用在卡牌使用者身上）
  if (card.costType === CostType.Equip ||
      card.costType === CostType.Weapon ||
      card.costType === CostType.Field) {
    const slotKey = card.costType === CostType.Equip ? 'equip'
                  : card.costType === CostType.Weapon ? 'weapon' : 'field';
    const target = isSelfTarget ? p : t;
    if (target.equipment[slotKey]) {
      const oldCard = target.equipment[slotKey]!;
      target.discardPile.push(oldCard);
      // 装备替换规则第 3 条：旧卡产生的 buff 被移除
      removeEquipmentBuffs(target, oldCard);
      // 装备替换规则第 4 条：旧卡被丢弃时触发的事件也会触发
      triggerDiscardEvents(target, oldCard, state, undefined, []);
    }
    const modifiedCard = { ...card, sourcePlayerId: p.id }; // 记录装备来源玩家ID，供buff计算时参考
    target.equipment[slotKey] = modifiedCard;
    if (isSelfTarget) p = target; else t = target;
    msgs.push(`${cardName}已装备`);
  }

  // ===== 逐条执行效果 =====
  // 奶桶（ReduceDuration）单独详细记录限时 buff 时长变化，末尾通用的"失去"行跳过目标一侧避免重复
  let reduceDurationDetailed = false;
  for (const effect of card.effects) {
    const targetLabel = isSelfTarget ? '自己' : '对手';

    if (effect.buffType === BuffType.Heal) {
      if (effect.duration && effect.duration > 0) {
        // 持续回血（治愈 buff，每回合回复）
        const target = isSelfTarget ? p : t;
        applyEffectToPlayer(target, BuffType.Heal, effect.value, effect.duration, card.id, state, p.id);
        heal(p, target, effect.value, state, isSelfTarget ? state.players[1 - playerIndex] : p);
      } else {// 即时回血
        const target = isSelfTarget ? p : t;
        heal(p, target, effect.value, state, isSelfTarget ? state.players[1 - playerIndex] : p);
      }

    } else if (effect.buffType === BuffType.HealAll) {
      // 全体回血（无论目标选择，双方都回血）
      const healAllOpponent = isSelfTarget ? state.players[1 - playerIndex] : t;
      heal(p, p, effect.value, state, healAllOpponent);
      heal(p, healAllOpponent, effect.value, state, p);
      // msgs.push(`${cardName}为双方回复了${effect.value}点血量`);
    } else if (effect.buffType === BuffType.PhysicalDamage) {
      //物理伤害
      const target = isSelfTarget ? p : t;
      damage(p, target, DamageType.Physical, effect.value, state);
    } else if (effect.buffType === BuffType.Damage) {
      // 魔法伤害
      const target = isSelfTarget ? p : t;
      if (effect.duration && effect.duration > 0) {
        // 持续真伤
        applyEffectToPlayer(target, BuffType.Damage, effect.value, effect.duration, card.id, state, p.id);
        damage(target, target, DamageType.Real, effect.value, state);
      } else damage(p, target, DamageType.Real, effect.value, state);
    } else if (effect.buffType === BuffType.RemoveWither) {
      // 移除凋零
      const target = isSelfTarget ? p : t;
      const witherIdx = target.buffs.findIndex(b => b.buffType === BuffType.Wither);
      if (witherIdx !== -1) {
        const buff = target.buffs[witherIdx];
        const removed = Math.min(effect.value, buff.stacks);
        buff.stacks -= removed;
        const witherCleared = buff.stacks <= 0;
        if (witherCleared) target.buffs.splice(witherIdx, 1);
        msgs.push(`${cardName}为${targetLabel}移除了${removed}层凋零`);
        showTrigger([
          { type: 'text', text: `${targetLabel}移除${removed}` },
          { type: 'buff', buffType: BuffType.Wither },
        ], 'all');
        // 幽匿尖啸体：凋零被清空时，对方随机丢弃一张牌
        if (witherCleared && target.equipment?.weapon?.name === '幽匿尖啸体') {
          const opp = isSelfTarget ? state.players[1 - playerIndex] : p;
          if (opp.hand.length > 0) {
            const idx = Math.floor(Math.random() * opp.hand.length);
            const [discarded] = opp.hand.splice(idx, 1);
            discardFromHand(state, opp.id, discarded.id);
          }
        }
        // 丛林被动：凋零清空时生命上限+1
        if (witherCleared && target.equipment?.field?.name === '丛林') {
          target.maxHp += 1;
          showTrigger([
            { type: 'card', cardId: target.equipment.field.id },
            { type: 'text', text: `${target.name}上限+1` },
          ], 'all');
        }
      } else {
        msgs.push(`(${cardName})目标没有凋零`);
      }
      if (isSelfTarget) p = target; else t = target;

    } else if (effect.buffType === BuffType.ReduceDuration) {
      // 减少限时状态回合数
      const target = isSelfTarget ? p : t;
      // 快照减少前的限时 buff（对象引用不变，用于对比时长变化）
      const oldTimedBuffs = target.buffs.filter(b => b.remainingTurns !== undefined);
      // 检测将被移除的袭击之兆（被移除时场上血量最高的玩家受到5×层数魔法伤害）
      const removedAttackSigns = target.buffs.filter(b => b.buffType === BuffType.AttackSign && b.remainingTurns !== undefined && b.remainingTurns <= 1);
      target.buffs = target.buffs
        .map(buff => {
          if (buff.remainingTurns === undefined) return buff;
          return { ...buff, remainingTurns: Math.max(0, buff.remainingTurns - 1) };
        })
        .filter(b => b.remainingTurns === undefined || b.remainingTurns > 0);
      msgs.push(`${cardName}使${targetLabel}所有限时状态剩余回合-1`);
      // 详细记录每个限时 buff 的时长变化（与回合结束的 buff 减少消息格式一致）
      const buffSegs: ContentSegment[] = [{ type: 'text', text: `${target.name}:` }];
      for (const ob of oldTimedBuffs) {
        const nb = target.buffs.find(b => b.buffType === ob.buffType && b.sourcePlayerId === ob.sourcePlayerId);
        if (!nb) {
          buffSegs.push({ type: 'buff', buffType: ob.buffType });
          buffSegs.push({ type: 'text', text: '消失' });
        } else if (ob.remainingTurns !== undefined && nb.remainingTurns !== undefined && ob.remainingTurns !== nb.remainingTurns) {
          buffSegs.push({ type: 'buff', buffType: ob.buffType });
          buffSegs.push({ type: 'text', text: `${ob.remainingTurns}→${nb.remainingTurns}` });
        }
      }
      reduceDurationDetailed = true;
      if (buffSegs.length > 1) showTrigger(buffSegs, 'all');
      // 袭击之兆被移除：场上血量最高的玩家受到5×层数魔法伤害（血量相同时拥有袭击之兆的玩家优先）
      if (removedAttackSigns.length > 0) {
        // holder = 袭击之兆持有者；other = 另一方（自瞄时对手用 state 引用读取）
        const holder = isSelfTarget ? p : t;
        const other = isSelfTarget ? state.players[1 - playerIndex] : p;
        // 血量相同（other.hp 不高于 holder.hp）时优先打持有者
        const highest = other.hp > holder.hp ? other : holder;
        // 移除的袭击之兆总层数（多来源时层数累加，stacks 未定义时按 1 层计）
        const totalStacks = removedAttackSigns.reduce((sum, b) => sum + (b.stacks || 1), 0);
        const dmg = 5 * totalStacks;
        damage(p, highest, DamageType.Real, dmg, state);
        msgs.push(`袭击之兆被移除，${highest.name}（血量最高）受到${dmg}点魔法伤害`);
        showTrigger([
          { type: 'buff', buffType: BuffType.AttackSign },
          { type: 'text', text: `移除 ${highest.name}-${dmg}` },
        ], 'all');
      }
      if (isSelfTarget) p = target; else t = target;

    } else if (effect.buffType === BuffType.ReduceMaxHp) {
      // 降低生命上限
      const target = isSelfTarget ? p : t;
      const reduction = Math.min(effect.value, target.maxHp - 1);
      target.maxHp = Math.max(1, target.maxHp - reduction);
      target.hp = Math.min(target.hp, target.maxHp);
      msgs.push(`${cardName}使${targetLabel}生命上限降低${reduction}点`);
      showTrigger([
        { type: 'text', text: `${targetLabel}上限-${reduction}` },
      ], 'all');
      if (isSelfTarget) p = target; else t = target;

    } else if (effect.buffType === BuffType.IncreaseMaxHp) {
      // 提升生命上限
      const target = isSelfTarget ? p : t;
      target.maxHp += effect.value;
      msgs.push(`${cardName}使${targetLabel}生命上限提升${effect.value}点`);
      showTrigger([
        { type: 'text', text: `${targetLabel}上限+${effect.value}` },
      ], 'all');
      if (isSelfTarget) p = target; else t = target;
    }else if (effect.buffType === BuffType.ConditionalDiscard) {
    // 条件丢弃：检查目标手牌是否有<烟花>或<龙息>，有则随机丢弃一张，否则造成伤害
    const target = isSelfTarget ? p : t;
    
    // 查找目标手牌中是否存在 '烟花' 或 '龙息' 或 '重生锚' 或 '刷怪笼'
    const discardCandidateIdx = target.hand.findIndex(c => c.name === '烟花' || c.name === '龙息' || c.name === '重生锚' || c.name === '刷怪笼');

    if (discardCandidateIdx !== -1) {
        // 如果有，随机丢弃一张符合条件的牌（这里逻辑为：如果找到了索引，则丢弃该索引对应的牌）
        // 原逻辑也是找到索引后直接丢弃，因为 findIndex 返回的是第一个匹配项，相当于在匹配的牌中随机选了一张
        const [discarded] = target.hand.splice(discardCandidateIdx, 1);
        discardFromHand(state, target.id, discarded.id);
    } else {
        // 否则给予尸潮并造成伤害
        applyEffectToPlayer(target, BuffType.Horde, 4, 2, card.id, state, p.id);
        damage(p, target, DamageType.Physical, 4, state);
        if (isSelfTarget) p = target; else t = target;
    }

    } else if (effect.buffType === BuffType.DrawCard) {
      // 摸牌
      const target = isSelfTarget ? p : t;
      // 自瞄时 opponent 必须是“真实的对手”（state 中的另一玩家），
      // 而非 t（自瞄时 t 与 p 同引用，会把爆牌目标算成自己——P0-10）
      const opponent = isSelfTarget ? state.players[1 - playerIndex] : p;
      const oldHandLen = target.hand.length;
      const drawn = drawCards(target, effect.value, state, opponent);
      const newCards = drawn.hand.length - oldHandLen;
      msgs.push(`${cardName}使${targetLabel}摸了${Math.max(0, newCards)}张牌`);
      if (isSelfTarget) { p = drawn; t = p; } else { t = drawn; }

    } else if (effect.buffType === BuffType.StealCard) {
      // 抽取目标一张手牌
      if (t.hand.length > 0) {
        const idx = Math.floor(Math.random() * t.hand.length);
        const [stolen] = t.hand.splice(idx, 1);
        addCardToHand(p, stolen, state, t);
        msgs.push(`${cardName}从${targetLabel}手中偷走了${stolen.name}`);
        showTrigger([
          { type: 'text', text: '偷取' },
          { type: 'card', cardId: stolen.id },
        ], 'all');
      } else {
        msgs.push(`(${cardName})目标手牌为空`);
        showTrigger([
          { type: 'text', text: '目标手牌为空' },
        ], 'all');
      }

    } else if (effect.buffType === BuffType.RevealHand) {
      // 展示手牌：在日志中记录目标手牌信息
      const target = isSelfTarget ? p : t;
      const count = target.hand.length; // 望远镜：展示所有手牌
      const revealed = target.hand.slice(0, count).map(c => c.name).join('、');
      msgs.push(`揭示的手牌：${revealed}`);
      showTrigger([
        { type: 'text', text: `${targetLabel}手牌:` } as ContentSegment,
        ...target.hand.slice(0, count).map(c => ({ type: 'card', cardId: c.id } as ContentSegment)),
      ], 'all');
      if (isSelfTarget) p = target; else t = target;

    } else if (effect.buffType === BuffType.DamageOnDiscard) {
      // 丢弃伤害Debuff
      const target = isSelfTarget ? p : t;
      applyEffectToPlayer(target, BuffType.DamageOnDiscard, effect.value, effect.duration, card.id, state, p.id);
      msgs.push(`${cardName}使${targetLabel}在丢弃牌时受到${effect.value}点伤害（持续${effect.duration}回合）`);
    } else if (effect.buffType === BuffType.HealPerBuff) {
      // 每存在一种状态回1点血
      const target = isSelfTarget ? p : t;
      // 统计不同的buff类型数量（排除特殊类型）
      const buffTypes = new Set(p.buffs.map(b => b.buffType));
      heal(p, target, buffTypes.size, state, isSelfTarget ? state.players[1 - playerIndex] : p);
      msgs.push(`${cardName}为${targetLabel}回复了${buffTypes.size}点血量`);
      if (isSelfTarget) p = target; else t = target;
    } else {
      // 其他Buff效果
      const target = isSelfTarget ? p : t;
      applyEffectToPlayer(target, effect.buffType, effect.value, effect.duration, card.id, state, p.id);
    }
  }

  // ===== 特殊卡牌处理 =====
  // 仙人掌：对所有人造成1点物理伤害（自己 + 对手各一次）
  // 修复：自瞄时不能对 p 打两次，必须对“真实的对手”（state 中另一玩家）结算，
  //       且其原地修改会在末尾写回并穿过玻璃板递归保留
  if (card.name === '仙人掌') {
    const opponentObj = isSelfTarget ? state.players[1 - playerIndex] : t;
    damage(p, p, DamageType.Physical, 1, state);
    damage(p, opponentObj, DamageType.Physical, 1, state);
    msgs.push(`${cardName}对所有玩家造成了1点物理伤害`);
  }

  // 蜘蛛网：设置待选封锁类型（目标装备海龟壳时免疫蜘蛛网）
  if (card.name === '蜘蛛网') {
    const bucketTarget = isSelfTarget ? p : t;
    if (bucketTarget.equipment?.equip?.name === '海龟壳') {
      showMessage(`海龟壳免疫蜘蛛网，${bucketTarget.name}未被封锁`, 'all');
    } else {
      p.pendingBucketChoice = 'pending';
    }
  }

  // 诡异钓竿：设置待选装备
  if (card.name === '诡异钓竿') {
    if (t.equipment) {
    p.pendingEquipChoice = 'pending';
    p.pendingEquipCard = card; // 存储打出的卡牌，取消时用于返还
    } else {
      showMessage('诡异钓竿：目标没有装备', 'self');
    }
  }

  // 玻璃板：复制上一张牌的效果
  if (card.name === '玻璃板') {
    // 保存当前的 lastPlayedCardDef / lastPlayedCardSelfTarget（玻璃板不参与 push）
    const beforePlayedDef = [...(p.lastPlayedCardDef || [])];
    const beforeSelfTarget = [...(p.lastPlayedCardSelfTarget || [])];

    // 找最后一张非玻璃板的牌（避免连续玻璃板无限递归；与校验层共用同一查找逻辑）
    const lastCard = getLastNonGlassCard(p);

    if (lastCard) {
      // 1. 保存当前的消耗次数（此时已经包含了玻璃板作为锦囊牌自身消耗的 1 次）
      const beforeActionCount = p.actionStrategyCountThisTurn || 0;

      // 关键修复（P0-1/P0-5/P0-10）：
      // a) 递归必须基于“当前已结算的 state”克隆，而不是最初的 gameState 参数，
      //    否则自瞄 HealAll / 幽匿尖啸体弃牌 / 盾牌摸牌等对对手的原地修改会在递归中丢失；
      // b) 只覆盖使用者/目标槽位，绝不再用 t（自瞄时 t===p）去覆盖对手槽位；
      // c) 内层完整日志并入外层 state.log，被复制牌的结算记录不再凭空消失。
      const newState = deepClone(state);
      newState.players[playerIndex] = p;
      if (!isSelfTarget) newState.players[targetIndex] = t;
      const result = applyCard(newState, playerId, targetId, lastCard);
      const pIdx = result.gameState.players.findIndex(pl => pl.id === playerId);
      p = result.gameState.players[pIdx];
      t = result.gameState.players[1 - pIdx];
      if (isSelfTarget) {
        // 自瞄时对手槽位未写入，把内层结算后的对手副本合并回来（含原地修改）
        state.players[1 - playerIndex] = result.gameState.players[1 - pIdx];
        t = p; // 恢复自瞄别名不变式
      }
      state.log = result.gameState.log.slice(0, 1); // 只保留玻璃板本体的 log，内层结算的 log 由 msgs 追加到外层

      // 2. 撤销内部 applyCard 造成的消耗次数变化，恢复到只有玻璃板自身 1 次消耗的状态
      p.actionStrategyCountThisTurn = beforeActionCount;
      // 撤销内部 applyCard 对 lastPlayedCardDef/SelfTarget 的 push，改为 push 玻璃板本体
      p.lastPlayedCardDef = [...beforePlayedDef];
      p.lastPlayedCardSelfTarget = [...beforeSelfTarget];

      msgs.push(`玻璃板复制了「${lastCard.name}」的效果`);
      showTrigger([
        { type: 'card', cardId: card.id },
        { type: 'text', text: '复制' },
        { type: 'card', cardId: lastCard.id },
      ], 'all');
      result.logMessages.forEach(msg => msgs.push(msg));

      // 3. 手动追加消耗：复制行动牌时需额外消耗 2 次（含玻璃板自身 1 次共 3 次），
      //    复制其它类型只消耗玻璃板自身 1 次（锦囊/装备等），与校验层保持一致
      if (lastCard.costType === CostType.Action) {
        p.actionStrategyCountThisTurn = beforeActionCount + 2;
        msgs[msgs.length - 1] += '（复制行动牌，总共消耗3次行动/锦囊次数）';
        showMessage('玻璃板复制行动牌，总共消耗3次行动/锦囊次数', 'self');
      } else {
        p.actionStrategyCountThisTurn = beforeActionCount;
      }
    } else {
      msgs.push('玻璃板没有可复制的牌');
      showMessage('玻璃板没有可复制的牌', 'self');
    }

    // 无论是否复制成功，都 push 玻璃板本体（让弹窗显示玻璃板而非被复制牌）
    p.lastPlayedCardDef.push(card);
    p.lastPlayedCardSelfTarget.push(isSelfTarget);
  }


  // 侦测器：展示一张随机对手手牌，记录待猜权重
  if (card.name === '侦测器') {
    if (!isSelfTarget && t.hand.length > 0) {
      const randIdx = Math.floor(Math.random() * t.hand.length);
      const revealedCard = t.hand[randIdx];
      const w = revealedCard.weight || 0;
      // 将待猜信息存到玩家状态中
      p.pendingGuessCardId = revealedCard.id;
      p.pendingGuessCardWeight = w;
      p.pendingGuessCardName = revealedCard.name;
    } else {
      showTrigger([
        { type: 'card', cardId: card.id },
        { type: 'text', text: ':目标手牌为空或自瞄，无法展示' },
      ], 'self');
    }
  }

  if (card.name === '附魔台') {
    // 获得当回合不增加 enchantBurstReady，回合结束时才转为可用
  }

  // 运输矿车：从牌组抽4张牌展示，双方轮流选
  if (card.name === '运输矿车') {
    if (p.deck.length >= 5) {
      const deckCards = p.deck.splice(0, 5);
      p.draftCards = deckCards.map(c => JSON.parse(JSON.stringify(c)));
      p.draftPlayerPick = 0; // 当前玩家先选
      p.draftPickCount = 0;
    }
  }

  // 烈焰粉：自瞄时直接对自己造成3点火焰伤害，不读不写两个标记
  if (card.name === '烈焰粉' && isSelfTarget) {
    damage(p, p, DamageType.Fire, 3, state);
  }
  // 非自瞄：上一张牌造成物理伤害后打出额外造成火焰伤害（每回合限1次）
  else if (card.name === '烈焰粉' && p.causePhysicalDamageFen && !p.blazePowderUsedThisTurn) {
    damage(p, t, DamageType.Fire, 3, state);
    p.causePhysicalDamageFen = false;
    p.blazePowderUsedThisTurn = true;
  }

  // 重生锚：造成2点火焰伤害
  if (card.name === '重生锚') {
    damage(p, isSelfTarget ? p : t, DamageType.Fire, 2, state);
  }

  // 红石粉：设置待选限时状态（弹窗选择，参考诡异钓竿模式）
  if (card.name === '红石粉') {
    const target = isSelfTarget ? p : t;
    if (target.buffs.some(b => b.remainingTurns !== undefined)) {
      p.pendingRedstoneChoice = 'pending';
      p.pendingRedstoneTargetId = target.id;
    } else {
      showMessage('红石粉：目标没有限时型状态', 'self');
    }
  }

  // ===== 写入状态 =====
  if (isSelfTarget) {
    state.players[playerIndex] = p;  // p 已包含所有变化
  } else {
    state.players[playerIndex] = p;
    state.players[targetIndex] = t;
  }

  // 检查胜负
  for (const p of state.players) {
    if (p.hp <= 0) {
      state.phase = GamePhase.GameOver;
      state.winnerId = state.players.find(pl => pl.id !== p.id)?.id;
      msgs.push(`${p.name}的HP降为0，${state.winnerId ? state.players.find(pl => pl.id === state.winnerId)?.name : '对方'}获胜！`);
      break;
    }
  }

  // 记录日志（末尾追加血量变化）
  const newHpP = state.players[playerIndex].hp;
  const newHpT = state.players[targetIndex].hp;
  const hpParts: string[] = [];
  if (newHpP !== oldHpP) hpParts.push(`自己血量${oldHpP}→${newHpP}`);
  if (!isSelfTarget && newHpT !== oldHpT) hpParts.push(`对方血量${oldHpT}→${newHpT}`);
  const hpSuffix = hpParts.length > 0 ? `，${hpParts.join('，')}` : '';

  // 收集触发效果（注意：收集器在 buff 变化提示推送【之后】才恢复，
  // 否则嵌套 applyCard 的 buff 变化行会泄漏进外层收集器，造成日志重复）
  const triggerLines = triggerCollector || [];

  // 计算 buff 变化（获得/失去），合并到同一行
  const targetLabel = isSelfTarget ? '自己' : '对方';
  const newBuffsP = state.players[playerIndex].buffs;
  const newBuffsT = state.players[targetIndex].buffs;
  // 收集所有 buff 变化段，最后合并为一一行
  const lostBuffsP: ContentSegment[] = [];
  const lostBuffsT: ContentSegment[] = [];
  const gainedBuffsP: ContentSegment[] = [];
  const gainedBuffsT: ContentSegment[] = [];
  // 失去的 buff
  for (const old of oldBuffsP) {
    if (!newBuffsP.find(b => b.buffType === old.buffType && b.sourcePlayerId === old.sourcePlayerId)) {
      lostBuffsP.push({ type: 'buff', buffType: old.buffType });
    }
  }
  if (!isSelfTarget) {
    for (const old of oldBuffsT) {
      if (!newBuffsT.find(b => b.buffType === old.buffType && b.sourcePlayerId === old.sourcePlayerId)) {
        lostBuffsT.push({ type: 'buff', buffType: old.buffType });
      }
    }
  }
  // 获得的 buff
  for (const newBuff of newBuffsP) {
    if (!oldBuffsP.find(b => b.buffType === newBuff.buffType && b.sourcePlayerId === newBuff.sourcePlayerId)) {
      gainedBuffsP.push({ type: 'text', text: `${newBuff.stacks + '层'}` });
      gainedBuffsP.push({ type: 'buff', buffType: newBuff.buffType });
    }
  }
  if (!isSelfTarget) {
    for (const newBuff of newBuffsT) {
      if (!oldBuffsT.find(b => b.buffType === newBuff.buffType && b.sourcePlayerId === newBuff.sourcePlayerId)) {
        gainedBuffsT.push({ type: 'text', text: `${newBuff.stacks + '层'}` });
        gainedBuffsT.push({ type: 'buff', buffType: newBuff.buffType });
      }
    }
  }
  // 组装 buff 变化行（同一玩家的所有 buff 合并到一行）
  // 奶桶已单独详细记录时长变化（含消失），目标一侧的通用"失去"行跳过避免重复
  const buffChangeLines: ContentSegment[][] = [];
  if (lostBuffsP.length > 0 && !(reduceDurationDetailed && isSelfTarget)) buffChangeLines.push([{ type: 'text', text: '自己失去' }, ...lostBuffsP]);
  if (lostBuffsT.length > 0 && !(reduceDurationDetailed && !isSelfTarget)) buffChangeLines.push([{ type: 'text', text: '对方失去' }, ...lostBuffsT]);
  if (gainedBuffsP.length > 0) buffChangeLines.push([{ type: 'text', text: '自己获得' }, ...gainedBuffsP]);
  if (gainedBuffsT.length > 0) buffChangeLines.push([{ type: 'text', text: '对方获得' }, ...gainedBuffsT]);

  // 打出效果提示中也加入 buff 变化（需求 5）
  for (const line of buffChangeLines) {
    showTrigger(line, 'all');
  }

  // 停止收集器（必须在 buff 变化推送之后，见上方注释）
  triggerCollector = prevTriggerCollector;

  // 组装结构化日志内容
  const logSegments: ContentSegment[][] = [
    [{ type: 'text', text: `对${targetLabel}打出了`, bold: true }, { type: 'card', cardId: card.id }],
    ...triggerLines,
  ];
  // 血量变化
  if (newHpP !== oldHpP) logSegments.push([{ type: 'text', text: `自己${oldHpP}→${newHpP}` }]);
  if (!isSelfTarget && newHpT !== oldHpT) logSegments.push([{ type: 'text', text: `对方${oldHpT}→${newHpT}` }]);
  // buff 变化
  //logSegments.push(...buffChangeLines);

  const entry: GameLogEntry = {
    playerId: state.players[state.currentTurnIndex].id,
    message: (msgs[msgs.length - 1] || `对${targetLabel}打出了${cardName}`) + hpSuffix,
    segments: logSegments,
    timestamp: Date.now(),
  };
  state.log.push(entry);

  // 日志上限：防止长对局内存与前端渲染无限膨胀（配合 P0-2 的无限增长数组清理）
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
  }

  cardRecursionDepth--;
  return { gameState: state, logMessages: msgs };
}
