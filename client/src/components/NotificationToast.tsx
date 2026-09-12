import React, { useEffect } from 'react';
import {
  AnimatePresence,
  motion,
  type Transition,
  type Variants,
} from 'framer-motion';
import { useNotificationStore } from '../store/notificationStore';
import type { ContentSegment } from '@shared/types';
import SegmentRenderer from './SegmentRenderer';

type ToastItem = { id: number; text: string; segments?: ContentSegment[] };

const AUTO_DISMISS_MS = 2200;

// 和你原来 CSS 里那条 ease-[cubic-bezier(0.32,0.72,0,1)] 一致
const EASE_SMOOTH: [number, number, number, number] = [0.32, 0.72, 0, 1];

// 位置补间：tween + 同曲线，无回弹，和退场同步
const layoutTransition: Transition = {
  duration: 0.5,
  ease: EASE_SMOOTH,
};

const toastVariants: Variants = {
  initial: { opacity: 0, y: -40, scale: 0.92, filter: 'blur(4px)' },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.45, ease: EASE_SMOOTH },
  },
  exit: {
    opacity: 0,
    y: -40,
    scale: 0.92,
    filter: 'blur(4px)',
    // 与 layoutTransition 同 duration、同 ease —— 视觉上像「一起在动」
    transition: { duration: 0.5, ease: EASE_SMOOTH },
  },
};

const Toast = ({ notification }: { notification: ToastItem }) => {
  const remove = useNotificationStore((s) => s.removeNotification);

  useEffect(() => {
    const timer = window.setTimeout(
      () => remove(notification.id),
      AUTO_DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [remove, notification.id]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    remove(notification.id);
  };

  return (
    <motion.div
      variants={toastVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onClick={handleClick}
      style={{ willChange: 'transform, opacity, filter' }}
      className="pointer-events-auto cursor-pointer flex items-center gap-2.5
        bg-card-bg/95 backdrop-blur-md border border-accent-attack/30 rounded-2xl
        px-4 py-2.5 shadow-lg shadow-black/20"
    >
      <img
        src="/assets/icons/notification.svg"
        alt="notification"
        className="w-4 h-4 text-accent-attack shrink-0"
      />
      {notification.segments?.length ? (
        <span className="flex items-center gap-1 min-w-0">
          {notification.segments.map((seg, i) => (
            <SegmentRenderer key={i} segment={seg} />
          ))}
        </span>
      ) : (
        <span className="text-sm text-text-primary font-medium">
          {notification.text}
        </span>
      )}
    </motion.div>
  );
};

export default function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications);

  return (
    <div className="fixed inset-x-0 top-4 z-[60] flex flex-col items-center pointer-events-none">
      <AnimatePresence mode="popLayout" initial={false}>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            // 只对位置做补间，不动 size，省一层矩阵运算
            layout="position"
            transition={layoutTransition}
            // 用 padding 代替 flex gap：popLayout 时 gap 不参与补间，
            // 会给其余元素带来一帧的位移抖动
            className="pb-2"
          >
            <Toast notification={n} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}