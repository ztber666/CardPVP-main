import { useT } from '../i18n/i18n';

interface Props {
  isMyTurn: boolean;
  pending: boolean;
  onEndTurn: () => void;
  /** 无事可做：手牌为空或行动/锦囊次数耗尽 → 按钮恢复实底高亮，提醒结束回合 */
  noMovesLeft?: boolean;
}

type TurnState = 'active' | 'pending' | 'waiting';

export default function ActionBar({ isMyTurn, pending, onEndTurn, noMovesLeft = false }: Props) {
  const t = useT();
  const state: TurnState = pending ? 'pending' : isMyTurn ? 'active' : 'waiting';

  /* 常态：幽灵描边退居辅助；无事可做：恢复实底高亮 */
  const highlight = state === 'active' && noMovesLeft;

  const stateStyles: Record<TurnState, { shell: string; label: string }> = {
    active: {
      shell: highlight
        ? 'bg-accent-equip border border-accent-equip text-white hover:brightness-110 active:brightness-95 cursor-pointer'
        : 'bg-transparent border border-accent-equip/50 text-accent-equip hover:bg-accent-equip/10 active:bg-accent-equip/15 cursor-pointer',
      label: highlight ? 'text-white' : 'text-accent-equip',
    },
    pending: {
      shell: 'bg-card-bg border border-card-border text-text-primary cursor-not-allowed',
      label: 'text-text-primary',
    },
    waiting: {
      shell: 'bg-transparent border border-card-border/50 text-text-secondary cursor-not-allowed',
      label: 'text-text-secondary/70',
    },
  };

  const s = stateStyles[state];

  return (
    <button
      onClick={onEndTurn}
      disabled={state !== 'active'}
      className={`relative grid h-9 min-w-[7rem] place-items-center overflow-hidden rounded-full px-5 text-xs font-semibold tracking-wider whitespace-nowrap select-none transition-all duration-200 ${s.shell}`}
    >
      {/* 文字层叠交叉淡入淡出，切换零跳动（沿用上一版机制） */}
      <span className="relative grid place-items-center">
        <span
          className={`col-start-1 row-start-1 flex items-center gap-1.5 transition-all duration-200 ${s.label} ${
            state === 'active' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          }`}
        >
          {t('结束出牌', 'End Turn')}
        </span>
        <span
          className={`col-start-1 row-start-1 flex items-center gap-1.5 transition-all duration-200 text-text-primary ${
            state === 'pending' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          }`}
        >
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70" />
          {t('处理中', 'Processing')}
        </span>
        <span
          className={`col-start-1 row-start-1 flex items-center gap-1.5 transition-all duration-200 text-text-secondary ${
            state === 'waiting' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          }`}
        >
          {t('等待对方', 'Waiting')}
        </span>
      </span>
    </button>
  );
}
