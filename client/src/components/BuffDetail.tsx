import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BuffType, BUFF_NAMES } from '@shared/types';
import { BUFF_DESCRIPTIONS, BUFF_ICON_MAP } from './BuffCollection';
import SectionDivider from './SectionDivider';

function getBuffImageUrl(buffType: BuffType): string | null {
  const iconNum = BUFF_ICON_MAP[buffType as string];
  return iconNum ? `/assets/buff/buff${iconNum}.png` : null;
}

/** 圆点刻度的最大数量（超出后仅靠数字表达精度） */
const MAX_STACK_DOTS = 5;
/** 未提供总回合数时的默认满格基准 */
const DEFAULT_MAX_TURNS = 10;
/** 电池格总数 */
const TURN_SEGMENTS = 6;

interface Props {
  buffType: BuffType;
  /** 当前层数（可选，来自 ActiveBuff） */
  stacks?: number;
  /** 总回合上限（可选；传入后进度条按真实比例绘制） */
  maxTurns?: number;
  /** 剩余回合数（可选，undefined 表示无限期） */
  remainingTurns?: number;
  /** 弹窗主题色光带 */
  glowClass?: string;
  onClose: () => void;
}

export default function BuffDetail({
  buffType,
  stacks,
  maxTurns,
  remainingTurns,
  glowClass = 'bg-accent-buff/25',
  onClose,
}: Props) {
  const url = getBuffImageUrl(buffType);
  const name = BUFF_NAMES[buffType] || buffType;
  const desc = BUFF_DESCRIPTIONS[buffType] || '暂无描述';

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

  const hasIcon = url !== null;
  const hasStats = (stacks !== undefined && stacks > 1) || remainingTurns !== undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-72 max-w-full bg-card-bg/95 backdrop-blur-xl border border-card-border/80 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2 w-64 h-36 rounded-full blur-3xl ${glowClass}`}
        />

        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 text-text-secondary/80 text-xl leading-none backdrop-blur-sm transition-all duration-300 hover:bg-black/50 hover:text-text-primary hover:rotate-90"
        >
          ×
        </button>

        {/* 图标展示区 */}
        {hasIcon && (
          <div className="relative flex justify-center pt-9 pb-4">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className={`absolute inset-0 rounded-full blur-xl ${glowClass}`} />
              <div className="absolute inset-0 rounded-full border border-white/10" />
              <div className="absolute inset-2 rounded-full border border-white/5" />
              <img
                src={url!}
                alt={name}
                className="relative w-16 h-16 object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          </div>
        )}

        {/* 名称 */}
        <div className="px-6 text-center">
          <h2 className="text-base font-bold text-text-primary antialiased">{name}</h2>
        </div>

        {/* ── 状态区：堆叠 / 回合数据胶囊 ── */}
        {hasStats && (
          <section className="px-6 pt-1">
            <SectionDivider label="状态" />
            <div className="flex flex-col gap-2">
              {/* 层数：叠圆点 + 数值 */}
              {stacks !== undefined && stacks > 1 && (
                <StatRow
                  label="叠加"
                  valueText={`${stacks} 层`}
                  accent={
                    stacks >= MAX_STACK_DOTS
                      ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]'
                      : 'bg-accent-buff'
                  }
                  tail={
                    <span className="text-accent-buff" aria-hidden>
                      {Array.from({ length: Math.min(stacks, MAX_STACK_DOTS) }).map((_, i) => (
                        <span key={i} className="inline-block leading-none tracking-tight">
                          ●
                        </span>
                      ))}
                      {/* 不满 5 层时补灰色空位，保持视觉宽度稳定 */}
                      {Array.from({ length: Math.max(0, MAX_STACK_DOTS - stacks) }).map((_, i) => (
                        <span key={`e${i}`} className="inline-block leading-none tracking-tight opacity-25">
                          ●
                        </span>
                      ))}
                    </span>
                  }
                />
              )}

              {/* 回合：电池格 + 文字 */}
              {remainingTurns !== undefined ? (
                (() => {
                  const total = Math.max(maxTurns ?? DEFAULT_MAX_TURNS, remainingTurns);
                  // 已流逝比例取反 → 剩余比例
                  const fillRatio = Math.min(remainingTurns / total, 1);
                  const urgent = remainingTurns <= 2;

                  return (
                    <StatRow
                      label="剩余"
                      valueText={`${remainingTurns} 回合`}
                      accent={
                        urgent
                          ? 'animate-pulse-fast bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                          : 'bg-accent-shield'
                      }
                      tail={
                        /* 电池式分段条：fillRatio 决定亮起的格数 */
                        <span
                          className={`flex gap-0.5 ${urgent ? 'animate-pulse-fast' : ''}`}
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={total}
                          aria-valuenow={remainingTurns}
                        >
                          {Array.from({ length: TURN_SEGMENTS }).map((_, i) => (
                            <span
                              key={i}
                              className={`
                                w-[9px] h-1.5 rounded-sm transition-colors duration-300
                                ${
                                  i < Math.round(fillRatio * TURN_SEGMENTS)
                                    ? urgent
                                      ? 'bg-amber-400'
                                      : 'bg-accent-shield'
                                    : 'bg-text-secondary/20'
                                }
                              `}
                            />
                          ))}
                        </span>
                      }
                    />
                  );
                })()
              ) : (
                /* 无限期 buff */
                <StatRow
                  label="持续"
                  accent="bg-accent-shield"
                  valueText={<span className="text-lg leading-none">∞</span>}
                  tail={<span className="text-xs text-text-secondary">无期限生效</span>}
                />
              )}
            </div>
          </section>
        )}

        {/* 描述 */}
        <section className="px-6 pt-1 pb-6">
          <SectionDivider label="描述" />
          <div className="rounded-xl bg-black/25 border border-card-border/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <p className="text-[13px] leading-loose text-text-primary/90 antialiased max-h-36 overflow-y-auto">
              {desc}
            </p>
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}

/**
 * 单行状态数据行：左侧竖色条 + 标签 + 主内容(右对齐)。
 * 统一了层数行与回合行的骨架，避免两套相似 JSX。
 */
function StatRow({
  label,
  valueText,
  accent,
  tail,
}: {
  label: string;
  /** 右侧数值文本；传 string 或直接传节点 */
  valueText?: React.ReactNode;
  accent: string;
  tail: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-black/15 border border-card-border/40 px-3 py-2">
      {/* 状态类别色条 */}
      <span className={`w-1 self-stretch rounded-full min-h-4 ${accent}`} />
      <span className="text-[11px] font-semibold text-text-secondary shrink-0">{label}</span>

      <span className="ml-auto flex items-center gap-2">
        {/* 可视化刻度（圆点 / 电池格 / 符号） */}
        {/* 精确数值作为补充信息 */}
        {valueText != null && (
          <span className="text-xs font-bold text-text-primary tabular-nums">{valueText}</span>
        )}
      </span>
    </div>
  );
}
