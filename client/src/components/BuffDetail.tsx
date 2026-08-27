import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BuffType, BUFF_NAMES } from '@shared/types';
import { BUFF_DESCRIPTIONS, BUFF_ICON_MAP } from './BuffCollection';

/** 获取 buff 图标 URL */
function getBuffImageUrl(buffType: BuffType): string | null {
  const iconNum = BUFF_ICON_MAP[buffType as string];
  return iconNum ? `/assets/buff/buff${iconNum}.png` : null;
}

interface Props {
  buffType: BuffType;
  /** 层数（可选，来自 ActiveBuff） */
  stacks?: number;
  /** 剩余回合数（可选，undefined 表示无限期） */
  remainingTurns?: number;
  /** 弹窗主题色光带，可由调用方覆盖 */
  glowClass?: string;
  onClose: () => void;
}

/**
 * Buff 详情弹窗。
 * 设计与 CardDetail 对齐：Portal 挂载 body、遮罩模糊、
 * 主题色装饰光带、居中头像（光环 + 双圈）、文字分隔线、内嵌暗盒描述。
 * 支持 stacks / remainingTurns 的展示（来自战斗中的 ActiveBuff 实例）。
 */
export default function BuffDetail({
  buffType,
  stacks,
  remainingTurns,
  glowClass = 'bg-accent-buff/25',
  onClose,
}: Props) {
  const url = getBuffImageUrl(buffType);
  const name = BUFF_NAMES[buffType] || buffType;
  const desc = BUFF_DESCRIPTIONS[buffType] || '暂无描述';

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

  const hasIcon = url !== null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-72 max-w-full bg-card-bg/95 backdrop-blur-xl border border-card-border/80 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部主题色装饰光带 */}
        <div
          className={`pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2 w-64 h-36 rounded-full blur-3xl ${glowClass}`}
        />

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 text-text-secondary/80 text-xl leading-none backdrop-blur-sm transition-all duration-300 hover:bg-black/50 hover:text-text-primary hover:rotate-90"
        >
          ×
        </button>

        {/* ── 图标展示区：光环 + 双圈装饰；有层数时右下角悬浮层数徽章 ── */}
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

              {/* 层数角标 */}
              {stacks !== undefined && stacks > 1 && (
                <span className="absolute -bottom-0.5 right-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center ring-2 ring-white/20 shadow-lg shadow-red-500/30">
                  ×{stacks}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── 名称 ── */}
        <div className="px-6 text-center">
          <h2 className="text-base font-bold text-text-primary tracking-wide">{name}</h2>

          {/* 剩余回合信息条 */}
          {remainingTurns !== undefined && (
            <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full bg-accent-shield/10 text-accent-shield text-[10px] font-medium ring-1 ring-accent-shield/30">
              <span>⏳</span>
              <span>剩余 {remainingTurns} 回合</span>
            </span>
          )}
        </div>

        {/* ── 描述 ── */}
        <section className="px-6 pt-1 pb-6">
          <SectionDivider label="描述" />
          <div className="rounded-xl bg-black/20 border border-card-border/50 px-4 py-3">
            <p className="text-xs text-text-secondary leading-relaxed">{desc}</p>
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}

/** ── 标 签 ── 形式的居中分隔线（与 CardDetail 视觉一致） */
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex-1 h-px bg-gradient-to-r from-transparent to-card-border/80" />
      <span className="text-[10px] font-semibold text-text-secondary/50 tracking-[0.3em]">
        {label}
      </span>
      <span className="flex-1 h-px bg-gradient-to-l from-transparent to-card-border/80" />
    </div>
  );
}
