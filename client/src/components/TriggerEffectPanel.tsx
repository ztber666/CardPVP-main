import { useTriggerStore } from '../store/triggerStore';
import { useSettingsStore } from '../store/settingsStore';
import { ContentSegment } from '@shared/types';
import SegmentDetailImage from './SegmentDetailImage';

interface Props {
  isMyTurn: boolean;
  myName: string;
}

/** 根据当前回合视角处理文本前缀 */
function getDisplayText(segment: ContentSegment, isMyTurn: boolean): string {
  const rawText = segment.text || '';

  if (isMyTurn) {
    if (rawText.startsWith('自己')) {
      return `你${rawText.slice(2)}`;
    }
    return rawText;
  }

  // 对方视角
  if (rawText.startsWith('对方')) {
    return `你${rawText.slice(2)}`;
  }

  if (rawText.startsWith('自己')) {
    return `对方${rawText.slice(2)}`;
  }

  return rawText;
}

/** 渲染单个内容段 */
function SegmentRenderer({ segment, isMyTurn, myName }: { segment: ContentSegment; isMyTurn: boolean; myName: string }) {
  switch (segment.type) {
    case 'text': {
      const displayText = getDisplayText(segment, isMyTurn);

      return (
        <span
          className={`text-xs leading-5 text-text-secondary ${
            segment.bold ? 'font-bold text-text-primary' : ''
          }`}
        >
          {displayText}
        </span>
      );
    }

    case 'card':
    case 'buff':
      return <SegmentDetailImage segment={segment} />;

    case 'hpChange': {
      const delta = segment.hpDelta || 0;
      const isHeal = segment.isHeal ?? delta > 0;
      const displayText = segment.text || `${delta > 0 ? '+' : ''}${delta}`;

      return (
        <span className="text-xs leading-5 whitespace-nowrap">
          {segment.playerName && (
            <span className="font-medium text-text-primary">{segment.playerName === myName ? '我方' : '对手'}</span>
          )}
          <span
            className={`ml-0.5 inline-block rounded-md px-1 py-px font-bold tabular-nums ${
              isHeal
                ? 'bg-green-500/10 text-green-500'
                : 'bg-red-500/10 text-red-500'
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

/** 单条提示（独立淡出动画） */
function TriggerItem({
  entry,
  duration,
  isMyTurn,
  myName
}: {
  entry: { id: number; segments: ContentSegment[]; createdAt: number };
  duration: number;
  isMyTurn: boolean;
  myName: string;
}) {
  const fadeOutDelay = (duration - 400) / 1000;
  return (
    <div
      className="flex items-center gap-1 flex-wrap transition-all duration-500 ease-out"
      style={{
        animation: `triggerIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both, cardFadeOut 0.5s ease-in ${fadeOutDelay}s both`,
      }}
    >
      {/* 行首小圆点：主题色，呼应 Overlay 的 badge */}
      <span className="h-1 w-1 shrink-0 rounded-full bg-accent-equip/70" />
      {entry.segments.map((seg, i) => (
        <SegmentRenderer key={i} segment={seg} isMyTurn={isMyTurn} myName={myName} />
      ))}
    </div>
  );
}

/**
 * 触发效果提示面板
 * 展示在 PlayedCardOverlay 下方，外壳语言与打出提示框对齐：
 * rounded-2xl / 细边框 / 毛玻璃 / 顶部发丝高光 / 左侧主题色窄条。
 * 每条提示独立计算存在时间，超时淡化消失，下边的消息平滑跟着补上。
 */
export default function TriggerEffectPanel({ isMyTurn, myName }: Props) {
  const triggers = useTriggerStore((s) => s.triggers);
  const duration = useSettingsStore((s) => s.cardOverlayDuration);

  if (triggers.length === 0) return null;

  return (
    <div className="relative mt-1.5 flex max-w-[320px] flex-col items-start gap-1.5 overflow-hidden rounded-2xl border border-card-border/70 bg-card-bg/95 px-4 py-2.5 shadow-xl backdrop-blur-md pointer-events-auto">
      {/* 左侧主题色窄条：保留 accent 身份，替代原来的粗描边 */}
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-accent-equip/80 to-accent-equip/20"
      />
      {/* 顶部发丝高光：与 Overlay 顶部一致 */}
      <span
        aria-hidden
        className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      {triggers.map((entry) => (
        <TriggerItem key={entry.id} entry={entry} duration={duration} isMyTurn={isMyTurn} myName={myName} />
      ))}
    </div>
  );
}
