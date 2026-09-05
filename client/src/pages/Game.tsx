import { useState, useCallback, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useGameStore } from '../store/gameStore';
import { CardDef, GamePhase, CostType, COST_TYPE_NAMES, BUFF_NAMES, ContentSegment } from '@shared/types';
import PlayerInfo from '../components/PlayerInfo';
import PlayerHand from '../components/PlayerHand';
import ActionBar from '../components/ActionBar';
import NotificationToast from '../components/NotificationToast';
import { displayMessage } from '../store/notificationStore';
import { getCardImageUrl } from '../utils/cardImage';
import SelectedCardDetail from '../components/SelectedCardDetail';
import { useTriggerStore } from '../store/triggerStore';
import CardActionPanel from '../components/CardActionPanel';
import ConsumptionCounter from '../components/ConsumptionCounter';
import EquipmentDisplay from '../components/EquipmentDisplay';
import PlayedCardOverlay from '../components/PlayedCardOverlay';
import TriggerEffectPanel from '../components/TriggerEffectPanel';
import DebugDrawButton from '../components/DebugDrawButton';
import GameLogPanel from '../components/GameLogPanel';
import BuffBadge from '../components/BuffBadge';
import CollectionModal from '../components/CollectionModal';
import RulesModal from '../components/RulesModal';
import { BUFF_ICON_MAP } from '../components/BuffCollection';
import { useSettingsStore } from '../store/settingsStore';
import ChoiceDialog from '../components/ChoiceDialog';
import { useChoiceModal } from '../hooks/useChoiceModal';
import SettingsModal from '../components/SettingsModal';

export default function Game() {
  const { playCard, endTurn, discardCard, unequipCard, disconnect, guessWeight, draftPick, bucketChoice, equipChoice, cancelEquipChoice, brewChoice, blazeDiscard, debugDrawCard, rematchRequest, rematchAccept, rematchDecline, surrender, redstoneChoice } = useSocket();
  const { gameState, player, isMyTurn, rematchState, rematchRequesterName, opponentDisconnected } = useGameStore();
  const cardOverlayDuration = useSettingsStore((s) => s.cardOverlayDuration);
  const playedCardHint = useSettingsStore((s) => s.playedCardHint);

  const [selectedCard, setSelectedCard] = useState<CardDef | null>(null);
  const [pending, setPending] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showGameLog, setShowGameLog] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [handCollapsed, setHandCollapsed] = useState(false);
  const [recentPlayedCard, setRecentPlayedCard] = useState<{ card: CardDef; playerName: string; key: number; variant: 'self' | 'opponent' | 'discard'; fromOpponent: boolean } | null>(null);
  const playedCardTimer = useRef<ReturnType<typeof setTimeout>>();
  const playedCardKey = useRef(0);

  // 交互弹窗状态
  const [showGuessDialog, setShowGuessDialog] = useState(false);
  const [guessInput, setGuessInput] = useState('');
  const [showEnchantDialog, setShowEnchantDialog] = useState(false);
  const [enchantableCards, setEnchantableCards] = useState<CardDef[]>([]);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftCardsList, setDraftCardsList] = useState<CardDef[]>([]);
  const [showBucketDialog, setShowBucketDialog] = useState(false);
  const [showEquipDialog, setShowEquipDialog] = useState(false);
  const [showRedstoneDialog, setShowRedstoneDialog] = useState(false);

  // Ref 守卫——确保弹窗只触发一次
  const shownGuess = useRef(false);
  const shownEnchant = useRef(false);
  const shownDraft = useRef(false);
  const shownBucket = useRef(false);
  const shownEquip = useRef(false);
  const shownRedstone = useRef(false);
  const shownEnchantReady = useRef(false);

  const me = gameState?.players.find(p => p.id === player?.id);
  const opponent = gameState?.players.find(p => p.id !== player?.id);

  // 检测需要显示的交互弹窗
  useEffect(() => {
    if (!me) return;

    // 状态清空时重置 ref（避免下次无法弹窗）
    if (!me.pendingGuessCardId) shownGuess.current = false;
    if (!opponent?.pendingBucketChoice) shownBucket.current = false;
    if (!me.draftCards?.length) shownDraft.current = false;

    // 侦测器：有待猜的牌
    if (me.pendingGuessCardId && !shownGuess.current) {
      shownGuess.current = true;
      setShowGuessDialog(true);
      setGuessInput('');
    }

    // 附魔台：日志中有"附魔台触发"提示时
    const lastLog = gameState?.log?.[gameState.log.length - 1]?.message || '';
    if (lastLog.includes('附魔台触发') && isMyTurn && !shownEnchant.current) {
      const checkTypes = [CostType.Heal, CostType.Attack, CostType.Buff, CostType.Debuff];
      const played = me.playedCardTypesThisTurn || [];
      const missingType = checkTypes.find(ct => !played.includes(ct));
      if (missingType && me.hand) {
        // 通过 icon 前缀匹配类型（costType 已不再区分回血/攻击/增益/减益/事件）
        const iconPrefixForType: Partial<Record<CostType, number>> = {
          [CostType.Heal]: 3,
          [CostType.Attack]: 4,
          [CostType.Buff]: 5,
          [CostType.Debuff]: 6,
          [CostType.Event]: 7,
        };
        const validCards = me.hand.filter(c => {
          if (c.costType === missingType) return true;
          const prefix = iconPrefixForType[missingType];
          if (prefix) {
            const parts = c.icon.split(',').map(Number);
            return parts.slice(0, -1).includes(prefix);
          }
          return false;
        });
        if (validCards.length > 0) {
          shownEnchant.current = true;
          setEnchantableCards(validCards);
          setShowEnchantDialog(true);
        }
      }
    }
    if (!lastLog.includes('请丢弃一张')) shownEnchant.current = false;

    // 运输矿车：有待选牌
    if (me.draftCards && me.draftCards.length > 0 && !shownDraft.current) {
      shownDraft.current = true;
      setDraftCardsList(me.draftCards);
      setShowDraftDialog(true);
    }
    // 运输矿车：选牌结束（draftCards 清空时关闭弹窗）
    if ((!me.draftCards || me.draftCards.length === 0) && showDraftDialog) {
      setShowDraftDialog(false);
      setDraftCardsList([]);
    }

    // 蜘蛛网：选择封锁类型
    if (me?.pendingBucketChoice === 'pending' && !shownBucket.current) {
      shownBucket.current = true;
      setShowBucketDialog(true);
    }
    if (!me?.pendingBucketChoice) shownBucket.current = false;

    // 诡异钓竿：选择装备
    if (me?.pendingEquipChoice === 'pending' && !shownEquip.current) {
      shownEquip.current = true;
      setShowEquipDialog(true);
    }
    if (!me?.pendingEquipChoice) shownEquip.current = false;

    // 红石粉：选择限时状态
    if (me?.pendingRedstoneChoice === 'pending' && !shownRedstone.current) {
      shownRedstone.current = true;
      setShowRedstoneDialog(true);
    }
    if (!me?.pendingRedstoneChoice) shownRedstone.current = false;

    // 运输矿车：有 draftCards 时重置 ref 让弹窗可以重新显示
    if (me.draftCards && me.draftCards.length > 0 && shownDraft.current && !showDraftDialog) {
      shownDraft.current = false;
    }

    // 附魔台：满足条件时 toast 提示（已弃置）
    const checkTypes = [CostType.Heal, CostType.Attack, CostType.Buff, CostType.Debuff, CostType.Event];
    const played = me.playedCardTypesThisTurn || [];
    const matchedCount = checkTypes.filter(ct => played.includes(ct)).length;
    const hasEnchantInHand = me.hand.some(c => c.name === '附魔台');
  }, [me, opponent, gameState, isMyTurn, showDraftDialog]);

  // 组件内：
  const { request, visible, dismiss } = useChoiceModal(gameState, me, opponent, isMyTurn);

  // id → socket 的映射：新增弹窗只需要加一行
const submitChoice = useCallback(async (key: string) => {
  if (!request) return;
  const SUBMITTERS: Record<string, (k: string) => Promise<unknown>> = {
      guess: k => guessWeight(Number(k)),
      enchant: k => discardCard(k),
      draft: k => draftPick(Number(k)),
      bucket: k => bucketChoice(k as 'action' | 'strategy'),
      equip: k => equipChoice(k as 'equip' | 'weapon' | 'field'),
      redstone: k => redstoneChoice(k.split(':')[0], k.split(':')[1] || ''),
    };
  setPending(true);
  await SUBMITTERS[request.id]?.(key);
  setPending(false);
}, [request, guessWeight, discardCard, draftPick, bucketChoice, equipChoice, redstoneChoice]);

  // 显示提示（3秒自动消失）
  const showToast = useCallback((msg: string) => {
    displayMessage(msg);
  }, []);

  // 游戏结束处理
  useEffect(() => {
    if (gameState?.phase === GamePhase.GameOver) {
      const timer = setTimeout(() => setShowResult(true), 600);
      return () => clearTimeout(timer);
    } else {
      setShowResult(false);
    }
  }, [gameState?.phase]);

  // 取消选中
  const doDeselect = useCallback(() => {
    setSelectedCard(null);
  }, []);

  const toggleHand = useCallback(() => {
  setHandCollapsed(prev => {
    if (prev) {
      // 展开时不清除选中
    } else {
      setSelectedCard(null); // 收起时取消选中
    }
    return !prev;
  });
}, []);

  // 点击空白取消选中
  const handleAreaClick = useCallback(() => {
    setSelectedCard(null);
  }, []);

  // 回合开始时自动展开手牌
  const prevTurnRef = useRef(isMyTurn);
useEffect(() => {
  if (isMyTurn && !prevTurnRef.current) {
    setHandCollapsed(false); // 回合开始自动展开手牌
  }
  prevTurnRef.current = isMyTurn;
}, [isMyTurn]);

  // 出牌动画（双方打出都显示）
  const prevPlayedLenRef = useRef<{ me: number; opp: number; meDiscard: number; oppDiscard: number }>({ me: 0, opp: 0, meDiscard: 0, oppDiscard: 0 });
  useEffect(() => {
    const myLen = me?.lastPlayedCardDef?.length ?? 0;
    const oppLen = opponent?.lastPlayedCardDef?.length ?? 0;
    const myDiscardLen = me?.lastDiscardedCardDef?.length ?? 0;
    const oppDiscardLen = opponent?.lastDiscardedCardDef?.length ?? 0;
    const prev = prevPlayedLenRef.current;

    // 检测是否有新丢弃的牌（优先级高于打出，因为同一帧不可能既打出又丢弃）
    let newCard: { card: CardDef; playerName: string; variant: 'self' | 'opponent' | 'discard'; fromOpponent: boolean } | null = null;
    if (myDiscardLen > prev.meDiscard && me?.lastDiscardedCardDef?.length) {
      const latest = me.lastDiscardedCardDef[myDiscardLen - 1];
      if (latest?.name) newCard = { card: latest, playerName: me.name, variant: 'discard', fromOpponent: false };
    } else if (oppDiscardLen > prev.oppDiscard && opponent?.lastDiscardedCardDef?.length) {
      const latest = opponent.lastDiscardedCardDef[oppDiscardLen - 1];
      if (latest?.name) newCard = { card: latest, playerName: opponent.name, variant: 'discard', fromOpponent: true };
    } else if (myLen > prev.me && me?.lastPlayedCardDef?.length) {
      const latest = me.lastPlayedCardDef[myLen - 1];
      const selfTarget = me.lastPlayedCardSelfTarget?.[myLen - 1];
      if (latest?.name) newCard = { card: latest, playerName: me.name, variant: selfTarget ? 'self' : 'opponent', fromOpponent: false };
    } else if (oppLen > prev.opp && opponent?.lastPlayedCardDef?.length) {
      const latest = opponent.lastPlayedCardDef[oppLen - 1];
      const selfTarget = opponent.lastPlayedCardSelfTarget?.[oppLen - 1];
      if (latest?.name) newCard = { card: latest, playerName: opponent.name, variant: selfTarget ? 'self' : 'opponent', fromOpponent: true };
    }

    if (newCard) {
      if (playedCardHint === 'toast') {
        // 提示框模式：用 displayMessage 弹出"谁 打出了/丢弃了 什么牌"（文字 + 卡图 segment）
        const who = !newCard.fromOpponent ? '你' : '对手';
        const action = newCard.variant === 'discard' ? '丢弃了' : '打出了';
        const segments: ContentSegment[] = [
          { type: 'text', text: who },
          { type: 'text', text: `${action} ` },
          { type: 'card', cardId: newCard.card.id },
        ];
        displayMessage(`${who} ${action} ${newCard.card.name}`, segments);
      } else {
        // 卡片模式：弹出完整卡牌 Overlay（默认）
        playedCardKey.current += 1;
        setRecentPlayedCard({ ...newCard, key: playedCardKey.current });
        if (playedCardTimer.current) clearTimeout(playedCardTimer.current);
        playedCardTimer.current = setTimeout(() => setRecentPlayedCard(null), cardOverlayDuration);
      }
    }

    // 游戏重置时长度归零，同步重置 ref
    prevPlayedLenRef.current = { me: myLen, opp: oppLen, meDiscard: myDiscardLen, oppDiscard: oppDiscardLen };
  }, [me?.lastPlayedCardDef?.length, opponent?.lastPlayedCardDef?.length, me?.lastDiscardedCardDef?.length, opponent?.lastDiscardedCardDef?.length, playedCardHint]);

  // 选牌
  const handleSelectCard = useCallback((card: CardDef) => {
    if (!isMyTurn || pending || !gameState || !opponent) return;
    setSelectedCard(prev => prev?.id === card.id ? null : card);
  }, [isMyTurn, pending, gameState, opponent]);

  // 关闭打出提示：同时关闭打出卡牌提示窗口、打出效果窗口、对手卡牌详情弹窗
  const handleOverlayClose = useCallback(() => {
    if (playedCardTimer.current) clearTimeout(playedCardTimer.current);
    setRecentPlayedCard(null);
    useTriggerStore.getState().clearTriggers();
  }, []);

  // 出牌
  const handlePlayCard = useCallback(async (targetId: string) => {
    if (!selectedCard || !isMyTurn || pending) return;
    setPending(true);
    const res = await playCard(selectedCard.id, targetId);
    if (!res.success && res.error) showToast(res.error);
    setSelectedCard(null);
    setPending(false);
  }, [selectedCard, isMyTurn, playCard, pending, showToast]);

  // 丢弃
  const handleDiscard = useCallback(async (target: 'opponent' | 'self') => {
    if (!selectedCard || pending || !me || !opponent) return;
    const targetId = target === 'opponent' ? opponent.id : me.id;
    setPending(true);
    const res = await discardCard(selectedCard.id, targetId);
    if (!res.success && res.error) showToast(res.error);
    setSelectedCard(null);
    setPending(false);
  }, [selectedCard, discardCard, pending, showToast, opponent, me]);

  // 结束回合
  const handleEndTurn = useCallback(async () => {
    if (!isMyTurn || pending) return;
    setPending(true);
    const res = await endTurn();
    if (!res.success && res.error) showToast(res.error);
    setSelectedCard(null);
    setPending(false);
  }, [isMyTurn, endTurn, pending, showToast]);

  // 蜘蛛网
  const handleBucketLock = useCallback(async (lockType: 'action' | 'strategy') => {
    setShowBucketDialog(false);
    setPending(true);
    await bucketChoice(lockType);
    setPending(false);
  }, [bucketChoice]);

  // 酿造台转化
  const handleBrewConvert = useCallback(async () => {
    if (!selectedCard) return;
    setPending(true);
    await brewChoice(selectedCard.id);
    setSelectedCard(null);
    setPending(false);
  }, [selectedCard, brewChoice]);

  const handleEquipSelect = useCallback(async (slot: string) => {
    setShowEquipDialog(false);
    setPending(true);
    await equipChoice(slot);
    setPending(false);
  }, [equipChoice]);

  // 诡异钓竿：取消选择，返还卡牌
  const handleEquipCancel = useCallback(async () => {
    setShowEquipDialog(false);
    setPending(true);
    await cancelEquipChoice();
    setPending(false);
  }, [cancelEquipChoice]);

  // 红石粉：选择限时状态（P1：按 buffType + sourcePlayerId 定位，不再传数组下标）
  const handleRedstoneSelect = useCallback(async (buffType: string, sourcePlayerId?: string) => {
    setShowRedstoneDialog(false);
    setPending(true);
    await redstoneChoice(buffType, sourcePlayerId || '');
    setPending(false);
  }, [redstoneChoice]);

  // 回大厅
  const handleBackToLobby = useCallback(() => {
    disconnect();
    // 主动离开：清掉断线重连存档，避免 reload 后 connect 读到残留 gamePlayer 自动 rejoin 回旧房间
    localStorage.removeItem('gamePlayer');
    window.location.reload();
  }, [disconnect]);

  // 兼容移动端的复制
  const copyText = async (text: string): Promise<boolean> => {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; } catch { /* 回退 */ }
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  };

  // 再战
  const [rematchPending, setRematchPending] = useState(false);
  const handleRematchRequest = useCallback(async () => {
    setRematchPending(true);
    const res = await rematchRequest();
    setRematchPending(false);
    if (res.success) {
      useGameStore.getState().setRematchState('requested');
    } else {
      showToast(res.error || '请求失败');
    }
  }, [rematchRequest, showToast]);

  const handleRematchAccept = useCallback(async () => {
    await rematchAccept();
  }, [rematchAccept]);

  const handleRematchDecline = useCallback(async () => {
  try {
    await rematchDecline(); // 尽力发出拒绝消息
  } catch (err) {
    console.error('发送拒绝消息失败', err);
  } finally {
    handleBackToLobby(); // 无论成功与否都返回大厅
  }
}, [rematchDecline, handleBackToLobby]);

  // 侦测器
  const handleGuessSubmit = useCallback(async () => {
    const guess = parseInt(guessInput);
    if (isNaN(guess) || guess < 0) { showToast('请输入有效数字'); return; }
    setShowGuessDialog(false);
    setPending(true);
    await guessWeight(guess);
    setPending(false);
    setGuessInput('');
  }, [guessInput, guessWeight, showToast]);

  // 附魔台选牌
  const handleEnchantSelect = useCallback(async (cardId: string) => {
    setShowEnchantDialog(false);
    setEnchantableCards([]);
    setPending(true);
    await discardCard(cardId);
    setPending(false);
  }, [discardCard]);

  // 运输矿车
  const handleDraftSelect = useCallback(async (index: number) => {
    setShowDraftDialog(false);
    setDraftCardsList([]);
    setPending(true);
    await draftPick(index);
    setPending(false);
  }, [draftPick]);

  if (!gameState || !me || !opponent) {
    return (
      <div className="min-h-viewport flex items-center justify-center bg-page-bg">
        <span className="text-text-secondary/60">加载中...</span>
      </div>
    );
  }

  const iWin = gameState.winnerId === player?.id;

  function isCardExhausted(card: CardDef): boolean {
    if (!me) return true;
    if (card.costType === CostType.Action || card.costType === CostType.Strategy) {
      const poolLimit = 5 + (me.actionLimitBonus || 0);
      if ((me.actionStrategyCountThisTurn || 0) >= poolLimit) return true;
    }
    return false;
  }

  /* 结束出牌按钮高亮条件：手牌为空，或行动/锦囊次数耗尽 */
  const poolLimit = 5 + (me.actionLimitBonus || 0);
  const countsExhausted = (me.actionStrategyCountThisTurn || 0) >= poolLimit;
  const noMovesLeft = me.hand.length === 0 || countsExhausted;

  const hasBrew = !!(selectedCard && (selectedCard.name === '苹果' || selectedCard.name === '烟花' || selectedCard.name === '金苹果' || selectedCard.name === '龙息') &&
    me?.equipment?.weapon?.name === '酿造台');

  // 手牌+装备计数和颜色阈值
  const meequipCount = (me.equipment?.equip ? 1 : 0) + (me.equipment?.weapon ? 1 : 0) + (me.equipment?.field ? 1 : 0);
  const oppequipCount = (opponent.equipment?.equip ? 1 : 0) + (opponent.equipment?.weapon ? 1 : 0) + (opponent.equipment?.field ? 1 : 0);
  const totalCardCount = me.hand.length + meequipCount;
  const hasVillage = me.equipment?.field?.name === '村庄';
  const hasLeatherBoots = me.equipment?.equip?.name === '皮革鞋子';
  const cardThresholdA = 7 + (hasVillage ? 4 : 0) - (hasLeatherBoots ? 1 : 0);
  const cardThresholdB = 9 + (hasVillage ? 4 : 0);
  

  const cardTier = totalCardCount === 0 ? 'green'
    : totalCardCount <= cardThresholdA ? 'black'
    : totalCardCount <= cardThresholdB ? 'yellow'
    : 'red';

  const cardBtnColors: Record<string, { collapsed: string; expanded: string }> = {
    green:  { collapsed: 'bg-green-100/80 border-green-300/60 text-green-600 hover:bg-green-200/80',           expanded: 'bg-green-500/15 border-green-500/30 text-green-600 hover:bg-green-500/25' },
    black:  { collapsed: 'bg-gray-200/80 border-gray-300/60 text-text-primary hover:bg-gray-200',              expanded: 'bg-card-bg/70 border-card-border/50 text-text-primary hover:bg-card-bg hover:border-card-border' },
    yellow: { collapsed: 'bg-yellow-100/80 border-yellow-300/60 text-accent-equip hover:bg-yellow-200/80',    expanded: 'bg-yellow-500/15 border-yellow-500/30 text-accent-equip hover:bg-yellow-500/25' },
    red:    { collapsed: 'bg-red-100/80 border-red-300/60 text-accent-attack hover:bg-red-200/80',             expanded: 'bg-red-500/15 border-red-500/30 text-accent-attack hover:bg-red-500/25' },
  };
  const cardBtnColor = handCollapsed ? cardBtnColors[cardTier].collapsed : cardBtnColors[cardTier].expanded;

  return (
    <div className="h-viewport flex flex-col bg-page-bg overflow-hidden" onClick={handleAreaClick}>
      <NotificationToast />

      {/* 对手打出/丢弃牌时的卡牌详情弹窗（右上角，与打出提示同步出现/消失） */}
      {recentPlayedCard?.fromOpponent && (
        <div
          key={`detail-${recentPlayedCard.key}`}
          className="fixed top-14 right-2 z-50 pointer-events-none"
          style={{ animation: `cardFlyIn 0.4s ease-out both, cardFadeOut 0.5s ease-in ${(cardOverlayDuration - 400) / 1000}s both` }}
        >
          <SelectedCardDetail card={recentPlayedCard.card} />
        </div>
      )}

      {/* ===== 新增：对手掉线遮罩 ===== */}
        {opponentDisconnected && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                <div className="text-5xl mb-4 animate-bounce">⚠️</div>
                <div className="text-2xl font-bold mb-4">对手已断开连接</div>
                <div className="text-sm opacity-80 mb-6">等待对方重连中...</div>
                {/* 房间号 + 昵称，各自带复制按钮 */}
                <div className="flex flex-col gap-2 mb-6 w-72">
                  {[
                    { label: '房间号', value: gameState?.roomId ?? '' },
                    { label: '我的昵称', value: me?.name ?? player?.name ?? '' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-xl px-3 py-2">
                      <span className="text-xs text-white/60 shrink-0">{label}</span>
                      <span className="text-sm font-semibold text-white flex-1 truncate">{value}</span>
                      <button
                        onClick={async () => {
                          const ok = await copyText(value);
                          if (ok) displayMessage('已复制');
                          else displayMessage('复制失败，请手动选中复制');
                        }}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:scale-90 transition-all text-xs"
                      >
                        📋
                      </button>
                    </div>
                  ))}
                </div>
                <button
                    onClick={handleBackToLobby}
                    className="px-6 py-2.5 rounded-xl bg-white/15 border border-white/25 text-white font-semibold text-sm hover:bg-white/25 transition-colors"
                >
                    返回大厅
                </button>
            </div>
      )}

      {/* 顶部对手栏 */}
<div className="flex items-center justify-between h-12 shrink-0 px-4 border-b border-card-border/30 bg-page-dark/20" onClick={e => e.stopPropagation()}>
  <PlayerInfo player={opponent} isOpponent />
  <div className="flex items-center gap-1">
    <span className="text-xs">🃏</span>
    <span className="text-xs font-semibold text-text-primary tabular-nums">{opponent.hand.length}+{oppequipCount}</span>
  </div>
</div>


      {/* 对手装备区 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 overflow-hidden p-2" onClick={e => e.stopPropagation()}>
        <EquipmentDisplay equipment={opponent.equipment} isOpponent />
        <div className="flex items-center gap-1 flex-wrap">
          {opponent.buffs.map((buff, i) => <BuffBadge key={`${buff.buffType}-${i}`} buff={buff} compactMode={opponent.buffs.length > 4} />)}
        </div>
        {recentPlayedCard ? (
          <PlayedCardOverlay key={recentPlayedCard.key} card={recentPlayedCard.card} playerName={recentPlayedCard.playerName} variant={recentPlayedCard.variant} onClose={handleOverlayClose}>
            <TriggerEffectPanel isMyTurn={isMyTurn} myName={me.name} />
          </PlayedCardOverlay>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
            <TriggerEffectPanel isMyTurn={isMyTurn} myName={me.name} />
          </div>
        )}
      </div>

      {/* 中间操作区 */}
<div className="relative flex items-center justify-center gap-4 h-14 shrink-0 border-y border-card-border/20 bg-page-dark/10 px-4" onClick={e => e.stopPropagation()}>
 {/* 记录按钮 — 左侧（非我方回合时提升存在感） */}
<button
  onClick={(e) => { e.stopPropagation(); setShowGameLog(true); }}
  className={`absolute left-3 z-10 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition-all duration-300 active:scale-95 ${
    isMyTurn
      ? 'text-text-secondary/60 hover:bg-card-border/15 hover:text-text-secondary'
      : 'border border-card-border/40 bg-card-bg/60 text-text-secondary shadow-sm backdrop-blur-sm hover:bg-card-bg hover:text-text-primary'
  }`}
  title="对局记录"
>
  <span className={`text-xs leading-none transition-opacity duration-300 ${isMyTurn ? 'opacity-70' : 'opacity-100'}`}>📋</span>
  <span>记录</span>
</button>

{/* 选项按钮 — 右侧（非我方回合时提升存在感） */}
<button
  onClick={(e) => { e.stopPropagation(); setShowOptions(true); }}
  className={`absolute right-3 z-10 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition-all duration-300 active:scale-95 ${
    isMyTurn
      ? 'text-text-secondary/60 hover:bg-card-border/15 hover:text-text-secondary'
      : 'border border-card-border/40 bg-card-bg/60 text-text-secondary shadow-sm backdrop-blur-sm hover:bg-card-bg hover:text-text-primary'
  }`}
  title="选项"
>
  <span className={`text-xs leading-none transition-opacity duration-300 ${isMyTurn ? 'opacity-70' : 'opacity-100'}`}>⚙️</span>
  <span>选项</span>
</button>
        <ActionBar isMyTurn={isMyTurn} onEndTurn={handleEndTurn} pending={pending} noMovesLeft={noMovesLeft} />
        {isMyTurn && <ConsumptionCounter player={me} />}
        {/* 调试摸牌：隐藏渲染，通过头像点击触发 */}
        <div id="debug-draw-btn" className="hidden">
          <DebugDrawButton onDebugDraw={debugDrawCard} />
        </div>
      </div>

      {/* 我方装备区 */}
      {/* 修改：添加 relative 和动态 z-index，手牌收起时 z-40 保证可点击，展开时 z-10 保证手牌在上层 */}
      <div 
        className={`flex-1 flex flex-col items-center justify-center gap-2 overflow-hidden p-2 relative ${handCollapsed ? 'z-40' : 'z-10'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 flex-wrap">
          {me.buffs.map((buff, i) => <BuffBadge key={`${buff.buffType}-${i}`} buff={buff} compactMode={me.buffs.length > 4} />)}
        </div>
        <EquipmentDisplay equipment={me.equipment} onUnequip={unequipCard} />
      </div>

      {/* ===== 底部：手牌区 + 玩家信息栏（一体化） ===== */}
      {/* 修改：底部容器 z-index 保持为 30 */}
      <div className="shrink-0 relative z-30" onClick={e => e.stopPropagation()}>
        {/* 手牌区 — 绝对定位在玩家信息栏正上方 */}
        <div className="absolute bottom-full left-0 right-0">
          <PlayerHand
            cards={me.hand}
            player={me}
            disabled={!isMyTurn || pending}
            selectedCardId={selectedCard?.id ?? null}
            onSelectCard={handleSelectCard}
            collapsed={handCollapsed}
            onToggle={toggleHand}
          />
        </div>

      {/* 玩家信息栏 */}
      <div className="flex items-center justify-between py-2 px-3 bg-page-bg/95 backdrop-blur-sm border-t border-card-border/20">
      <PlayerInfo player={me} onAvatarClick={() => {
        const btn = document.querySelector('#debug-draw-btn > button') as HTMLButtonElement | null;
        btn?.click();
      }} />
      {/* 手牌展开/收起按钮 — 数字为手牌+装备，颜色按总卡牌量和装备计算 */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleHand(); }}
        className={`group relative z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all duration-300 shadow-sm ${cardBtnColor}`}
        title={handCollapsed ? '展开手牌' : '收起手牌'}
      >
        <span className="text-sm leading-none">🃏</span>
        <span className="text-xs font-bold tabular-nums">{me.hand.length}+{meequipCount}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-300 ${handCollapsed ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
</div>

      {/* ===== 固定覆盖层 ===== */}

      {/* 选中牌图鉴（左上） */}
      {selectedCard && (
        <div className="fixed right-2 top-12 z-40" onClick={e => e.stopPropagation()}>
          <SelectedCardDetail card={selectedCard} />
        </div>
      )}

      {/* 操作按钮（右边缘竖列） */}
      {selectedCard && isMyTurn && (
        <div className="fixed right-2 top-1/2 -translate-y-1/2 z-40" onClick={e => e.stopPropagation()}>
          <div className="animate-fade-in">
            <CardActionPanel card={selectedCard} isMyTurn={isMyTurn} pending={pending}
            isExhausted={isCardExhausted} hasBrew={hasBrew}
            onPlayOnOpponent={() => handlePlayCard(opponent.id)}
            onPlayOnSelf={() => handlePlayCard(me.id)}
            onDiscard={handleDiscard} onDeselect={doDeselect}
            onBrewConvert={handleBrewConvert} />
          </div>
        </div>
      )}

      {/* 次数耗尽提示 */}
      {selectedCard && isCardExhausted(selectedCard) && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in pointer-events-none">
          <div className="bg-white border border-accent-equip/30 rounded-xl px-5 py-3 shadow-lg text-sm text-accent-equip font-medium">⚠️ 本回合行动/锦囊次数已用完</div>
        </div>
      )}

      {/* 对局日志面板 */}
      {showGameLog && <GameLogPanel log={gameState.log} onClose={() => setShowGameLog(false)} myPlayerId={me.id} />}

      {/* ===== 游戏结束弹窗 ===== */}
      {showResult && gameState?.phase === GamePhase.GameOver && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={handleAreaClick}>
          <div className="bg-card-bg border border-card-border rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">{iWin ? '🎉' : '😢'}</div>
            <h2 className="text-xl font-bold text-text-primary mb-2">{iWin ? '恭喜获胜！' : '战败'}</h2>
            <p className="text-text-secondary text-sm mb-6">{iWin ? `你击败了 ${opponent.name}！` : `${opponent.name} 击败了你`}</p>
            <div className="flex gap-2">
              {rematchState === 'requested' ? (
                <button disabled className="flex-1 py-2.5 rounded-xl bg-accent-equip/15 border border-accent-equip/25 text-accent-equip font-semibold text-sm opacity-60 cursor-not-allowed">
                  ⏳ 等待对方接受...
                </button>
              ) : (
                <button onClick={handleRematchRequest} disabled={rematchPending} className="flex-1 py-2.5 rounded-xl bg-accent-equip/15 border border-accent-equip/25 text-accent-equip font-semibold text-sm hover:bg-accent-equip/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {rematchPending ? '⏳' : '⚔️'} 再战
                </button>
              )}
              <button onClick={handleBackToLobby} className="flex-1 py-2.5 rounded-xl bg-accent-shield/15 border border-accent-shield/25 text-accent-shield font-semibold text-sm hover:bg-accent-shield/25 transition-colors">返回大厅</button>
            </div>
            {rematchState === 'declined' && (
              <p className="text-xs text-accent-attack/70 mt-3 animate-fade-in">对方拒绝了再战请求</p>
            )}
          </div>
        </div>
      )}

      {/* JSX 中（替代原来的 InteractionModal）：*/}
{visible && (
  <ChoiceDialog
    request={visible}
    onSubmit={submitChoice}
    onDismiss={dismiss}
    onCancelServer={async () => { setPending(true); await cancelEquipChoice(); setPending(false); }}
    busy={pending}
  />
)}

      {/* ===== 再战邀请弹窗 ===== */}
      {rematchState === 'invited' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl text-center">
            <div className="text-4xl mb-3">⚔️</div>
            <h3 className="text-lg font-bold text-text-primary mb-2">再战邀请</h3>
            <p className="text-sm text-text-secondary mb-6">
              {rematchRequesterName ? `${rematchRequesterName} ` : '对方'}请求再来一局！
            </p>
            <div className="flex gap-3">
              <button onClick={handleRematchAccept} className="flex-1 py-2.5 rounded-xl bg-accent-heal/15 border border-accent-heal/25 text-accent-heal font-semibold text-sm hover:bg-accent-heal/25 transition-colors">
                ✅ 接受
              </button>
              <button onClick={handleRematchDecline} className="flex-1 py-2.5 rounded-xl border border-card-border text-text-secondary text-sm hover:bg-card-bg/50 transition-colors">
                ✕ 拒绝
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 次数耗尽提示 ===== */}
      {selectedCard && isCardExhausted(selectedCard) && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-white border border-accent-equip/30 rounded-xl px-5 py-3 shadow-lg text-sm text-accent-equip font-medium">
            ⚠️ 本回合行动/锦囊次数已用完
          </div>
        </div>
      )}

      {/* ===== 选项弹窗 ===== */}
      {showOptions && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowOptions(false)}>
          <div className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-xs w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary mb-4 text-center">房间号：{player?.roomId ?? '----'}</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowOptions(false);
                  setShowCollection(true);
                }}
                className="w-full py-3 rounded-xl border border-card-border text-text-secondary text-sm font-medium hover:bg-card-bg/50 transition-colors"
              >
                📖 图鉴
              </button>
              <button
                onClick={() => {
                  setShowOptions(false);
                  setShowRules(true);
                }}
                className="w-full py-3 rounded-xl border border-card-border text-text-secondary text-sm font-medium hover:bg-card-bg/50 transition-colors"
              >
                📋 规则
              </button>
              <button
                onClick={() => {
                  setShowOptions(false);
                  setShowSettings(true);
                }}
                className="w-full py-3 rounded-xl border border-card-border text-text-secondary text-sm font-medium hover:bg-card-bg/50 transition-colors"
              >
                ⚙️ 设置
              </button>
              <button
                onClick={async () => {
                  setShowOptions(false);
                  await surrender();
                }}
                className="w-full py-3 rounded-xl border border-accent-damage/30 text-accent-damage text-sm font-medium hover:bg-accent-damage/10 transition-colors"
              >
                🏳️ 投降
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 图鉴弹窗 ===== */}
      {showCollection && (
        <CollectionModal onClose={() => setShowCollection(false)} />
      )}

      {/* ===== 规则弹窗 ===== */}
      {showRules && (
        <RulesModal onClose={() => setShowRules(false)} />
      )}

      {/* ===== 设置弹窗 ===== */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
