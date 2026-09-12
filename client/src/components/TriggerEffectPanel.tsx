import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTriggerStore } from '../store/triggerStore';
import { ContentSegment } from '@shared/types';
import SegmentDetailImage from './SegmentDetailImage';

interface Props {
  isMyTurn: boolean;
  myName: string;
}

/** 统一缓动曲线，让进出场保持一致的“顺”感 */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------------ */
/* 内容段渲染                                                          */
/* ------------------------------------------------------------------ */

function SegmentRenderer({ segment, myName }: { segment: ContentSegment; myName: string }) {
  switch (segment.type) {
    case 'text':
      return (
        <span className={segment.bold ? 'font-semibold text-text-primary' : 'text-text-secondary'}>
          {segment.text}
        </span>
      );

    case 'card':
    case 'buff':
      return <SegmentDetailImage segment={segment} />;

    case 'hpChange': {
      const delta = segment.hpDelta ?? 0;
      const isHeal = segment.isHeal ?? delta > 0;
      const displayText = segment.text || `${delta > 0 ? '+' : ''}${delta}`;

      return (
        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
          {segment.playerName && (
            <span className="font-medium text-text-primary/75">
              {segment.playerName === myName ? '我方' : '对手'}
            </span>
          )}
          <span
            className={`rounded px-1 font-semibold tabular-nums ${
              isHeal ? 'bg-emerald-500/12 text-emerald-400' : 'bg-rose-500/12 text-rose-400'
            }`}
          >
            {displayText}
          </span>
        </span>
      );
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* 单条提示                                                            */
/* ------------------------------------------------------------------ */

interface TriggerItemProps {
  entry: { id: number; segments: ContentSegment[]; createdAt: number };
  myName: string;
}

function TriggerItem({ entry, myName }: TriggerItemProps) {
  return (
    <div className="flex items-center gap-x-1.5 text-xs leading-5">
      <span className="h-1 w-1 shrink-0 rounded-full bg-accent-equip/80" />
      {entry.segments.map((seg, i) => (
        <SegmentRenderer key={i} segment={seg} myName={myName} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 面板主体                                                            */
/* ------------------------------------------------------------------ */

/**
 * 触发效果提示面板
 *
 * 宽度策略（退场同步收缩）：
 * - 屏幕外测量层只渲染「当前 triggers」，也就是 store 里已经移除过的条目，
 *   它的宽度就代表了「这条消息退场后应有的目标宽度 W_new」；
 * - 可见面板宽度直接补间到 W_new，同时条目高度 auto→0 折叠，
 *   两个维度共用一个 transition 时长，因此看不出先后。
 *
 * 之所以在 DOM 里再复制一份，是因为 AnimatePresence 会在可见层延迟删除
 * 退场条目，直接量可见层拿不到「移除后」的宽度。
 *
 * 间距策略：
 * - 面板 padding 下沉到测量层与可见内层（结构一致，宽度相同）；
 * - 每条 item 内层 py-1（上下对称），相邻间距固定 8px，与索引无关。
 */
export default function TriggerEffectPanel({ myName }: Props) {
  const triggers = useTriggerStore((s) => s.triggers);
  const visible = triggers.length > 0;

  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  // 观测「稳定态」宽度：store 里 triggers 变化后（不含退出条目）立即得到新宽度
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const update = () => {
      const w = el.getBoundingClientRect().width;
      setWidth((prev) => (prev !== w ? w : prev));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible]);

  return (
    <>
      {/*
        屏幕外测量层：
        - 只渲染当前 triggers（不含 AnimatePresence 的退出条目），
          因此每次 store 更新都会同步反映「目标宽度」；
        - w-max 让宽度只由内容决定，不受父级影响；
        - max-w-[320px] 是超长时的换行兜底，与可见层保持一致。
      */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 w-max max-w-[320px] px-4 py-1.5"
      >
        {triggers.map((entry) => (
          <div key={entry.id} className="py-1">
            <TriggerItem entry={entry} myName={myName} />
          </div>
        ))}
      </div>

      {/* 可见面板 */}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              // 首次未测量到宽度前不介入，交给 w-max 兜底
              ...(width != null ? { width } : {}),
            }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{
              default: { type: 'spring', stiffness: 400, damping: 32, mass: 0.8 },
              // 宽度与条目高度共用时长，视觉上同步收缩
              width: { duration: 0.3, ease: EASE_OUT },
            }}
            className="pointer-events-auto relative mt-1.5 w-max max-w-[320px] overflow-hidden rounded-2xl border border-card-border/70 bg-card-bg/95 shadow-xl backdrop-blur-md"
          >
            {/* 左侧主题色窄条 */}
            <span
              aria-hidden
              className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-accent-equip/80 to-accent-equip/20"
            />
            {/* 顶部发丝高光 */}
            <span
              aria-hidden
              className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
            />

            {/*
              内层与测量层结构完全一致（w-max + 相同 padding），
              这样宽度语义相同；动画期间由父级 overflow-hidden 裁剪右侧溢出，
              内容不会重排，收缩过程顺滑。
            */}
            <div className="w-max max-w-[320px] px-4 py-1.5">
              <AnimatePresence initial={false}>
                {triggers.map((entry) => (
                  <motion.div
                    key={entry.id}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      height: { duration: 0.3, ease: EASE_OUT },
                      opacity: { duration: 0.18, ease: 'easeOut' },
                    }}
                    className="shrink-0 overflow-hidden"
                  >
                    <div className="py-1">
                      <TriggerItem entry={entry} myName={myName} />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}