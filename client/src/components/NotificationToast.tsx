import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useNotificationStore } from '../store/notificationStore';
import type { ContentSegment } from '@shared/types';
import SegmentRenderer from './SegmentRenderer';

const Toast = ({ notification }: { notification: { id: number; text: string; segments?: ContentSegment[] } }) => {
  const remove = useNotificationStore((s) => s.removeNotification);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 触发入场动画
    const enterTimer = requestAnimationFrame(() => setVisible(true));
    
    // 提前触发退场动画 (2200ms)
    const exitTimer = window.setTimeout(() => {
      setVisible(false);
    }, 2200);

    return () => {
      cancelAnimationFrame(enterTimer);
      window.clearTimeout(exitTimer);
    };
  }, []);

  const handleRemove = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setVisible(false);
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    // 仅在退场动画结束时移除，避免入场动画结束也触发移除
    if (!visible) {
      remove(notification.id);
    }
  };

  return (
    <div
      onClick={handleRemove}
      onTransitionEnd={handleTransitionEnd}
      className={`pointer-events-auto cursor-pointer flex items-center gap-2.5 
        bg-card-bg/95 backdrop-blur-md border border-accent-attack/30 rounded-2xl 
        px-4 py-2.5 shadow-lg shadow-black/20
        transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${visible 
          ? 'opacity-100 translate-y-0 scale-100 blur-none' 
          : 'opacity-0 -translate-y-12 scale-90 blur-sm'}`}
    >
      <img src={`/assets/icons/notification.svg`} alt="notification" className="w-4 h-4 text-accent-attack shrink-0" />
      {notification.segments?.length ? (
        <span className="flex items-center gap-1 min-w-0">
          {notification.segments.map((seg, i) => (
            <SegmentRenderer key={i} segment={seg} />
          ))}
        </span>
      ) : (
        <span className="text-sm text-text-primary font-medium">{notification.text}</span>
      )}
    </div>
  );
};

export default function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications);
  const toastRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastOffsets = useRef<Map<number, number>>(new Map());

  // FLIP 动画：监听列表变化，为位置发生变动的 Toast 补齐过渡动画
  useLayoutEffect(() => {
    const currentOffsets = new Map<number, number>();
    
    toastRefs.current.forEach((el, id) => {
      if (!el) return;
      const top = el.offsetTop;
      currentOffsets.set(id, top);
      
      const lastTop = lastOffsets.current.get(id);
      if (lastTop !== undefined) {
        const dy = lastTop - top;
        // 如果位置上移了（dy > 0），说明上方有元素被移除，执行平滑上移动画
        if (dy !== 0) {
          if (el.getAnimations) {
            el.getAnimations().forEach(a => a.cancel());
          }
          el.animate([
            { transform: `translateY(${dy}px)` },
            { transform: 'translateY(0)' }
          ], {
            duration: 500,
            easing: 'cubic-bezier(0.32, 0.72, 0, 1)'
          });
        }
      }
    });

    lastOffsets.current = currentOffsets;
  }, [notifications]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
      {notifications.map((n) => (
        <div 
          key={n.id} 
          ref={(el) => {
            if (el) toastRefs.current.set(n.id, el);
            else toastRefs.current.delete(n.id);
          }}
        >
          <Toast notification={n} />
        </div>
      ))}
    </div>
  );
}
