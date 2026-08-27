import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CardDef, COST_TYPE_NAMES, ActiveBuff } from '@shared/types';
import { parseIcon } from '@shared/constants';
import { getCardImageUrl } from '../utils/cardImage';
import BuffBadge from './BuffBadge';
import SectionDivider from './SectionDivider';

interface Props {
  card: CardDef & { buffs?: ActiveBuff[] };
  onClose: () => void;
}

const TYPE_STYLE: Record<string, string> = {
  action: 'bg-accent-attack/10 text-accent-attack ring-accent-attack/30',
  strategy: 'bg-accent-equip/10 text-accent-equip ring-accent-equip/30',
  heal: 'bg-accent-heal/10 text-accent-heal ring-accent-heal/30',
  attack: 'bg-accent-attack/10 text-accent-attack ring-accent-attack/30',
  buff: 'bg-accent-buff/10 text-accent-buff ring-accent-buff/30',
  debuff: 'bg-purple-500/10 text-purple-300 ring-purple-400/30',
  event: 'bg-blue-500/10 text-blue-300 ring-blue-400/30',
  equip: 'bg-accent-equip/10 text-accent-equip ring-accent-equip/30',
  weapon: 'bg-accent-equip/10 text-accent-equip ring-accent-equip/30',
  field: 'bg-accent-equip/10 text-accent-equip ring-accent-equip/30',
  counter: 'bg-accent-shield/10 text-accent-shield ring-accent-shield/30',
};
const TYPE_GLOW: Record<string, string> = {
  action: 'bg-accent-attack/25', strategy: 'bg-accent-equip/25', heal: 'bg-accent-heal/25',
  attack: 'bg-accent-attack/25', buff: 'bg-accent-buff/25', debuff: 'bg-purple-500/25',
  event: 'bg-blue-500/25', equip: 'bg-accent-equip/25', weapon: 'bg-accent-equip/25',
  field: 'bg-accent-equip/25', counter: 'bg-accent-shield/25',
};

export default function CardDetail({ card, onClose }: Props) {
  const cardTypes = parseIcon(card.icon);
  const glow = TYPE_GLOW[cardTypes[0]] || 'bg-accent-shield/25';

  // Esc 关闭 + 打开期间锁定背景滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-80 max-w-full bg-card-bg/95 backdrop-blur-xl border border-card-border/80 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部主题色装饰光带 */}
        <div
          className={`pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-40 rounded-full blur-3xl ${glow}`}
        />

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 text-text-secondary/80 text-xl leading-none backdrop-blur-sm transition-all duration-300 hover:bg-black/50 hover:text-text-primary hover:rotate-90"
        >
          ×
        </button>

        {/* 头图：主题色光环 + 双圈装饰 */}
        <div className="relative flex justify-center pt-9 pb-4">
          <div className="relative w-28 h-28 flex items-center justify-center">
            <div className={`absolute inset-0 rounded-full blur-xl ${glow}`} />
            <div className="absolute inset-0 rounded-full border border-white/10" />
            <div className="absolute inset-2 rounded-full border border-white/5" />
            <img
              src={getCardImageUrl(card.id)}
              alt={card.name}
              style={{ imageRendering: 'pixelated' }}
              className="relative w-20 h-20 object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
            />
          </div>
        </div>

        {/* 名称 + 类型 */}
        <div className="px-6 text-center">
          <h2 className="text-lg font-bold text-text-primary antialiased">{card.name}</h2>
          <div className="flex flex-wrap justify-center gap-1.5 mt-2.5">
            {cardTypes.map((t, i) => (
              <span
                key={i}
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ring-1 ${
                  TYPE_STYLE[t] || 'bg-accent-shield/10 text-accent-shield ring-accent-shield/30'
                }`}
              >
                {COST_TYPE_NAMES[t] || '其他'}
              </span>
            ))}
          </div>
        </div>

        {/* 状态 */}
        {card.buffs && card.buffs.length > 0 && (
          <section className="px-6 pt-1">
            <SectionDivider label="状态" />
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {card.buffs.map((buff, i) => (
                <BuffBadge key={i} buff={buff} compactMode={false} />
              ))}
            </div>
          </section>
        )}

        {/* 描述 */}
        <section className="px-6 pt-1 pb-6">
          <SectionDivider label="描述" />
          <div className="rounded-xl bg-black/25 border border-card-border/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <p className="text-[13px] leading-loose text-text-primary/90 antialiased max-h-36 overflow-y-auto">
              {card.description}
            </p>
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}
