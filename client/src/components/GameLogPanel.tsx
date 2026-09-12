import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ContentSegment,
  GameLogEntry,
  GameLogType,
} from '@shared/types';
import SegmentDetailImage from './SegmentDetailImage';
import { buffName, useLang, useT } from '../i18n/i18n';
import { playerLabel } from '../utils/logText';
import { PlayCardPayload, DrawCardPayload, DiscardPayload, TriggerBuffPayload, BuffChangePayload, EndActionPayload } from '@shared/logEngine';

interface Props {
  log: GameLogEntry[];
  onClose: () => void;
  myPlayerId: string;
}

/* ==================================================================
 *  基础小件
 * ================================================================== */

function Glyph({ d, className = 'w-3.5 h-3.5' }: { d: string; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const D = {
  // 出牌：竖置卡牌，三条内部分隔线暗示牌面内容
  play: 'M7 3.5h9.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z M8.5 9.5h6.5 M8.5 13.5h4.5 M8.5 17h2.5',

  // 摸牌：向下箭头落入托槽
  draw: 'M12 3.5v10.5 M8.25 10.25 12 14l3.75-3.75 M4.5 15.5v2.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-2.5',

  // 弃牌：带提手与桶身的垃圾桶，内部两条竖线
  discard:
    'M4.5 6.5h15 M9.5 6.5V4.75a1.25 1.25 0 0 1 1.25-1.25h2.5A1.25 1.25 0 0 1 14.5 4.75V6.5 M6.5 6.5l.85 12.15A2 2 0 0 0 9.34 20.5h5.32a2 2 0 0 0 1.99-1.85L17.5 6.5 M10 10.5v6 M14 10.5v6',

  // 触发效果：主四角星 + 副四角星
  buff: 'M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4L6 9.5l4.4-1.6L12 3.5z M18 14.5l.75 2.25L21 17.5l-2.25.75L18 20.5l-.75-2.25L15 17.5l2.25-.75L18 14.5z',

  // 变化：左向上、右向下的双向箭头
  change:
    'M8 17.5V6.5 M4.75 9.75 8 6.5l3.25 3.25 M16 6.5v11 M12.75 14.25 16 17.5l3.25-3.25',

  // 旗帜：旗杆 + 燕尾旗面
  flag: 'M6 20.5V4 M6 4.5h11.5l-2.1 3.75 2.1 3.75H6',

  // 下拉箭头
  chevron: 'M6.5 9.5 12 15l5.5-5.5',

  // 文档：折角 + 两行文本
  doc: 'M13.5 3H7.5A2 2 0 0 0 5.5 5v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7.5L13.5 3z M13.5 3v4.5h5 M9 13h6 M9 17h4',
};

/* ------------------------------------------------------------------
 *  类型 → 视觉元信息
 *  原则：类型色只出现在【方框底色/描边 + 图标】，标签文字一律深色
 * ------------------------------------------------------------------ */
interface TypeMeta {
  box: string; // 方框底色 + 描边
  chip: string; // 图标底 + 图标色
  label: [string, string];
  labelCls: string; // 标签文字（深色）
  dim?: boolean;
}

const TYPE_META: Record<number, TypeMeta> = {
  [GameLogType.PlayCard]: {
    box: 'bg-amber-50 border-amber-200',
    chip: 'bg-amber-100 text-amber-700',
    label: ['出牌', 'Play'],
    labelCls: 'text-zinc-900',
  },
  [GameLogType.DrawCard]: {
    box: 'bg-zinc-50 border-zinc-200',
    chip: 'bg-zinc-100 text-zinc-500',
    label: ['摸牌', 'Draw'],
    labelCls: 'text-zinc-600',
    dim: true,
  },
  [GameLogType.Discard]: {
    box: 'bg-zinc-50 border-zinc-200',
    chip: 'bg-zinc-100 text-zinc-500',
    label: ['弃牌', 'Discard'],
    labelCls: 'text-zinc-600',
    dim: true,
  },
  [GameLogType.TriggerBuff]: {
    box: 'bg-violet-50 border-violet-200',
    chip: 'bg-violet-100 text-violet-700',
    label: ['触发效果', 'Trigger'],
    labelCls: 'text-zinc-900',
  },
  [GameLogType.BuffChange]: {
    box: 'bg-sky-50 border-sky-200',
    chip: 'bg-sky-100 text-sky-700',
    label: ['变化', 'Buff'],
    labelCls: 'text-zinc-900',
  },
};

const TYPE_ICON: Record<number, string> = {
  [GameLogType.PlayCard]: D.play,
  [GameLogType.DrawCard]: D.draw,
  [GameLogType.Discard]: D.discard,
  [GameLogType.TriggerBuff]: D.buff,
  [GameLogType.BuffChange]: D.change,
};

const NEUTRAL_META: TypeMeta = {
  box: 'bg-zinc-50 border-zinc-200',
  chip: 'bg-zinc-100 text-zinc-500',
  label: ['记录', 'Log'],
  labelCls: 'text-zinc-600',
};

const REASON: Record<string, [string, string]> = {
  manual: ['主动结束', 'Manual'],
  timeout: ['超时', 'Timeout'],
  surrender: ['投降', 'Surrender'],
};

/** 徽标：深色文字，保证小字号可读 */
function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'amber' | 'sky'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-zinc-100 text-zinc-600',
    amber: 'bg-amber-100 text-amber-700',
    sky: 'bg-sky-100 text-sky-700',
  };
  return (
    <span className={`px-1.5 py-[1px] rounded text-[10.5px] font-semibold leading-4 tabular-nums ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ==================================================================
 *  内容段渲染（整体深色文字）
 * ================================================================== */

function SegmentRenderer({ segment, myPlayerId }: { segment: ContentSegment; myPlayerId: string }) {
  switch (segment.type) {
    case 'text':
      return (
        <span
          className={`text-[13px] leading-[1.75] ${
            segment.bold ? 'font-semibold text-zinc-900' : 'font-normal text-zinc-600'
          }`}
        >
          {segment.text}
        </span>
      );
    case 'card':
    case 'buff':
      return <SegmentDetailImage segment={segment} />;
    case 'player': {
      const isSelf = !!segment.playerId && segment.playerId === myPlayerId;
      return (
        <span className={`text-[13px] font-semibold ${isSelf ? 'text-sky-700' : 'text-rose-700'}`}>
          {playerLabel(segment.playerId, myPlayerId)}
        </span>
      );
    }
    case 'hpChange': {
      const delta = segment.hpDelta || 0;
      const isHeal = segment.isHeal ?? delta > 0;
      const displayText = segment.text || `${delta > 0 ? '+' : ''}${delta}`;
      return (
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md text-[12px] font-semibold tabular-nums ${
            isHeal ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'
          }`}
        >
          {segment.playerName && <span className="font-normal text-zinc-500">{segment.playerName}</span>}
          {displayText}
        </span>
      );
    }
    default:
      return null;
  }
}

function LineRenderer({ segments, myPlayerId }: { segments: ContentSegment[]; myPlayerId: string }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap leading-[1.75]">
      {segments.map((seg, i) => (
        <SegmentRenderer key={i} segment={seg} myPlayerId={myPlayerId} />
      ))}
    </div>
  );
}

/* ==================================================================
 *  类型专属徽标（payload 增量信息，显示在头部右侧）
 * ================================================================== */

function TypeTags({ entry, myPlayerId }: { entry: GameLogEntry; myPlayerId: string }) {
  const t = useT();
  switch (entry.type) {
    case GameLogType.PlayCard: {
      const p = entry.payload as PlayCardPayload | undefined;
      if (!p?.targetId || p.targetId === p.playerId) return null;
      return <Tag tone="amber">→ {playerLabel(p.targetId, myPlayerId)}</Tag>;
    }
    case GameLogType.DrawCard: {
      const p = entry.payload as DrawCardPayload | undefined;
      return p?.count && p.count > 1 ? <Tag>×{p.count}</Tag> : null;
    }
    case GameLogType.Discard: {
      const p = entry.payload as DiscardPayload | undefined;
      return <Tag>{p?.unEquip ? t('卸下', 'Unequip') : t('弃置', 'Discard')}</Tag>;
    }
    case GameLogType.TriggerBuff: {
      const p = entry.payload as TriggerBuffPayload | undefined;
      return p?.stacks && p.stacks > 1 ? <Tag tone="sky">×{p.stacks}</Tag> : null;
    }
    default:
      return null;
  }
}

/** BuffChange 结构化 chips（content 已描述清楚时可删） */
function BuffChangeChips({ entry }: { entry: GameLogEntry }) {
  const t = useT();
  const p = entry.payload as BuffChangePayload | undefined;
  if (!p?.changes?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {p.changes.map((c, i) => {
        const up = (c.to ?? 0) > (c.from ?? 0);
        const down = (c.to ?? 0) < (c.from ?? 0);
        const cls = c.removed
          ? 'bg-zinc-100 text-zinc-400'
          : up
            ? 'bg-emerald-100 text-emerald-700'
            : down
              ? 'bg-red-100 text-red-700'
              : 'bg-zinc-100 text-zinc-600';
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded text-[10.5px] font-semibold leading-4 tabular-nums ${cls}`}
          >
            {String(buffName(useLang(), c.buffType))}{' '}
            {c.removed ? (
              <span className="line-through">{t('已移除', 'Removed')}</span>
            ) : (
              <>
                <span className="opacity-60">{c.from ?? 0}</span>
                <span className="opacity-70">{up ? '↑' : down ? '↓' : '→'}</span>
                <span>{c.to ?? 0}</span>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

/* ==================================================================
 *  条目：方框容器 + 类型头部
 * ================================================================== */

function TypedEntry({ entry, myPlayerId }: { entry: GameLogEntry; myPlayerId: string }) {
  const t = useT();
  const lines = entry.content ?? [];

  /* —— EndAction：细长条框 —— */
  if (entry.type === GameLogType.EndAction) {
    const p = entry.payload as EndActionPayload | undefined;
    const r = p?.reason ? REASON[p.reason] : undefined;
    return (
      <div className="animate-fade-in rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 px-4">
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-wider text-zinc-600">
          <Glyph d={D.flag} className="w-3 h-3 text-zinc-400" />
          {t('回合结束', 'Turn End')}
          {r && <span className="text-zinc-400">· {t(r[0], r[1])}</span>}
        </div>
      </div>
    );
  }

  if (lines.length === 0) return null;

  const meta = (entry.type != null && TYPE_META[entry.type]) || NEUTRAL_META;
  const icon = (entry.type != null && TYPE_ICON[entry.type]) || D.doc;

  return (
    <div className={`animate-fade-in rounded-xl border px-3.5 py-3 transition-colors duration-200 ${meta.box}`}>
      {/* 头部：左=图标+类型名（深色），右=类型徽标 */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${meta.chip}`}>
            <Glyph d={icon} />
          </span>
          <span className={`text-[12px] font-semibold tracking-wide truncate ${meta.labelCls}`}>
            {t(meta.label[0], meta.label[1])}
          </span>
        </div>
        <TypeTags entry={entry} myPlayerId={myPlayerId} />
      </div>

      {/* 正文：满宽排版 */}
      <div className="space-y-1">
        {lines.map((segs, i) => (
          <LineRenderer key={i} segments={segs} myPlayerId={myPlayerId} />
        ))}
      </div>

      {entry.type === GameLogType.BuffChange && <BuffChangeChips entry={entry} />}
    </div>
  );
}

/* ==================================================================
 *  主面板
 * ================================================================== */

export default function GameLogPanel({ log, onClose, myPlayerId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const t = useT();

  const visibleLog = log.filter((e) => (e.content ?? []).length > 0 || e.type === GameLogType.EndAction);

  // ★ 打开面板：绘制前同步定位到底部，无滑动动画
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // 打开后更新：贴底则无动画跟随，否则提示
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [log]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-[60] animate-fade-in" onClick={onClose} />

      <div
        className="fixed right-0 top-0 h-full w-[400px] max-w-[90vw] z-[60] flex flex-col animate-slide-in-right
          bg-white/95 backdrop-blur-2xl border-l border-black/[0.08] shadow-2xl shadow-black/15"
      >
        {/* 头部 */}
        <header className="flex items-center justify-between h-16 px-5 shrink-0 border-b border-black/[0.08]">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[15px] font-semibold text-zinc-900 tracking-wide">{t('牌局记录', 'Battle Log')}</h3>
            <span className="text-[11px] text-zinc-400 tabular-nums">{visibleLog.length}</span>
          </div>
          <button
            onClick={onClose}
            aria-label={t('关闭', 'Close')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500
              hover:text-zinc-900 hover:bg-black/[0.06] transition-colors duration-200"
          >
            <Glyph d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
          </button>
        </header>

        {/* 内容区：方框堆叠 */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto px-4 py-4 space-y-2.5 antialiased
              [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-black/[0.15] hover:[&::-webkit-scrollbar-thumb]:bg-black/[0.25]
              [&::-webkit-scrollbar-track]:bg-transparent"
          >
            {visibleLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400">
                <Glyph d={D.doc} className="w-9 h-9 opacity-60" />
                <p className="text-[12px] tracking-wider">{t('暂无牌局记录', 'No battle records yet')}</p>
              </div>
            ) : (
              visibleLog.map((entry, idx) => <TypedEntry key={idx} entry={entry} myPlayerId={myPlayerId} />)
            )}
          </div>

          {/* 顶部渐隐 */}
          <div className="pointer-events-none absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-white/80 to-transparent" />

          {showJump && visibleLog.length > 0 && (
            <button
              onClick={() =>
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
              }
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wide
                bg-white hover:bg-zinc-50 border border-black/[0.1] shadow-lg shadow-black/[0.08] backdrop-blur-md
                text-zinc-700 hover:text-zinc-900 transition-all duration-200"
            >
              <Glyph d={D.chevron} className="w-3 h-3" />
              {t('回到最新', 'Latest')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}