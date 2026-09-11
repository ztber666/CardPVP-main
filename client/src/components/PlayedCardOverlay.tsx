import { MouseEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { CardDef } from '@shared/types';
import { getCardImageUrl } from '../utils/cardImage';
import { useSettingsStore } from '../store/settingsStore';
import { MotionConfig, motion, Variants } from 'framer-motion';
import { cardText, useLang, useT } from '../i18n/i18n';

type OverlayVariant = 'self' | 'opponent' | 'discard';

interface Props {
  card: CardDef;
  playerName: string;
  variant?: OverlayVariant;
  children?: ReactNode;
  /** 点击右上角关闭按钮时触发（关闭打出提示+效果提示+卡牌详情） */
  onClose?: () => void;
}

/* ---------------- 动画参数 ---------------- */
const EXIT_MS = 400; // 离场动画时长（自动离场会预留这段时间收束）
const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EASE_IN_ACCEL: [number, number, number, number] = [0.4, 0, 1, 1];

const VARIANT_STYLES: Record<
  OverlayVariant,
  { border: string; glow: string; accentText: string; accentDot: string; label: string }
> = {
  self: {
    border: 'border-accent-heal/40',
    glow: 'bg-accent-heal/20',
    accentText: 'text-accent-heal',
    accentDot: 'bg-accent-heal',
    label: '打出了此牌',
  },
  opponent: {
    border: 'border-accent-attack/40',
    glow: 'bg-accent-attack/20',
    accentText: 'text-accent-attack',
    accentDot: 'bg-accent-attack',
    label: '打出了此牌',
  },
  discard: {
    border: 'border-accent-shield/40',
    glow: 'bg-accent-shield/20',
    accentText: 'text-accent-shield',
    accentDot: 'bg-accent-shield',
    label: '丢弃了此牌',
  },
};

/* ---------------- 动画编排（variant 标签自动向子级传播） ---------------- */

// 根节点：只负责状态切换 + 离场时轻微错峰
const rootVariants: Variants = {
  hidden: {},
  visible: {},
  leaving: { transition: { staggerChildren: 0.04 } },
};

// 卡片主体：弹簧入场（自带轻微过冲），离场加速上飘
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.82, rotate: -4 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: 0,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 24,
      mass: 0.9,
      opacity: { duration: 0.22 },
      staggerChildren: 0.07, // 内部元素错峰
      delayChildren: 0.16,   // 等卡片基本落定后再浮现
    },
  },
  leaving: {
    opacity: 0,
    y: -18,
    scale: 0.9,
    rotate: 2,
    transition: { duration: EXIT_MS / 1000, ease: EASE_IN_ACCEL },
  },
};

// 卡面图片：独立弹簧，弹性更足
const imageVariants: Variants = {
  hidden: { opacity: 0, scale: 0.4, rotate: -16 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: 'spring', stiffness: 320, damping: 17, opacity: { duration: 0.2 } },
  },
};

// 文本/徽章：柔和上浮
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT_EXPO } },
};

// children（效果提示等）：与卡片错峰入场、同步离场
const childrenVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 240, damping: 24, delay: 0.34, opacity: { duration: 0.25 } },
  },
  leaving: { opacity: 0, y: -10, transition: { duration: 0.32, ease: 'easeIn' } },
};

export default function PlayedCardOverlay({
  card,
  playerName,
  variant = 'opponent',
  children,
  onClose,
}: Props) {
  const duration = useSettingsStore((s) => s.cardOverlayDuration) || 2200;
  const lang = useLang();
  const t = useT();
  const { name: displayName } = cardText(lang, card);
  const actionLabel = variant === 'discard'
    ? t('丢弃了此牌', 'discarded this card')
    : t('打出了此牌', 'played this card');
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 自动离场：在总时长末尾预留 EXIT_MS，动画收束点与父组件卸载时机对齐 */
  useEffect(() => {
    if (leaving) return;
    const t = setTimeout(() => setLeaving(true), Math.max(0, duration - EXIT_MS));
    return () => clearTimeout(t);
  }, [duration, leaving]);

  /* 卸载时清理定时器 */
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  /* 关闭：先播完离场动画再通知父组件（关闭提示+效果+详情），避免瞬间消失的生硬感 */
  const handleClose = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (leaving) {
      onClose?.(); // 已在离场中（自动倒计时结束/二次点击）→ 立即生效
      return;
    }
    setLeaving(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => onClose?.(), EXIT_MS);
  };

  const style = VARIANT_STYLES[variant];

  return (
    /* reducedMotion="user"：系统开启“减弱动态效果”时自动降级为仅淡入淡出 */
    <MotionConfig reducedMotion="user">
      <motion.div
        className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 pointer-events-none select-none"
        initial="hidden"
        animate={leaving ? 'leaving' : 'visible'}
        exit="leaving" /* 若父组件用 <AnimatePresence> 包裹，提前卸载时也有离场动画 */
        variants={rootVariants}
      >
        {/* 卡片主体（含氛围光晕） */}
        <motion.div variants={cardVariants} className="relative">
          {/* 氛围光晕：呼吸 */}
          <motion.div
            aria-hidden
            className={`absolute -inset-5 rounded-[1.5rem] blur-xl ${style.glow}`}
            animate={{ opacity: [0.45, 0.9, 0.45], scale: [1, 1.07, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }}
          />

          {/* 玻璃拟态卡片 */}
          <div
            className={`relative rounded-xl border ${style.border} bg-card-bg/85 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl`}
          >
            {/* 裁切层：发丝高光 + 流光扫过 + 生命周期进度条 */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
              <div className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <motion.div
                className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                style={{ skewX: -15 }}
                initial={{ x: '-130%' }}
                animate={{ x: '400%' }}
                transition={{ duration: 1.15, delay: 0.5, ease: [0.3, 0, 0.25, 1] }}
              />
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/5">
                {/* 进度条：与 duration 严格同步线性缩短 */}
                <motion.div
                  className={`h-full w-full origin-left ${style.accentDot}`}
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: duration / 1000, ease: 'linear' }}
                />
              </div>
            </div>

            <div className="relative flex min-w-[8.5rem] flex-col items-center gap-2 px-5 py-3.5">
              {/* 关闭按钮：hover 旋转放大 / 按压回弹 */}
              {onClose && (
                <motion.button
                  onClick={handleClose}
                  whileHover={{ scale: 1.15, rotate: 90 }}
                  whileTap={{ scale: 0.82 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                  className="pointer-events-auto absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full border border-card-border bg-card-bg/90 text-xs font-bold leading-none text-text-secondary shadow-md opacity-60 backdrop-blur-sm transition-colors duration-200 hover:border-accent-attack/60 hover:text-accent-attack hover:opacity-100"
                  aria-label={t('关闭', 'Close')}
                >
                  ×
                </motion.button>
              )}

              <motion.img
                variants={imageVariants}
                src={getCardImageUrl(card.id)}
                alt={displayName}
                draggable={false}
                className="h-11 w-11 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
                style={{ imageRendering: 'pixelated' }}
              />

              <motion.span
                variants={itemVariants}
                className="max-w-[7.5rem] truncate text-xs font-semibold tracking-wide text-text-primary"
              >
                {displayName}
              </motion.span>

              <motion.div
                variants={itemVariants}
                className={`flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 ${style.accentText}`}
              >
                <motion.span
                  className={`h-1 w-1 rounded-full ${style.accentDot}`}
                  animate={{ opacity: [1, 0.35, 1], scale: [1, 0.85, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="max-w-[6.5rem] truncate text-[10px] font-medium leading-none">
                  {playerName} {actionLabel}
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* 效果提示等子内容：与卡片协同入场/离场 */}
        {children && (
          <motion.div variants={childrenVariants} className="flex flex-col items-center">
            {children}
          </motion.div>
        )}
      </motion.div>
    </MotionConfig>
  );
}
