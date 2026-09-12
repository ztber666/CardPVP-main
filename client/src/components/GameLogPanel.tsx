import { useEffect, useRef } from 'react';
import { GameLogEntry, ContentSegment } from '@shared/types';
import SegmentDetailImage from './SegmentDetailImage';
import { useT } from '../i18n/i18n';
import { playerLabel } from '../utils/logText';

interface Props {
  log: GameLogEntry[];
  onClose: () => void;
  myPlayerId: string;
}

/** 渲染单个内容段 */
function SegmentRenderer({ segment, myPlayerId, isOpponent }: { segment: ContentSegment; myPlayerId: string; isOpponent?: boolean }) {
  switch (segment.type) {
    case 'text': {
      return (
        <span className={`text-[13px] leading-relaxed ${segment.bold ? 'font-semibold text-text-primary' : 'text-text-secondary/90'}`}>
          {segment.text}
        </span>
      );
    }
    case 'card':
    case 'buff':
      // 可点击小图：点击弹出卡牌图鉴 / buff 介绍
      return <SegmentDetailImage segment={segment} />;
    case 'player': {
      // 人称段：与我方 id 相同 → 你，否则 → 对方
      const isSelf = !!segment.playerId && segment.playerId === myPlayerId;
      return (
        <span className={`text-[13px] font-semibold ${isSelf ? 'text-sky-400' : 'text-rose-400'}`}>
          {playerLabel(segment.playerId, myPlayerId)}
        </span>
      );
    }
    case 'hpChange': {
      const delta = segment.hpDelta || 0;
      // 修复原有逻辑：若 isHeal 为 undefined，则根据 delta 判断
      const isHeal = segment.isHeal ?? (delta > 0);
      const displayText = segment.text || `${delta > 0 ? '+' : ''}${delta}`;
      return (
        <span className="text-[13px] font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/20 backdrop-blur-sm">
          {segment.playerName && (
            <span className="text-text-secondary text-[12px]">{segment.playerName}</span>
          )}
          <span className={isHeal ? 'text-emerald-400' : 'text-red-400'}>
            {displayText}
          </span>
        </span>
      );
    }
    default:
      return null;
  }
}

/** 渲染一行内容（多个段并排） */
function LineRenderer({ segments, myPlayerId, isOpponent }: { segments: ContentSegment[]; myPlayerId: string; isOpponent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap leading-relaxed py-0.5">
      {segments.map((seg, i) => (
        <SegmentRenderer key={i} segment={seg} myPlayerId={myPlayerId} isOpponent={isOpponent} />
      ))}
    </div>
  );
}

export default function GameLogPanel({ log, onClose, myPlayerId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = useT();

  // 打开时及日志更新时平滑滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [log]);

  return (
    <>
      {/* 背景遮罩：增加过渡动画 */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] animate-fade-in" 
        onClick={onClose} 
      />
      
      {/* 面板主体：现代玻璃拟态 */}
      <div className="fixed right-0 top-0 h-full w-[400px] max-w-[90vw] bg-card-bg/80 backdrop-blur-2xl border-l border-white/10 shadow-2xl shadow-black/30 z-[60] animate-slide-in-right flex flex-col rounded-l-3xl overflow-hidden">
        
        {/* 头部区域 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            {/* 渐变指示条 */}
            <div className="w-1 h-6 bg-gradient-to-b from-accent-primary to-accent-primary/40 rounded-full" />
            <h3 className="text-lg font-semibold text-text-primary tracking-wider">{t('战斗记录', 'Battle Log')}</h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-text-secondary hover:text-text-primary transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区域：渲染结构化日志 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3 scroll-smooth">
          {log.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary/50">
              <p className="text-sm">{t('暂无战斗记录', 'No battle records yet')}</p>
            </div>
          )}

          {log.map((entry, idx) => {
            // 结构化内容：entry.content 是「每行一个 ContentSegment[]」
            const lines = entry.content ?? [];
            // 没有内容的条目（例如尚未补充文案的回合结束条目）不渲染空卡片
            if (lines.length === 0) return null;

            // 判断是否为当前玩家的行动
            const isMyAction = entry.playerId === myPlayerId;
            const isOpponentAction = entry.playerId && entry.playerId !== myPlayerId;

            // 根据类型分配高级感样式
            let cardClasses = "border rounded-xl p-3.5 transition-all duration-300 ";
            
            if (isMyAction) {
              // 我方行动：蓝色框体系
              cardClasses += "border-sky-500/20 bg-sky-500/[0.04] border-l-[3px] border-l-sky-400/70";
            } else if (isOpponentAction) {
              // 敌方行动：红色框体系
              cardClasses += "border-rose-500/20 bg-rose-500/[0.04] border-l-[3px] border-l-rose-400/70";
            } else {
              // 纯文本或系统默认
              cardClasses += "border-white/[0.06] bg-white/[0.02]";
            }

            return (
              <div key={idx} className={cardClasses}>
                {/* 结构化内容（每行一组 segments ）*/}
                <div className="space-y-1">
                  {lines.map((segs, lineIdx) => (
                    <LineRenderer key={lineIdx} segments={segs} myPlayerId={myPlayerId} isOpponent={!!isOpponentAction} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
