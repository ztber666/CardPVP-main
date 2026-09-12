import type { ContentSegment, GameLogEntry } from '@shared/types';

/**
 * 日志内容段的读取工具。
 *
 * 日志条目的结构是 `content: ContentSegment[][]`（每行一个段数组），
 * 这里集中处理「把段渲染成人能读的文本」的逻辑，避免各组件各写一套。
 */

/**
 * `player` 段的人称：与我方 id 相同 → 「你」，否则 → 「对方」。
 * （服务端日志文本本身是中文，所以这里不接 i18n，避免中英混排。）
 */
export function playerLabel(playerId?: string, myPlayerId?: string): string {
  return playerId && myPlayerId && playerId === myPlayerId ? '你' : '对方';
}

/** 单个内容段 → 纯文本（用于无富文本渲染能力的场景，如“最后一条日志是否包含某提示”的判断） */
export function segmentPlainText(segment: ContentSegment, myPlayerId?: string): string {
  switch (segment.type) {
    case 'text':
      return segment.text ?? '';
    case 'player':
      return playerLabel(segment.playerId, myPlayerId);
    case 'hpChange': {
      const delta = segment.hpDelta ?? 0;
      return segment.text ?? `${delta > 0 ? '+' : ''}${delta}`;
    }
    case 'card':
      return '[卡牌]';
    case 'buff':
      return '[状态]';
    default:
      return '';
  }
}

/** 一条日志 → 纯文本（多行用空格连接） */
export function logEntryPlainText(entry?: GameLogEntry | null, myPlayerId?: string): string {
  if (!entry?.content) return '';
  return entry.content
    .map((line) => line.map((seg) => segmentPlainText(seg, myPlayerId)).join(''))
    .join(' ');
}
