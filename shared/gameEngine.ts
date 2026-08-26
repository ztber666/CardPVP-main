import { GameState, PlayerState, CardDef, GamePhase, GameLogEntry, PlayCardAction, BuffType, CostType, ContentSegment, BUFF_NAMES } from './types'; 
import { deepClone, applyEffectToPlayer, getBuffStacks, findBuff } from './buffEngine'; 
import { drawCards, shuffleDeck, applyCard, damage, DamageType, showMessage, addCardToHand, showTrigger, heal } from './cardEngine';
import { processTurnStartBuffs, processTurnEndBuffs } from './buffEngine'; 
import { DEFAULT_MAX_HP, INITIAL_DRAW_COUNT, TURN_DRAW_COUNT, buildTestDeck, CARDS, MAX_LOG_ENTRIES, generateCardInstanceId, DEFAULT_HAND_LIMIT } from './constants'; 
import { validatePlayCard } from './validation';

// ===== 公共工具 =====

/** 检查并结算胜负：任一玩家 hp<=0 时置为 GameOver，返回是否已结束 */
export function checkGameOver(state: GameState): boolean {
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[i].hp <= 0) {
      state.phase = GamePhase.GameOver;
      state.winnerId = state.players.find(pl => pl.id !== state.players[i].id)?.id;
      state.log.push({
        playerId: state.players[state.currentTurnIndex].id,
        message: `${state.players[i].name}的HP降为0，${state.winnerId ? state.players.find(pl => pl.id === state.winnerId)?.name : '对方'}获胜！`,
        timestamp: Date.now(),
      });
      trimLog(state);
      return true;
    }
  }
  return false;
}

/** 日志上限裁剪（防止长对局内存/前端渲染无限膨胀） */
export function trimLog(state: GameState): void {
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
  }
}

// ===== 游戏创建 ===== 
export function createGame( 
  roomId: string, 
  p1Id: string, 
  p1Name: string, 
  p2Id: string, 
  p2Name: string 
): GameState { 
  return { 
    roomId, 
    players: [ 
      { 
        id: p1Id, 
        name: p1Name, 
        hp: DEFAULT_MAX_HP, 
        maxHp: DEFAULT_MAX_HP, 
        deck: shuffleDeck({ deck: buildTestDeck(), hand: [], discardPile: [], buffs: [], equipment: {} } as any).deck, 
        hand: [], 
        discardPile: [], 
        buffs: [], 
        equipment: {}, 
        healCountThisTurn: 0, 
        attackCountThisTurn: 0, 
        actionStrategyCountThisTurn: 0, 
        handLimitBonus: 0, 
        actionLimitBonus: 0, 
        damageOnDiscardCount: 0, 
        lastPlayedCardDef: [], 
        lastPlayedCardSelfTarget: [],
        lastDiscardedCardDef: [],
        lastPlayedCardName: '', 
        lastPlayedCardEffects: [], 
        lastPlayedCardCostType: 'action' as any, 
        causePhysicalDamageFen: false, 
        causePhysicalDamageBang: false,
        blazePowderUsedThisTurn: false,
        enchantBurstReady: 0, // 初始无可用魔咒爆发
        pendingGuessCardId: '', 
        pendingGuessCardWeight: 0, 
        pendingGuessCardName: '', 
        playedCardTypesThisTurn: [], 
        draftCards: [], 
        draftPlayerPick: 0, 
        draftPickCount: 0, 
        draftPickedBy: {}, 
        jungleHpUpTriggered: false, 
        pendingBucketChoice: '', 
        pendingEquipChoice: '', 
        pendingRedstoneChoice: '', 
        pendingRedstoneTargetId: '', 
      }, 
      { 
        id: p2Id, 
        name: p2Name, 
        hp: DEFAULT_MAX_HP, 
        maxHp: DEFAULT_MAX_HP, 
        deck: shuffleDeck({ deck: buildTestDeck(), hand: [], discardPile: [], buffs: [], equipment: {} } as any).deck, 
        hand: [], 
        discardPile: [], 
        buffs: [], 
        equipment: {}, 
        healCountThisTurn: 0, 
        attackCountThisTurn: 0, 
        actionStrategyCountThisTurn: 0, 
        handLimitBonus: 0, 
        actionLimitBonus: 0, 
        damageOnDiscardCount: 0, 
        lastPlayedCardDef: [], 
        lastPlayedCardSelfTarget: [],
        lastDiscardedCardDef: [],
        lastPlayedCardName: '', 
        lastPlayedCardEffects: [], 
        lastPlayedCardCostType: 'action' as any, 
        causePhysicalDamageFen: false, 
        causePhysicalDamageBang: false,
        blazePowderUsedThisTurn: false,
        enchantBurstReady: 0, // 初始无可用魔咒爆发
        pendingGuessCardId: '', 
        pendingGuessCardWeight: 0, 
        pendingGuessCardName: '', 
        playedCardTypesThisTurn: [], 
        draftCards: [], 
        draftPlayerPick: 0, 
        draftPickCount: 0, 
        draftPickedBy: {}, 
        jungleHpUpTriggered: false, 
        pendingBucketChoice: '', 
        pendingEquipChoice: '', 
        pendingRedstoneChoice: '', 
        pendingRedstoneTargetId: '', 
      }, 
    ], 
    currentTurnIndex: 0, 
    turnNumber: 1, 
    durationTickCounter: 0, 
    phase: GamePhase.Playing, 
    log: [], 
  }; 
} 

// ===== 初始化对局（洗牌+摸牌+决定先手） ===== 
export function initGame(state: GameState): GameState { 
  const s = deepClone(state); 
  // 随机先手 
  s.currentTurnIndex = Math.random() < 0.5 ? 0 : 1; 
  // 摸初始手牌 
  for (let i = 0; i < s.players.length; i++) { 
    s.players[i] = drawCards(s.players[i], INITIAL_DRAW_COUNT, s); 
  } 
  //先手玩家回合摸牌 
  s.players[s.currentTurnIndex] = drawCards(s.players[s.currentTurnIndex], TURN_DRAW_COUNT, s); 
  return s; 
} 

// ===== 刷新装备效果 ===== 
function refreshEquipment(player: PlayerState): PlayerState { 
  const p = deepClone(player); 
  // 重置加成字段 
  p.handLimitBonus = 0; 
  p.actionLimitBonus = 0; 
  p.damageOnDiscardCount = 0; 
  // 检查场地卡加成 
  if (p.equipment.field?.name === '村庄') p.handLimitBonus = 4; 
  return p; 
} 

// ===== 开始新回合 ===== 
export function startTurn(state: GameState): GameState { 
  const s = deepClone(state); 
  s.phase = GamePhase.Playing; 
  let player = s.players[s.currentTurnIndex]; 
  // 刷新装备 
  player = refreshEquipment(player); 
  // 重置本回合状态 
  player.healCountThisTurn = 0; 
  player.attackCountThisTurn = 0; 
  player.actionStrategyCountThisTurn = 0; 
  player.jungleHpUpTriggered = false; 
  player.blazePowderUsedThisTurn = false;
  player.damageOnDiscardCount = 0; 
  player.playedCardTypesThisTurn = [];
  // P0-2：重置“上一张牌”系列（玻璃板/烈焰粉等依赖“本回合”语义），
  // 防止数组无限增长 + 跨回合污染弹窗/复制目标
  player.lastPlayedCardDef = [];
  player.lastPlayedCardSelfTarget = [];
  player.lastDiscardedCardDef = [];
  player.lastPlayedCardName = '';
  player.lastPlayedCardEffects = [];
  player.lastPlayedCardCostType = CostType.Action;
  player.causePhysicalDamageFen = false;
  player.causePhysicalDamageBang = false;
  // P1：清理上回合残留的交互流程状态（蜘蛛网/诡异钓竿/红石粉/侦测器/运输矿车），
  // 防止流程中断后状态残留
  player.pendingBucketChoice = '';
  player.pendingEquipChoice = '';
  player.pendingEquipCard = undefined;
  player.pendingRedstoneChoice = '';
  player.pendingRedstoneTargetId = '';
  player.pendingGuessCardId = '';
  player.pendingGuessCardWeight = 0;
  player.pendingGuessCardName = '';
  player.draftCards = [];
  player.draftPlayerPick = 0;
  player.draftPickCount = 0;
  player.draftPickedBy = {};
  // 回合开始 buff 已在 endTurn 完整轮变更时处理
  // 摸牌（皮革鞋子：回合摸牌量+1）
  const drawCount = TURN_DRAW_COUNT + (player.equipment?.equip?.name === '皮革鞋子' ? 1 : 0);
  const handLenBefore = player.hand.length;
  player = drawCards(player, drawCount, s, s.players[1 - s.currentTurnIndex]); 
 // 摸牌写入战斗记录（隐藏具体卡牌，只显示张数；爆牌丢弃由丢弃流程单独记录）
const drawnCards = player.hand.slice(handLenBefore);
s.log.push({
  playerId: player.id,
  message: `${player.name}摸了${drawnCards.length}张牌`,
  segments: [
    [{ type: 'text', text: `${player.name}摸牌`, bold: true },
     { type: 'text', text: `×${drawnCards.length}` }],
  ],
  type: 'drawCard',
  timestamp: Date.now(),
});
s.players[s.currentTurnIndex] = player;
// 摸牌爆牌丢弃可能触发绑定诅咒等伤害 → 补胜负判定（P0-4）
checkGameOver(s);
trimLog(s);
return s;
} 

// ===== 出牌 ===== 
export interface PlayCardResult { 
  success: boolean; 
  gameState: GameState; 
  error?: string; 
  messages?: string[]; 
} 

export function playCard(state: GameState, action: PlayCardAction, playerId: string): PlayCardResult { 
  // P0-8：引擎层防御纵深——无论调用方是否先过 validatePlayCard（rooms.ts 会先校验），
  // playCard 自身都强制走同一套校验，杜绝绕过校验层直接调用导致出违规牌
  const validation = validatePlayCard(state, playerId, action);
  if (!validation.valid) {
    return { success: false, gameState: state, error: validation.error, messages: [] };
  }
  // 找卡牌 
  const player = state.players[state.currentTurnIndex]; 
  const card = player.hand.find(c => c.id === action.cardId); 
  if (!card) { 
    return { success: false, gameState: state, error: '卡牌不在手牌中', messages: [] }; 
  } 
  // 执行卡牌效果 
  const result = applyCard(state, playerId, action.targetId, card); 
  return { 
    success: true, 
    gameState: result.gameState, 
    messages: result.logMessages, 
  }; 
} 

// ===== 结束小回合 ===== 
export function endTurn(state: GameState): GameState { 
  let s = deepClone(state); 
  if (s.phase !== GamePhase.Playing) return s; 
  const endingIdx = s.currentTurnIndex; 
  const name = s.players[endingIdx].name; 
  s.log.push({ 
    playerId: s.players[endingIdx].id,
    message: `${name}行动结束`, 
    timestamp: Date.now(), 
    type: 'endTurn', 
  }); 
  // 处理回合结束 Buff：减少所有人身上由对方施加的限时buff持续-1
  // 回合定义：从自己出牌开始到对方出牌结束为1回合
  // A endTurn → 减所有人身上由B施加的buff（B的回合走完）
  // B endTurn → 减所有人身上由A施加的buff（A的回合走完）
  // 遍历所有玩家是因为对方施加的buff可能在任何人身上（包括对方施加给自己的）
  const opponentId = s.players[1 - endingIdx].id;

  // 记录处理前的 buff 快照（用于日志记录 buff 时长变化）
  const oldBuffsByPlayer = s.players.map(pl => deepClone(pl.buffs));

  for (let i = 0; i < s.players.length; i++) {
    s.players[i] = processTurnEndBuffs(s.players[i], opponentId);
  }

  // 魔咒爆发：回合结束时，enchantBurstReady = 当前剩余魔咒爆发层数
  // （获得当回合不设，所以当回合不能触发；下回合 endTurn 后变为可用）
  for (let i = 0; i < s.players.length; i++) {
    const newStacks = getBuffStacks(s.players[i], BuffType.EnchantBurst);
    s.players[i].enchantBurstReady = newStacks;
  }

  // 记录 buff 时长变化和消失（需求 5），同一玩家的所有 buff 合并到同一行
  for (let i = 0; i < s.players.length; i++) {
    const oldBuffs = oldBuffsByPlayer[i];
    const newBuffs = s.players[i].buffs;
    const playerName = s.players[i].name;
    const buffSegs: ContentSegment[] = [{ type: 'text', text: `${playerName}:` }];
    for (const oldBuff of oldBuffs) {
      const newBuff = newBuffs.find(b => b.buffType === oldBuff.buffType && b.sourcePlayerId === oldBuff.sourcePlayerId);
      if (!newBuff) {
        // buff 消失
        buffSegs.push({ type: 'buff', buffType: oldBuff.buffType });
        buffSegs.push({ type: 'text', text: '消失' });
      } else if (oldBuff.remainingTurns !== undefined && newBuff.remainingTurns !== undefined && oldBuff.remainingTurns !== newBuff.remainingTurns) {
        // 时长变化
        buffSegs.push({ type: 'buff', buffType: oldBuff.buffType });
        buffSegs.push({ type: 'text', text: `${oldBuff.remainingTurns}→${newBuff.remainingTurns}` });
      }
    }
    // 只在有变化时记录，所有 buff 合并为一行
    if (buffSegs.length > 1) {
      s.log.push({
        playerId: s.players[endingIdx].id,
        message: `${playerName}的buff变化`,
        segments: [buffSegs],
        type: 'endTurn',
        timestamp: Date.now(),
      });
    }

    // 袭击之兆过期：场上血量最高的玩家受到5×层数点魔法伤害（血量相同时拥有袭击之兆的玩家优先）
    // P0-7 修复：按“来源”逐条判定过期——只要该来源的袭击之兆确实被移除就结算，
    // 而不是要求所有来源全部过期（否则一个来源未到期会吞掉其它已到期来源的结算）
    const expiredAttackSigns = oldBuffs.filter(b => {
      if (b.buffType !== BuffType.AttackSign) return false;
      return !newBuffs.some(nb => nb.buffType === BuffType.AttackSign && nb.sourcePlayerId === b.sourcePlayerId);
    });
    if (expiredAttackSigns.length > 0) {
      const selfP = s.players[i];
      const otherP = s.players[1 - i];
      // selfP 是过期 buff 的持有者；血量相同 → 优先打持有者
      const highest = otherP.hp > selfP.hp ? otherP : selfP;
      const dmgSource = s.players[endingIdx];
      // 计算过期的袭击之兆总层数（多来源时层数累加，stacks 未定义时按 1 层计）
      const totalStacks = expiredAttackSigns.reduce((sum, b) => sum + (b.stacks || 1), 0);
      const dmg = 5 * totalStacks;
      damage(dmgSource, highest, DamageType.Real, dmg, s);
      s.log.push({
        playerId: s.players[endingIdx].id,
        message: `袭击之兆过期，${highest.name}（血量最高）受到${dmg}点魔法伤害`,
        segments: [
          [
            { type: 'buff', buffType: BuffType.AttackSign },
            { type: 'text', text: `过期×${totalStacks}层` },
            { type: 'hpChange', playerName: highest.name, hpDelta: -dmg },
          ],
        ],
        type: 'endTurn',
        timestamp: Date.now(),
      });
      showTrigger([
        { type: 'buff', buffType: BuffType.AttackSign },
        { type: 'text', text: `过期 ${highest.name}-${dmg}` },
      ], 'all');
    }
  }

  // 对方回合开始 Buff（endTurn = 对方回合开始）
  // opponentId 是回合开始玩家自己的 ID，用于装备效果判断（sourcePlayerId === opponentId 检查是否自己安装的）
  const opponentIdx = 1 - endingIdx;
  s.players[opponentIdx] = processTurnStartBuffs(s.players[opponentIdx], s.players[endingIdx], opponentId, s);
  // 检查胜负（统一出口，P0-4）
  if (checkGameOver(s)) {
    trimLog(s);
    return s;
  }
  // 切换玩家 
  s.currentTurnIndex = 1 - s.currentTurnIndex; 
  // 持续时间节拍器：每两次结束出牌为完整一轮 
  s.durationTickCounter = ((s.durationTickCounter || 0) + 1) % 2; 
  if (s.durationTickCounter === 0) { 
    s.turnNumber += 1; 
    s.log.push({ 
      playerId: s.players[s.currentTurnIndex].id,
      message: `第${s.turnNumber}回合开始`, 
      timestamp: Date.now(), 
      type: 'endTurn', 
    }); 
  } 
  trimLog(s);
  return s; 
} 

export function handleDiscardBuffs(player: PlayerState, s: GameState) { 
  // 绑定诅咒：丢弃牌时受伤害 
  const curseStack = getBuffStacks(player, BuffType.DamageOnDiscard); 
  if (curseStack > 0 && player.damageOnDiscardCount < 1) { 
    damage(player, player, DamageType.Real, curseStack, s);
    player.damageOnDiscardCount += 1;
    // 'all'：受害者不一定是“当前行动玩家”（如幽匿尖啸体强制对手弃牌），
    // 若用 'self' 会按行动玩家归属导致提示发给错误的人
    showTrigger([
      { type: 'buff', buffType: BuffType.DamageOnDiscard },
    ], 'all');
    s?.log.push({
      playerId: s.players[s.currentTurnIndex].id,
      message: `${player.name}丢弃牌时受到${curseStack}点绑定诅咒伤害`,
      segments: [
        [{ type: 'buff', buffType: BuffType.DamageOnDiscard },
         { type: 'hpChange', playerName: player.name, hpDelta: -curseStack }],
      ],
      timestamp: Date.now(),
    });
  } 
  // 下界荒地：丢弃牌时获得1点护盾
  if (player.equipment?.field?.name === '下界荒地') {
    const opp = s?.players.find(p => p.id !== player.id);
    applyEffectToPlayer(player, BuffType.Shield, 1, undefined, player.equipment.field.id, s, player.id, opp);
    s?.log.push({ 
      playerId: s.players[s.currentTurnIndex].id,
      message: `${player.name}丢弃牌时获得1点护盾（下界荒地）`, 
      timestamp: Date.now(), 
    }); 
  } 
} 

/**
 * 触发摸牌时的特殊事件（统一接口）
 * 所有"摸牌时触发的特殊效果"都在此函数内集中处理
 * 新增摸牌时触发的特殊效果请在此函数内添加
 * @param player 摸牌的玩家
 * @param card 摸到的牌
 * @param s 游戏状态（可选，用于日志记录）
 */
export function triggerDrawEvents(player: PlayerState, card: CardDef, s: GameState): void {
  // 陷阱箱：摸牌时获得凋零
  const witherOnDrawStacks = getBuffStacks(player, BuffType.WitherOnDraw);
  if (witherOnDrawStacks > 0) {
    applyEffectToPlayer(player, BuffType.Wither, witherOnDrawStacks, undefined, 'wither_on_draw', s, player.id);
    if (s) {
    s.log.push({
      playerId: s.players[s.currentTurnIndex].id,
      message: `${player.name}摸牌时触发陷阱箱，获得${witherOnDrawStacks}层凋零`,
      segments: [
        [{ type: 'buff', buffType: BuffType.WitherOnDraw },
         { type: 'text', text: `${player.name}+${witherOnDrawStacks}` },
         { type: 'buff', buffType: BuffType.Wither }],
      ],
      timestamp: Date.now(),
    });
    }
    showTrigger([
      { type: 'buff', buffType: BuffType.WitherOnDraw },
      { type: 'text', text: `${player.name}+${witherOnDrawStacks}` },
      { type: 'buff', buffType: BuffType.Wither },
    ], 'all');
  }
}

/**
 * 魔咒爆发：消耗1层使被丢弃的牌效果生效（不消耗打出次数）
 * 统一入口：主动丢弃（discardFromHand 透传所选目标）与被动丢弃（triggerDiscardEvents：爆牌/刷怪笼/幽匿尖啸体等按默认目标）共用
 * 采用玻璃板同款递归模式：注入 live 引用后克隆结算，结果原地回写，调用方持有的引用继续有效
 * @param s 游戏状态（原地更新）
 * @param player 丢弃者（原地更新）
 * @param card 被丢弃的牌
 * @param opponent 丢弃者的对手 live 引用（原地更新；缺省时回写 s.players 对位槽）
 * @param targetId 主动丢弃时所选目标（缺省时按卡牌 defaultTarget 决定）
 * @returns 是否触发了魔咒爆发（无可用层时返回 false）
 */
export function triggerEnchantBurst(s: GameState, player: PlayerState, card: CardDef, opponent?: PlayerState, targetId?: string): boolean {
  const enchantStacks = getBuffStacks(player, BuffType.EnchantBurst);
  if (enchantStacks <= 0 || player.enchantBurstReady <= 0) return false;

  const playerIdx = s.players.findIndex(pl => pl.id === player.id);
  if (playerIdx === -1) return false;
  const oppSlot = s.players[1 - playerIdx];

  // 消耗1层魔咒爆发
  const buff = findBuff(player, BuffType.EnchantBurst);
  if (buff) {
    buff.stacks -= 1;
    if (buff.stacks <= 0) {
      player.buffs = player.buffs.filter(b => b !== buff);
    }
  }
  player.enchantBurstReady -= 1;

  // 确定目标：主动丢弃透传的 targetId 优先，否则根据卡牌默认目标决定
  const actualTargetId = targetId
    ?? (card.defaultTarget === 'self' ? player.id : (opponent?.id ?? oppSlot.id));

  // 保存当前的消耗计数，因为接下来调用 applyCard 会改变它
  // P0-11：快照必须覆盖 applyCard 会改动的"上一张牌"状态字段，
  // 否则被丢弃触发的牌会污染 causePhysicalDamage / lastPlayedCardCostType / blazePowderUsedThisTurn
  const before = {
    healCount: player.healCountThisTurn,
    attackCount: player.attackCountThisTurn,
    actionStrategyCount: player.actionStrategyCountThisTurn,
    playedTypes: [...player.playedCardTypesThisTurn],
    lastPlayedDef: [...player.lastPlayedCardDef],
    lastPlayedSelfTarget: [...(player.lastPlayedCardSelfTarget || [])],
    lastPlayedName: player.lastPlayedCardName,
    lastPlayedEffects: [...(player.lastPlayedCardEffects || [])],
    lastPlayedCostType: player.lastPlayedCardCostType,
    causePhysicalDamageFen: player.causePhysicalDamageFen,
    causePhysicalDamageBang: player.causePhysicalDamageBang,
    blazePowderUsed: player.blazePowderUsedThisTurn,
  };

  // 玻璃板递归模式：把 live 引用注入克隆再结算，避免丢弃链路中的原地修改在克隆中丢失
  const newState = deepClone(s);
  newState.players[playerIdx] = player;
  if (opponent) newState.players[1 - playerIdx] = opponent;
  const result = applyCard(newState, player.id, actualTargetId, card);

  // 丢弃触发不算正常打出：恢复消耗计数与"上一张牌"状态
  const np = result.gameState.players[playerIdx];
  np.healCountThisTurn = before.healCount;
  np.attackCountThisTurn = before.attackCount;
  np.actionStrategyCountThisTurn = before.actionStrategyCount;
  np.playedCardTypesThisTurn = before.playedTypes;
  np.lastPlayedCardDef = before.lastPlayedDef;
  np.lastPlayedCardSelfTarget = before.lastPlayedSelfTarget;
  np.lastPlayedCardName = before.lastPlayedName;
  np.lastPlayedCardEffects = before.lastPlayedEffects;
  np.lastPlayedCardCostType = before.lastPlayedCostType;
  np.causePhysicalDamageFen = before.causePhysicalDamageFen;
  np.causePhysicalDamageBang = before.causePhysicalDamageBang;
  np.blazePowderUsedThisTurn = before.blazePowderUsed;

  // 原地回写（保持对象身份，调用方持有的 player/opponent/s 引用继续有效）
  Object.assign(player, np);
  Object.assign(opponent ?? oppSlot, result.gameState.players[1 - playerIdx]);
  Object.assign(s, result.gameState);

  s.log.push({
    playerId: s.players[s.currentTurnIndex].id,
    message: `${player.name}触发了魔咒爆发，使${card.name}生效`,
    segments: [
      [{ type: 'text', text: `${player.name}魔咒爆发`, bold: true },
       { type: 'card', cardId: card.id }],
    ],
    timestamp: Date.now(),
  });
  return true;
}

/**
 * 触发卡牌丢弃时的特殊事件（统一接口）
 * 所有"丢弃时触发的特殊卡牌效果"都在此函数内集中处理
 * 新增特殊卡牌的丢弃事件请在此函数内添加
 * @param player 丢弃牌的玩家
 * @param card 被丢弃的卡牌
 * @param s 游戏状态（可选，用于日志记录）
 * @param target 对手玩家（可选，用于烈焰棒等需要指定目标的效果）
 * @param skipEnchantBurst 跳过魔咒爆发判定（主动丢弃已在 discardFromHand 生效魔咒爆发后回调时传 true，防止同一次丢弃重复消耗层数）
 */
export function triggerDiscardEvents(player: PlayerState, card: CardDef, s: GameState, target?: PlayerState, skipEnchantBurst: boolean = false): void {
  // 仙人掌：丢弃时触发效果，摸1张牌
  if (card.name === '仙人掌') {
    const updated = drawCards(player, 1, s, target);
    Object.assign(player, updated);
    if (s) {
      s.log.push({
        playerId: s.players[s.currentTurnIndex].id,
        message: `${player.name}丢弃了仙人掌，触发效果摸了1张牌`,
        segments: [
          [{ type: 'text', text: `${player.name}丢弃`, bold: true },
           { type: 'card', cardId: card.id },
           { type: 'text', text: '摸1' }],
        ],
        timestamp: Date.now(),
      });
    }
    showTrigger([
      { type: 'card', cardId: card.id },
      { type: 'text', text: `${player.name}摸1` },
    ], 'all');
  }else if (card.name === '灾厄旗帜') {
    // 灾厄旗帜：丢弃时回1点血
    const opp = s?.players.find(pl => pl.id !== player.id);
    heal(player, player, 1, s, opp);
    if (s) {
      s.log.push({
        playerId: s.players[s.currentTurnIndex].id,
        message: `${player.name}丢弃了灾厄旗帜，触发效果回复1点血量`,
        segments: [
          [{ type: 'text', text: `${player.name}丢弃`, bold: true },
           { type: 'card', cardId: card.id }],
        ],
        timestamp: Date.now(),
      });
    }
    showTrigger([
      { type: 'card', cardId: card.id },
    ], 'all');
  }else if (card.name === '海洋之心') {
    // 海洋之心：丢弃时触发效果，获得2层护盾
    applyEffectToPlayer(player, BuffType.Shield, 2, undefined, card.id, s, player.id);
    if (s) {
      s.log.push({
        playerId: s.players[s.currentTurnIndex].id,
        message: `${player.name}丢弃了海洋之心，触发效果获得2层护盾`,
        segments: [
          [{ type: 'text', text: `${player.name}丢弃`, bold: true },
           { type: 'card', cardId: card.id },
           { type: 'text', text: '+2' },
           { type: 'buff', buffType: BuffType.Shield }],
        ],
        timestamp: Date.now(),
      });
    }
    showTrigger([
      { type: 'card', cardId: card.id },
      { type: 'text', text: `${player.name}+2` },
      { type: 'buff', buffType: BuffType.Shield },
    ], 'all');
  }else if (card.name === '重生锚') {
    // 重生锚：丢弃时获得重生（持续2回合），抵消下一次致命伤害
    applyEffectToPlayer(player, BuffType.Rebirth, 1, 2, card.id, s, player.id);
    if (s) {
      s.log.push({
        playerId: s.players[s.currentTurnIndex].id,
        message: `${player.name}丢弃了重生锚，触发效果获得重生（持续2回合）`,
        segments: [
          [{ type: 'text', text: `${player.name}丢弃`, bold: true },
           { type: 'card', cardId: card.id },
           { type: 'text', text: '+2回合' },
           { type: 'buff', buffType: BuffType.Rebirth }],
        ],
        timestamp: Date.now(),
      });
    }
    showTrigger([
      { type: 'card', cardId: card.id },
      { type: 'text', text: `${player.name}获得重生` },
      { type: 'buff', buffType: BuffType.Rebirth },
    ], 'all');
  }

  // 烈焰棒：丢弃一张牌可造成2点火焰伤害
  if (player.equipment?.weapon?.name === '烈焰棒' && player.causePhysicalDamageBang && target) {
    damage(player, target, DamageType.Fire, 2, s);
    if (s) {
      s.log.push({
        playerId: s.players[s.currentTurnIndex].id,
        message: `烈焰棒生效：${target.name}受到2点火焰伤害`,
        segments: [
          [{ type: 'card', cardId: player.equipment.weapon.id },
           { type: 'hpChange', playerName: target.name, hpDelta: -2 }],
        ],
        timestamp: Date.now(),
      });
    }
    showTrigger([
      { type: 'card', cardId: player.equipment.weapon.id },
    ], 'all');
  }

  // 全局丢弃buff（绑定诅咒/下界荒地）
  handleDiscardBuffs(player, s);

  //魔咒爆发：丢弃牌时触发魔咒爆发效果（如果有可用层数）
  //主动丢弃（discardFromHand）与被动丢弃（爆牌/刷怪笼条件丢弃/幽匿尖啸体强制弃牌等）统一走 triggerEnchantBurst
  if (!skipEnchantBurst && player.hp > 0) {
    triggerEnchantBurst(s, player, card, target);
  }

  // ===== 未来特殊卡牌的丢弃事件请在此处添加 =====
}

// ===== 丢弃手牌 ===== 
export function discardFromHand(state: GameState, playerId: string, cardId: string, targetId?: string): GameState { 
  let s = deepClone(state); 
  const idx = s.players.findIndex(p => p.id === playerId); 
  if (idx === -1) return s; 
  let player = s.players[idx]; 
  let target = s.players[1 - idx]; 
  const cardIdx = player.hand.findIndex(c => c.id === cardId); 
  if (cardIdx === -1) return s; 
  const [card] = player.hand.splice(cardIdx, 1); 

  // ===== 魔咒爆发触发（主动丢弃：透传所选目标 targetId） =====
  if (triggerEnchantBurst(s, player, card, target, targetId)) {
    player.discardPile.push(card);
    player.lastDiscardedCardDef.push(card);

    // 触发丢弃事件（仙人掌摸牌、烈焰棒、绑定诅咒等）
    // 魔咒爆发已生效，传 true 跳过 triggerDiscardEvents 内的魔咒爆发判定，防止同一次丢弃重复消耗层数
    triggerDiscardEvents(player, card, s, target, true);
    s.players[idx] = player;
    s.players[1 - idx] = target;
    // P0-4：丢弃链路可能致死（绑定诅咒/烈焰棒/幽匿尖啸体），补统一胜负判定
    checkGameOver(s);
    trimLog(s);
    return s; // 触发魔咒爆发后直接返回，不走下面的普通丢弃逻辑
  }
  // =================================

  player.discardPile.push(card); 
  player.lastDiscardedCardDef.push(card);

  // 触发丢弃事件（仙人掌摸牌、烈焰棒、绑定诅咒等）
  triggerDiscardEvents(player, card, s, target); 
  s.players[idx] = player; 
  s.players[1 - idx] = target; 
  s.log.push({
    playerId: s.players[s.currentTurnIndex].id,
    message: `${player.name}丢弃了${card.name}`,
    segments: [
      [{ type: 'text', text: `${player.name}丢弃`, bold: true },
       { type: 'card', cardId: card.id }],
    ],
    timestamp: Date.now(),
  });
  // P0-4：同上，普通丢弃链路也可能致死
  checkGameOver(s);
  trimLog(s);
  return s; 
} 

// ===== 获取对手ID ===== 
export function getOpponentId(state: GameState, playerId: string): string { 
  return state.players.find(p => p.id !== playerId)?.id || ''; 
} 

// ===== 卸下装备 ===== 
export function unequipCard(state: GameState, playerId: string, slot: string): GameState { 
  const s = deepClone(state); 
  const idx = s.players.findIndex(p => p.id === playerId); 
  if (idx === -1) return s; 
  let player = s.players[idx]; 
  const card = player.equipment[slot as keyof typeof player.equipment]; 
  if (!card) return s; 
  const handLimit = DEFAULT_HAND_LIMIT + (player.handLimitBonus || 0);
  const equippedCount = [player.equipment.equip, player.equipment.weapon, player.equipment.field].filter(Boolean).length;
  if (card.name === '村庄') {
    // 村庄卸下时需要清除手牌上限加成
    player.handLimitBonus = 0;
    if (player.hand.length + equippedCount >= handLimit) {
      // 超出手牌上限的部分直接丢弃（进入弃牌堆），触发丢弃事件
      const excessCount = player.hand.length + equippedCount - handLimit;
      const excessCards = player.hand.splice(-excessCount, excessCount);
      s.log.push({
        playerId: s.players[s.currentTurnIndex].id,
        message: `${player.name}卸下村庄，手牌超出上限${excessCount}张`,
        segments: [
          [{ type: 'text', text: `${player.name}卸下村庄`, bold: true },
           { type: 'text', text: `手牌超出上限${excessCount}张` }],
        ],
        timestamp: Date.now(),
      });
      for (const excessCard of excessCards) {
        discardFromHand(s, player.id, excessCard.id);
      }
    }
  }

  delete player.equipment[slot as keyof typeof player.equipment]; 
  // 装备卸下时直接丢弃（进入弃牌堆），触发丢弃事件 
  player.discardPile.push(card); 
  handleDiscardBuffs(player, s); 
  s.players[idx] = player; 
  s.log.push({ 
    playerId: s.players[s.currentTurnIndex].id,
    message: `${player.name}卸下了${card.name}`, 
    timestamp: Date.now(), 
  }); 
  // P0-4：卸装丢弃可能触发绑定诅咒致死
  checkGameOver(s);
  trimLog(s);
  return s; 
} 

// ===== 侦测器：处理权重猜测 ===== 
export function handleGuessWeight(state: GameState, playerId: string, guessWeight: number): GameState { 
  const s = deepClone(state); 
  const idx = s.players.findIndex(p => p.id === playerId); 
  if (idx === -1) return s; 
  const player = s.players[idx]; 
  if (!player.pendingGuessCardId) return s; 
  // P1：猜测的目标牌可能已被偷/弃/触发效果移走，此时猜测语义悬空——提示并清除，不再结算
  const targetPlayer = s.players[1 - idx];
  if (!targetPlayer.hand.some(c => c.id === player.pendingGuessCardId)) {
    player.pendingGuessCardId = '';
    player.pendingGuessCardWeight = 0;
    player.pendingGuessCardName = '';
    s.log.push({
      playerId: s.players[s.currentTurnIndex].id,
      message: `${player.name}要猜测的牌已不在${targetPlayer.name}手中，猜测失效`,
      timestamp: Date.now(),
    });
    trimLog(s);
    return s;
  }
  const correct = player.pendingGuessCardWeight === guessWeight; 
  const msg = correct ? `${player.name}猜中了权重(${guessWeight})！下次物理伤害×1.75` : `${player.name}猜错了权重(${guessWeight})，正确答案是${player.pendingGuessCardWeight}`; 
  if (correct) {
    applyEffectToPlayer(player, BuffType.DamageBoost, 1, undefined, 'detector', s, player.id); 
    showTrigger([
      { type: 'buff', buffType: BuffType.DamageBoost },
      { type: 'text', text: '物理×1.75' },
    ], 'self');
  }
  player.pendingGuessCardId = ''; 
  player.pendingGuessCardWeight = 0; 
  player.pendingGuessCardName = '';
  s.log.push({ 
    playerId: s.players[s.currentTurnIndex].id,
    message: msg, 
    timestamp: Date.now(), 
  }); 
  trimLog(s);
  return s; 
} 


// ===== 运输矿车：处理选牌 ===== 
export function handleDraftPick(state: GameState, playerId: string, cardIndex: number): GameState { 
  const s = deepClone(state); 
  const pickerIdx = s.players.findIndex(p => p.id === playerId); 
  if (pickerIdx === -1) return s; 
  // 选牌数据始终在打出运输矿车的玩家身上 
  const ownerIdx = s.players.findIndex(p => p.draftCards?.length > 0); 
  if (ownerIdx === -1) return s; 
  const owner = s.players[ownerIdx]; 
  if (!owner.draftCards || owner.draftCards.length === 0) return s; 
  // 判断该轮到谁选 
  const isOwnerPick = owner.id === playerId; 
  const expectedPick = isOwnerPick ? 0 : 1; 
  if (owner.draftPlayerPick !== expectedPick) return s; 
  if (cardIndex < 0 || cardIndex >= owner.draftCards.length) return s; 
  if (owner.draftPickedBy && owner.draftPickedBy[cardIndex]) return s; 
  // 牌给当前选牌的玩家 
  const picked = owner.draftCards[cardIndex]; 
  addCardToHand(s.players[pickerIdx], picked, s); 
  // 触发摸牌事件（陷阱箱等）
  triggerDrawEvents(s.players[pickerIdx], picked, s);
  owner.draftPickCount += 1; 
  if (!owner.draftPickedBy) owner.draftPickedBy = {}; 
  owner.draftPickedBy[cardIndex] = s.players[pickerIdx].name; 
  // 切换选牌方 
if (owner.draftPickCount < owner.draftCards.length) {
    owner.draftPlayerPick = 1 - owner.draftPlayerPick; 
  } else { 
    owner.draftCards = []; 
    owner.draftPickedBy = {}; 
    owner.draftPlayerPick = 0; 
    owner.draftPickCount = 0; 
  } 
  s.players[ownerIdx] = owner; 
  s.log.push({ 
    playerId: s.players[s.currentTurnIndex].id,
    message: s.players[pickerIdx].name + "选择了" + picked.name, 
    timestamp: Date.now() 
  }); 
  return s; 
} 

// ===== 蜘蛛网：处理封锁选择 ===== 
export function handleBucketChoice(state: GameState, playerId: string, lockType: string): GameState { 
  const s = deepClone(state); 
  const idx = s.players.findIndex(p => p.id === playerId); 
  if (idx === -1) return s; 
  const player = s.players[idx]; 
  if (player.pendingBucketChoice !== 'pending') return s; 
  const oppIdx = 1 - idx; 
  const opponent = s.players[oppIdx]; 
  // 引擎侧兜底：目标装备海龟壳时免疫蜘蛛网（applyCard 已拦截，这里防御直接调用的路径）
  if (opponent.equipment?.equip?.name === '海龟壳') {
    player.pendingBucketChoice = '';
    s.players[idx] = player;
    s.log.push({
      playerId: s.players[s.currentTurnIndex].id,
      message: `海龟壳免疫蜘蛛网，${opponent.name}未被封锁`,
      timestamp: Date.now(),
    });
    trimLog(s);
    return s;
  }
  if (lockType === 'action') { 
    applyEffectToPlayer(opponent, BuffType.LockAction, 1, 1, 'bucket', s, player.id); 
    s.log.push({ 
      playerId: s.players[s.currentTurnIndex].id, 
      message: `${player.name}封锁了对手的行动牌`, 
      timestamp: Date.now() 
    }); 
    showTrigger([
      { type: 'buff', buffType: BuffType.LockAction },
      { type: 'text', text: `${opponent.name}行动封锁` },
    ], 'all');
  } else if (lockType === 'strategy') {
    applyEffectToPlayer(opponent, BuffType.LockStrategy, 1, 1, 'bucket', s, player.id);
    s.log.push({
      playerId: s.players[s.currentTurnIndex].id,
      message: `${player.name}封锁了对手的锦囊牌`,
      timestamp: Date.now()
    });
    showTrigger([
      { type: 'buff', buffType: BuffType.LockStrategy },
      { type: 'text', text: `${opponent.name}锦囊封锁` },
    ], 'all');
  } 
  player.pendingBucketChoice = '';
  s.players[idx] = player;
  s.players[oppIdx] = opponent;
  return s;
}

// ===== 红石粉：处理限时状态选择（持续时间+1回合） =====
// P1：改用 buffType + sourcePlayerId 定位，而不是数组下标——
// 下标依赖客户端与服务端 buffs 列表逐帧一致，任何中间插入/移除都会选错目标
export function handleRedstoneChoice(state: GameState, playerId: string, buffType: BuffType, sourcePlayerId?: string): GameState {
    const s = deepClone(state);
    const idx = s.players.findIndex(p => p.id === playerId);
    if (idx === -1) return s;
    const player = s.players[idx];
    if (player.pendingRedstoneChoice !== 'pending') return s;
    const targetIdx = s.players.findIndex(p => p.id === player.pendingRedstoneTargetId);
    if (targetIdx === -1) return s;
    const target = s.players[targetIdx];
    const chosen = target.buffs.find(b =>
      b.remainingTurns !== undefined &&
      b.buffType === buffType &&
      b.sourcePlayerId === (sourcePlayerId ?? '')
    );
    if (!chosen || chosen.remainingTurns === undefined) return s;
    const oldTurns = chosen.remainingTurns;
    const newTurns = oldTurns + 1;
    chosen.remainingTurns = newTurns;
    s.log.push({
        playerId: s.players[s.currentTurnIndex].id,
        message: `${player.name}使用红石粉延长了${target.name}的${BUFF_NAMES[chosen.buffType]}1回合`,
        segments: [
            [{ type: 'card', cardId: 'card_47' }, { type: 'buff', buffType: chosen.buffType }, { type: 'text', text: `${oldTurns}→${newTurns}` }],
        ],
        timestamp: Date.now(),
    });
    showTrigger([
        { type: 'card', cardId: 'card_47' }, { type: 'buff', buffType: chosen.buffType }, { type: 'text', text: `${oldTurns}→${newTurns}` },
    ], 'all');
    player.pendingRedstoneChoice = '';
    player.pendingRedstoneTargetId = '';
    s.players[idx] = player;
    s.players[targetIdx] = target;
    trimLog(s);
    return s;
}

// ===== 诡异钓竿：处理装备丢弃 =====
export function handleEquipChoice(state: GameState, playerId: string, slot: string): GameState { 
  let s = deepClone(state); 
  const idx = s.players.findIndex(p => p.id === playerId); 
  if (idx === -1) return s; 
  const player = s.players[idx]; 
  if (player.pendingEquipChoice !== 'pending') return s; 
  const oppIdx = 1 - idx; 
  const opponent = s.players[oppIdx]; 
  const slotKey = slot as keyof typeof opponent.equipment; 
  const card = opponent.equipment[slotKey]; 
  if (!card) { 
    s.log.push({ 
      playerId: s.players[s.currentTurnIndex].id,
      message: '该槽位没有装备', 
      timestamp: Date.now() 
    }); 
    return s; 
  } 
  s.log.push({ 
    playerId: s.players[s.currentTurnIndex].id,
    message: `诡异钓竿触发！`, 
    timestamp: Date.now() 
  }); 
  s = unequipCard(s, opponent.id, slot);
  player.pendingEquipChoice = '';
  player.pendingEquipCard = undefined; // 清除存储的卡牌
  s.players[idx] = player;
  return s;
}

// ===== 诡异钓竿：取消选择，返还卡牌 =====
export function cancelEquipChoice(state: GameState, playerId: string): GameState {
  let s = deepClone(state);
  const idx = s.players.findIndex(p => p.id === playerId);
  if (idx === -1) return s;
  const player = s.players[idx];
  if (player.pendingEquipChoice !== 'pending') return s;

  // 返还打出的卡牌到手牌（直接加入，不走 drawCards）
  if (player.pendingEquipCard) {
    const returnedCard: CardDef = {
      ...player.pendingEquipCard,
      // 用确定性实例 ID（randomUUID），避免 Date.now 碰撞/非确定
      id: generateCardInstanceId(player.pendingEquipCard.id, 'return'),
    };
    addCardToHand(player, returnedCard, s);
    player.pendingEquipCard = undefined;
  }

  // 返还消耗次数（诡异钓竿是锦囊牌，取消时应该退回 1 次）
  if (player.actionStrategyCountThisTurn > 0) {
    player.actionStrategyCountThisTurn -= 1;
  }

  player.pendingEquipChoice = '';
  s.players[idx] = player;

  s.log.push({
    playerId: s.players[s.currentTurnIndex].id,
    message: '诡异钓竿取消，卡牌已返还',
    timestamp: Date.now(),
  });

  return s;
} 

// ===== 酿造台：处理卡牌转化 ===== 
export function handleBrewConversion(state: GameState, playerId: string, cardId: string): GameState { 
  const s = deepClone(state); 
  const idx = s.players.findIndex(p => p.id === playerId); 
  if (idx === -1) return s; 
  const player = s.players[idx]; 
  if (player.equipment?.weapon?.name !== '酿造台') return s; 
  const cardIdx = player.hand.findIndex(c => c.id === cardId); 
  if (cardIdx === -1) return s; 
  const card = player.hand[cardIdx]; 
  let targetName: string; 
  // 原有功能：苹果 <-> 烟花 
  if (card.name === '苹果') targetName = '烟花'; 
  else if (card.name === '烟花') targetName = '苹果'; 
  // 新增功能：龙息 <-> 金苹果 
  else if (card.name === '龙息') targetName = '金苹果'; 
  else if (card.name === '金苹果') targetName = '龙息'; 
  else return s; 
  const template = CARDS.find(c => c.name === targetName); 
  if (!template) return s; 
  // 用确定性实例 ID（randomUUID），避免 Date.now 碰撞/非确定
  player.hand[cardIdx] = { ...template, id: generateCardInstanceId(template.id, 'brew') }; 
  s.log.push({ 
    playerId: s.players[s.currentTurnIndex].id,
    message: `酿造台：将1张${card.name}转化为${targetName}`, 
    timestamp: Date.now() 
  }); 
  trimLog(s);
  return s; 
}

// ===== 投降 =====
export function surrender(state: GameState, playerId: string): GameState {
  const s = deepClone(state);
  if (s.phase !== GamePhase.Playing) return s;
  const idx = s.players.findIndex(p => p.id === playerId);
  if (idx === -1) return s;
  s.phase = GamePhase.GameOver;
  s.winnerId = s.players[1 - idx].id;
  showMessage(`${s.players[idx].name}投降了，${s.players[1 - idx].name}获胜！`, 'all');
  s.log.push({
    playerId: s.players[s.currentTurnIndex].id,
    message: `${s.players[idx].name}投降了`,
    timestamp: Date.now(),
  });
  return s;
}
