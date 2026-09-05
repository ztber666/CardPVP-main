import { ContentSegment } from '@shared/types';
import SegmentDetailImage from './SegmentDetailImage';

/**
 * 渲染单个内容段（不区分我方/对方视角，直接按原样输出）。
 * 用于通知弹窗（NotificationToast）等需要展示富内容段的场景。
 * 注：显示效果提示（TriggerEffectPanel）内部的 SegmentRenderer 带视角切换逻辑，本组件不处理。
 */
export default function SegmentRenderer({ segment }: { segment: ContentSegment }) {
  switch (segment.type) {
    case 'text':
      return (
        <span className={`truncate text-sm text-text-primary ${segment.bold ? 'font-bold' : ''}`}>
          {segment.text}
        </span>
      );

    case 'card':
    case 'buff':
      return <SegmentDetailImage segment={segment} />;

    case 'hpChange': {
      const delta = segment.hpDelta || 0;
      const isHeal = segment.isHeal ?? delta > 0;
      const displayText = segment.text || `${delta > 0 ? '+' : ''}${delta}`;

      return (
        <span className="whitespace-nowrap text-sm">
          {segment.playerName && (
            <span className="font-medium text-text-primary">{segment.playerName}</span>
          )}
          <span
            className={`ml-0.5 inline-block rounded-md px-1 py-px font-bold tabular-nums ${
              isHeal ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
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
