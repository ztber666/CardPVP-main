import { useEffect, useMemo, useRef, useState } from 'react';
import { CardDef, CostType, GameState, PlayerState } from '@shared/types';
import { BUFF_NAMES } from '@shared/types';
import { getCardImageUrl } from '../utils/cardImage';
import { BUFF_ICON_MAP } from '../components/BuffCollection';

// ===== 唯一的数据模型 =====
export interface ChoiceOption {
  key: string;        // 提交值（卡牌id / 下标 / 枚举 / buffType:sourceId）
  label: string;      // 主文案
  sub?: string;       // 副文案（消耗类型 / 层数 / 槽位）
  img?: string;       // 图片图标（卡牌/buff）
  emoji?: string;     // emoji 图标（枚举选项）
  badge?: string;     // "已选"标记（矿车）
  disabled?: boolean;
}

export interface ChoiceRequest {
  id: string;             // 'guess' | 'draft' | ... 决定提交走哪个 socket
  triggerKey: string;     // 同一次触发的标识，变化时复位隐藏/输入状态
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
): ChoiceRequest | null {

  if (me.pendingGuessCardId) {
    return {
      id: 'guess', triggerKey: me.pendingGuessCardId, icon: '🔍', cardId: 'card_32', title: '侦测器',
      subtitle: '猜测这张牌在牌组中的权重', accent: 'shield', kind: 'number',
      min: 0, max: 50, dismissible: true, cancelLabel: '取消', onCancel: 'dismiss',
      options: [], note: me.pendingGuessCardName ? '随机选择了一张卡牌' : undefined,
    };
  }

  if (me.draftCards?.length) {
    return {
      id: 'draft', triggerKey: me.draftCards.map(c => c.id).join('|'), icon: '🚂', cardId: 'card_41', title: '运输矿车',
      subtitle: '选择一张牌加入手牌', accent: 'shield', kind: 'select', layout: 'grid',
      dismissible: false,
      note: me.draftPlayerPick === 0 ? '轮到出牌方选牌' : '轮到接受方选牌',
      options: me.draftCards.map((c, i) => ({
        key: String(i), label: c.name, img: getCardImageUrl(c.id),
        badge: me.draftPickedBy?.[i],
        disabled: !!me.draftPickedBy?.[i] || ((me.draftPlayerPick === 0) !== isMyTurn),
      })),
    };
  }

  if (me.pendingBucketChoice === 'pending') {
    return {
      id: 'bucket', triggerKey: 'bucket', icon: '🪣', cardId: 'card_13', title: '蜘蛛网',
      subtitle: '选择要封锁的类型', accent: 'attack', kind: 'select',
      dismissible: false, options: [
        { key: 'action', label: '行动牌', emoji: '🗡️' },
        { key: 'strategy', label: '锦囊牌', emoji: '🎯' },
      ],
    };
  }

  if (me.pendingEquipChoice === 'pending') {
    const slots = ['equip', 'weapon', 'field'] as const;
    const tag = { equip: '装备', weapon: '武器', field: '场地' };
    return {
      id: 'equip', triggerKey: 'equip', icon: '🎣', cardId: 'card_18', title: '诡异钓竿',
      subtitle: '选择要丢弃的装备', accent: 'attack', kind: 'select',
      dismissible: false, cancelLabel: '取消', onCancel: 'equipCancel',
      options: slots.filter(s => opponent.equipment[s]).map(s => ({
        key: s, label: opponent.equipment[s]!.name, sub: tag[s],
        img: getCardImageUrl(opponent.equipment[s]!.id),
      })),
    };
  }

  if (me.pendingRedstoneChoice === 'pending') {
    const target = gameState.players.find(pl => pl.id === me.pendingRedstoneTargetId);
    const buffs = (target?.buffs || []).filter(b => b.remainingTurns !== undefined);
    return {
      id: 'redstone', triggerKey: 'redstone', icon: '🔴', cardId: 'card_47', title: '红石粉',
      subtitle: '选择一个限时状态，持续时间+1回合', accent: 'equip', kind: 'select',
      dismissible: false,
      options: buffs.map(b => ({
        key: `${b.buffType}:${b.sourcePlayerId || ''}`,
        label: BUFF_NAMES[b.buffType] || b.buffType,
        sub: `${b.stacks}层 · 剩余${b.remainingTurns}回合`,
        img: `/assets/buff/buff${BUFF_ICON_MAP[b.buffType as string]}.png`,
      })),
    };
  }

  const lastLog = gameState.log?.[gameState.log.length - 1]?.message || '';
  if (lastLog.includes('附魔台触发') && isMyTurn) {
    const cards = enchantCards(me);
    if (cards.length > 0) {
      return {
        id: 'enchant', triggerKey: `enchant:${gameState.log.length}`, icon: '⚗️', cardId: 'card_37', title: '附魔台',
        subtitle: '选择一张牌丢弃并触发其效果', accent: 'shield', kind: 'select',
        dismissible: true, cancelLabel: '取消', onCancel: 'dismiss',
        options: cards.map(c => ({ key: c.id, label: c.name, img: getCardImageUrl(c.id) })),
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
    () => (gameState && me && opponent ? detectChoice(gameState, me, opponent, isMyTurn) : null),
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
