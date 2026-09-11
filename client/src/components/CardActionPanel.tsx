import { useState, useEffect } from 'react';
import { CardDef } from '@shared/types';
import { useT } from '../i18n/i18n';

interface Props {
  card: CardDef;
  isMyTurn: boolean;
  pending: boolean;
  isExhausted: (card: CardDef) => boolean;
  hasBrew: boolean;
  onPlayOnOpponent: () => void;
  onPlayOnSelf: () => void;
  onDiscard: (target: 'opponent' | 'self') => void;
  onDeselect: () => void;
  onBrewConvert?: () => void;
}

export default function CardActionPanel({
  card,
  isMyTurn,
  pending,
  isExhausted,
  hasBrew,
  onPlayOnOpponent,
  onPlayOnSelf,
  onDiscard,
  onDeselect,
  onBrewConvert,
}: Props) {
  const t = useT();
  const exhausted = isExhausted(card);

  const [target, setTarget] = useState<'opponent' | 'self'>(
    card.defaultTarget === 'self' ? 'self' : 'opponent'
  );

  const cardKey = (card as any).id || (card as any).uuid || (card as any).name;

  useEffect(() => {
    setTarget(card.defaultTarget === 'self' ? 'self' : 'opponent');
  }, [cardKey]);

  const isOpponentTarget = target === 'opponent';
  const canPlay = isMyTurn && !pending && !exhausted;

  const handlePlay = () => {
    isOpponentTarget ? onPlayOnOpponent() : onPlayOnSelf();
  };

  const handleToggle = () => {
    setTarget(prev => (prev === 'opponent' ? 'self' : 'opponent'));
  };

  // 统一的按钮基础样式
  const btnBase = 'w-full px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.96] disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div
      className="w-fit bg-card-bg/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl shadow-black/40 flex flex-col gap-1.5"
      onClick={e => e.stopPropagation()}
    >
      {/* 目标切换按钮 */}
      <button
        onClick={handleToggle}
        className={`${btnBase} bg-white/5 border border-white/5 hover:bg-white/10 ${
          isOpponentTarget ? 'text-accent-attack' : 'text-accent-heal'
        }`}
      >
        <span className="opacity-80">🔄</span>
        {isOpponentTarget ? t('敌方', 'Opponent') : t('自己', 'Self')}
      </button>

      {/* 主操作按钮 */}
      <button
        onClick={handlePlay}
        disabled={!canPlay}
        className={`${btnBase} border ${
          isOpponentTarget
            ? 'bg-accent-attack/15 border-accent-attack/30 text-accent-attack hover:bg-accent-attack/25'
            : 'bg-accent-heal/15 border-accent-heal/30 text-accent-heal hover:bg-accent-heal/25'
        }`}
      >
        {isOpponentTarget ? '⚔️ ' + t('使用', 'Use') : '💚 ' + t('使用', 'Use')}
      </button>

      {/* 转化按钮 */}
      {hasBrew && onBrewConvert && (
        <button
          onClick={onBrewConvert}
          disabled={pending}
          className={`${btnBase} bg-accent-buff/15 border border-accent-buff/30 text-accent-buff hover:bg-accent-buff/25`}
        >
          🧪 {t('转化', 'Convert')}
        </button>
      )}

      {/* 丢弃按钮 */}
      <button
        onClick={() => onDiscard(target)}
        disabled={pending}
        className={`${btnBase} bg-white/5 border border-white/5 text-text-secondary hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30`}
      >
        🗑️ {t('丢弃', 'Discard')}
      </button>

      {/* 取消按钮 */}
      <button
        onClick={onDeselect}
        className={`${btnBase} bg-white/5 border border-white/5 text-text-secondary hover:bg-white/10`}
      >
        ✕ {t('取消', 'Cancel')}
      </button>
    </div>
  );
}
