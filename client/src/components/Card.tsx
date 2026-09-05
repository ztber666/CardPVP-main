import { CardDef, CostType, COST_TYPE_NAMES } from '@shared/types';
import { getCardImageUrl } from '../utils/cardImage';

interface Props {
  card: CardDef;
  compact?: boolean;
  disabled?: boolean;
  /** 仅置灰（如消耗次数用尽），仍可点击；不设 disabled 属性 */
  dimmed?: boolean;
  selected?: boolean;
  onClick?: () => void;
  hidden?: boolean;
  played?: boolean;
}

const TYPE_BADGE: Record<string, string> = {
  [CostType.Action]: 'bg-accent-attack/15 text-accent-attack',
  [CostType.Strategy]: 'bg-accent-equip/15 text-accent-equip',
  [CostType.Heal]: 'bg-accent-heal/15 text-accent-heal',
  [CostType.Attack]: 'bg-accent-attack/15 text-accent-attack',
  [CostType.Buff]: 'bg-accent-buff/15 text-accent-buff',
  [CostType.Debuff]: 'bg-purple-100 text-purple-700',
  [CostType.Equip]: 'bg-accent-equip/15 text-accent-equip',
  [CostType.Weapon]: 'bg-accent-equip/15 text-accent-equip',
  [CostType.Field]: 'bg-accent-equip/15 text-accent-equip',
  [CostType.Event]: 'bg-blue-100 text-blue-700',
  [CostType.Counter]: 'bg-cyan-100 text-cyan-700',
};

const TYPE_BORDER: Record<string, string> = {
  [CostType.Action]: 'border-l-accent-attack',
  [CostType.Strategy]: 'border-l-accent-equip',
  [CostType.Heal]: 'border-l-accent-heal',
  [CostType.Attack]: 'border-l-accent-attack',
  [CostType.Buff]: 'border-l-accent-buff',
  [CostType.Debuff]: 'border-l-purple-500',
  [CostType.Equip]: 'border-l-accent-equip',
  [CostType.Weapon]: 'border-l-accent-equip',
  [CostType.Field]: 'border-l-accent-equip',
  [CostType.Event]: 'border-l-blue-500',
  [CostType.Counter]: 'border-l-cyan-500',
};

const COST_TYPE_LABELS: Record<string, string> = {
  [CostType.Action]: '行动',
  [CostType.Strategy]: '锦囊',
  [CostType.Heal]: '回血',
  [CostType.Attack]: '攻击',
  [CostType.Buff]: '增益',
  [CostType.Debuff]: '减益',
  [CostType.Event]: '事件',
  [CostType.Equip]: '装备',
  [CostType.Weapon]: '武器',
  [CostType.Field]: '场地',
  [CostType.Counter]: '策略',
};

export default function Card({ card, compact, disabled, dimmed, selected, onClick, hidden, played }: Props) {
  // 卡背
  if (hidden) {
    return (
      <div className="w-16 h-24 sm:w-18 sm:h-26 bg-gradient-to-br from-card-bg to-card-border/30 border border-card-border rounded-lg flex items-center justify-center shadow-card select-none">
        <span className="text-xl font-bold text-text-secondary/30">?</span>
      </div>
    );
  }

  const badgeCls = TYPE_BADGE[card.costType] || TYPE_BADGE[CostType.Action];
  const borderCls = TYPE_BORDER[card.costType] || TYPE_BORDER[CostType.Action];
  const imgUrl = getCardImageUrl(card.id);

  // ===== 紧凑模式（手牌显示） =====
  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`relative w-16 h-24 sm:w-18 sm:h-26 bg-gradient-to-b from-card-bg to-card-bg/80 border border-card-border rounded-xl flex flex-col items-center justify-start gap-0.5 px-1 pt-1.5 shadow-card select-none transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] border-l-[3px] ${borderCls}
          ${played ? 'animate-pulse-glow' : ''}
          ${selected
            ? '-translate-y-4 scale-105 shadow-2xl ring-2 ring-accent-shield/50 border-accent-shield/60 z-10'
            : disabled
              ? 'opacity-60 cursor-not-allowed grayscale'
              : dimmed
                ? 'opacity-60 grayscale cursor-pointer hover:border-card-border/60'
                : 'cursor-pointer hover:shadow-xl hover:border-card-border/80'
          }`}
      >
        <img src={imgUrl} alt={card.name} className="w-9 h-9 sm:w-10 sm:h-10 object-contain mt-0.5" style={{ imageRendering: 'pixelated' }} />
        <span className="text-[10px] sm:text-xs font-semibold text-text-primary leading-tight text-center line-clamp-2 px-0.5">{card.name}</span>
        <span className={`px-1.5 py-[0.5px] rounded text-[8px] sm:text-[9px] font-medium ${badgeCls}`}>
          {COST_TYPE_LABELS[card.costType]}
        </span>
        {/* 选中指示器 */}
        {selected && (
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent-shield border-2 border-card-bg shadow-md flex items-center justify-center">
            <svg className="w-2 h-2 text-white" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </button>
    );
  }

  // ===== 完整模式（详情用） =====
  return (
    <div className={`w-32 h-44 bg-card-bg border border-card-border rounded-xl flex flex-col items-center justify-between p-3 shadow-card select-none border-l-[4px] ${borderCls}`}>
      <img src={imgUrl} alt={card.name} className="w-12 h-12 object-contain mt-1" style={{ imageRendering: 'pixelated' }} />
      <span className="text-sm font-semibold text-text-primary text-center">{card.name}</span>
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${badgeCls}`}>
        {COST_TYPE_LABELS[card.costType]}
      </span>
      <span className="text-[10px] text-text-secondary text-center leading-tight">
        {card.description}
      </span>
    </div>
  );
}
