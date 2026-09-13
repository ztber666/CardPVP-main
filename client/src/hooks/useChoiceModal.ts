import { useEffect, useMemo, useRef, useState } from 'react';
import { ActiveBuff, CardDef, CostType, GameState, PlayerState } from '@shared/types';
import { getCardImageUrl } from '../utils/cardImage';
import { BUFF_ICON_MAP } from '../components/BuffCollection';
import { useSettingsStore } from '../store/settingsStore';
import { buffName, cardNameForTemplate, txt, type AppLang } from '../i18n/i18n';
import { logEntryPlainText } from '../utils/logText';

// ===== 唯一的数据模型 =====
export interface ChoiceOption {
  key: string;        // 提交值（卡牌id / 下标 / 枚举 / buffType:sourceId）
  label: string;      // 主文案
  sub?: string;       // 副文案（消耗类型 / 层数 / 槽位）
  img?: string;       // 图片图标（卡牌/buff）
  emoji?: string;     // emoji 图标（枚举选项）
  badge?: string;     // "已选"标记（矿车）
  disabled?: boolean;
  cardId?: string;    // 卡牌选项：选中后详情弹窗（CardDetail）用
  buff?: ActiveBuff;  // buff 选项：选中后详情弹窗（BuffDetail）用
}

export interface ChoiceRequest {
  id: string;             // 'guess' | 'draft' | ... 决定提交走哪个 socket
  triggerKey: string;     // 同一次触发的标识，变化时复位隐藏/输入状态
  clearSelectionKey?: string; // 变化时自动清除当前选中（运输矿车：对方选牌后我方取消选中），不影响隐藏状态
  icon: string;
  cardId?: string;        // 对应 constants 里卡牌 id，用于解析卡牌图片作为弹窗图标
  title: string;
  subtitle: string;
  accent: 'shield' | 'attack' | 'equip' | 'heal';
  kind: 'select' | 'number';
  layout?: 'list' | 'grid';
  options: ChoiceOption[];
  note?: string;          // 提示条
  min?: number;
  max?: number;
  dismissible: boolean;   // ✕ 按钮按原有设计
  cancelLabel?: string;
  onCancel?: 'dismiss' | 'equipCancel';
}

/** 附魔台：通过 icon 前缀匹配缺漏的消耗类型（原逻辑不变） */
const ICON_PREFIX: Partial<Record<CostType, number>> = {
  [CostType.Heal]: 3, [CostType.Attack]: 4, [CostType.Buff]: 5, [CostType.Debuff]: 6, [CostType.Event]: 7,
};

function enchantCards(me: PlayerState): CardDef[] {
  const played = me.playedCardTypesThisTurn || [];
  const missing = [CostType.Heal, CostType.Attack, CostType.Buff, CostType.Debuff].find(ct => !played.includes(ct));
  if (!missing || !me.hand) return [];
  return me.hand.filter(c => {
    if (c.costType === missing) return true;
    const p = ICON_PREFIX[missing];
    return p ? c.icon.split(',').map(Number).slice(0, -1).includes(p) : false;
  });
}

/** 全部 6 个弹窗的定义：纯函数，从 gameState 直接构造 ChoiceRequest */
export function detectChoice(
  gameState: GameState, me: PlayerState, opponent: PlayerState, isMyTurn: boolean,
  lang: AppLang = 'zh',
): ChoiceRequest | null {
  const l = (zh: string, en: string) => txt(lang, zh, en);
  const slotTag: Record<string, string> = { equip: l('装备', 'Equip'), weapon: l('武器', 'Weapon'), field: l('场地', 'Field') };
  const cardLabel = (card: CardDef) => cardNameForTemplate(lang, card.id, card.name);

  // 刷怪笼：选择丢弃攻击卡或不丢（优先级最高：挂起中的未结算效果，可能跨回合存在）
  if (me.pendingSpawnerChoice) {
    const pending = me.pendingSpawnerChoice;
    // 快照里的卡可能已因后续效果离开手牌（被偷/被弃），过滤出仍存在的
    const candidates = (pending.cardIds || [])
      .map(id => me.hand.find(c => c.id === id))
      .filter((c): c is CardDef => !!c);
    return {
      id: 'spawner', triggerKey: `spawner:${pending.sourceCardId}`, icon: '🧟', cardId: 'card_10', title: '刷怪笼',
      subtitle: '选择一张攻击卡丢弃，或选择不丢', accent: 'attack', kind: 'select',
      dismissible: false,
      options: [
        ...candidates.map(c => ({ key: `discard:${c.id}`, label: c.name, img: getCardImageUrl(c.id) })),
        { key: 'skip', label: '不丢（获得尸潮）'},
      ],
    };
  }

  if (me.pendingGuessCardId) {
    return {
      id: 'guess', triggerKey: me.pendingGuessCardId, icon: '🔍', cardId: 'card_32', title: l('侦测器', 'Observer'),
      subtitle: l('猜测这张牌在牌组中的权重', 'Guess the weight of this card in the deck'), accent: 'shield', kind: 'number',
      min: 0, max: 50, dismissible: true, cancelLabel: l('取消', 'Cancel'), onCancel: 'dismiss',
      options: [], note: me.pendingGuessCardName ? l('随机选择了一张卡牌', 'A random card was chosen') : undefined,
    };
  }

  if (me.draftCards?.length) {
    return {
      id: 'draft', triggerKey: me.draftCards.map(c => c.id).join('|'), icon: '🚂', cardId: 'card_41', title: l('运输矿车', 'Minecart with Chest'),
      subtitle: l('选择一张牌加入手牌', 'Choose a card to add to your hand'), accent: 'shield', kind: 'select',
      clearSelectionKey: Object.entries(me.draftPickedBy || {}).map(([i, name]) => `${i}:${name}`).join('|'),
      dismissible: false,
      note: me.draftPlayerPick === 0 ? l('轮到出牌方选牌', 'The current player picks') : l('轮到接受方选牌', 'The opponent picks'),
      options: me.draftCards.map((c, i) => ({
        key: String(i), label: cardLabel(c), img: getCardImageUrl(c.id), cardId: c.id,
        badge: me.draftPickedBy?.[i],
        disabled: !!me.draftPickedBy?.[i] || ((me.draftPlayerPick === 0) !== isMyTurn),
      })),
    };
  }

  if (me.pendingBucketChoice === 'pending') {
    return {
      id: 'bucket', triggerKey: 'bucket', icon: '🪣', cardId: 'card_13', title: l('蜘蛛网', 'Cobweb'),
      subtitle: l('选择要封锁的类型', 'Choose which type to lock'), accent: 'attack', kind: 'select',
      dismissible: false, options: [
        { key: 'action', label: l('行动牌', 'Action'), emoji: '🗡️' },
        { key: 'strategy', label: l('锦囊牌', 'Strategy'), emoji: '🎯' },
      ],
    };
  }

  if (me.pendingEquipChoice === 'pending') {
    const slots = ['equip', 'weapon', 'field'] as const;
    return {
      id: 'equip', triggerKey: 'equip', icon: '🎣', cardId: 'card_18', title: l('诡异钓竿', 'Warped Fungus on a Stick'),
      subtitle: l('选择要丢弃的装备', 'Choose equipment to discard'), accent: 'attack', kind: 'select',
      dismissible: false, cancelLabel: l('取消', 'Cancel'), onCancel: 'equipCancel',
      options: slots.filter(s => opponent.equipment[s]).map(s => ({
        key: s, label: cardLabel(opponent.equipment[s]!), sub: slotTag[s],
        img: getCardImageUrl(opponent.equipment[s]!.id),
        cardId: opponent.equipment[s]!.id,
      })),
    };
  }

  if (me.pendingRedstoneChoice === 'pending') {
    const target = gameState.players.find(pl => pl.id === me.pendingRedstoneTargetId);
    const buffs = (target?.buffs || []).filter(b => b.remainingTurns !== undefined);
    return {
      id: 'redstone', triggerKey: 'redstone', icon: '🔴', cardId: 'card_47', title: l('红石粉', 'Redstone Dust'),
      subtitle: l('选择一个限时状态，持续时间+1回合', 'Choose a timed effect to extend by 1 turn'), accent: 'equip', kind: 'select',
      dismissible: false,
      options: buffs.map(b => ({
        key: `${b.buffType}:${b.sourcePlayerId || ''}`,
        label: buffName(lang, b.buffType),
        sub: lang === 'en'
          ? `${b.stacks} stacks · ${b.remainingTurns} turns left`
          : `${b.stacks}层 · 剩余${b.remainingTurns}回合`,
        img: `/assets/buff/buff${BUFF_ICON_MAP[b.buffType as string]}.png`,
        buff: b,
      })),
    };
  }

  const lastLog = logEntryPlainText(gameState.log?.[gameState.log.length - 1], me.id);
  if (lastLog.includes('附魔台触发') && isMyTurn) {
    const cards = enchantCards(me);
    if (cards.length > 0) {
      return {
        id: 'enchant', triggerKey: `enchant:${gameState.log.length}`, icon: '⚗️', cardId: 'card_37', title: l('附魔台', 'Enchanting Table'),
        subtitle: l('选择一张牌丢弃并触发其效果', 'Choose a card to discard and trigger its effect'), accent: 'shield', kind: 'select',
        dismissible: true, cancelLabel: l('取消', 'Cancel'), onCancel: 'dismiss',
        options: cards.map(c => ({ key: c.id, label: cardLabel(c), img: getCardImageUrl(c.id), cardId: c.id })),
      };
    }
  }

  return null;
}

// ===== Hook：推导 + 关闭标记自动复位 =====
export function useChoiceModal(
  gameState: GameState | null | undefined,
  me: PlayerState | null | undefined,
  opponent: PlayerState | null | undefined,
  isMyTurn: boolean,
) {
  const request = useMemo(
    () => (gameState && me && opponent ? detectChoice(gameState, me, opponent, isMyTurn, useSettingsStore.getState().lang) : null),
    [gameState, me, opponent, isMyTurn],
  );

  const [dismissed, setDismissed] = useState<string | null>(null);
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    // 触发源变化（消失或换了一个）时，自动清除关闭标记 → 下次触发可重新弹出
    const cur = request?.id ?? null;
    if (prevId.current !== null && cur !== prevId.current) {
      setDismissed(d => (d === prevId.current ? null : d));
    }
    prevId.current = cur;
  }, [request?.id]);

  return {
    request,
    visible: request && dismissed !== request.id ? request : null,
    dismiss: () => setDismissed(request?.id ?? null),
  };
}
