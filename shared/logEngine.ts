// ============================================================
// logEngine.ts — 统一日志引擎
// ============================================================
import {
    BUFF_NAMES,
  GameLogType,
  type BuffType,
  type ContentSegment,
  type GameState,
  type PlayerState,
} from './types';
import { MAX_LOG_ENTRIES } from './constants';

// ============================================================
// 1. 类型定义
// ============================================================

// ----- 各 type 专属 payload -----

export interface PlayCardPayload {
    type: 'playCard';
    playerId: string;
    cardId: string;
    targetId: string;
}
export interface DrawCardPayload {
  type: 'drawCard';
  playerId: string;
  count: number;
  /** 本次摸牌是否触发爆牌，触发时带弃牌数 */
  overflow?: number;
}

export interface DiscardPayload {
  type: 'discard',
  playerId: string;
  cardId: string;
  unEquip?: boolean;
}

export interface TriggerBuffPayload {
  type: 'triggerBuff';
  playerId: string;
  buffType: BuffType;
  sourceCardId?: string;
  stacks?: number;
}

export interface BuffChangePayload {
  type: 'buffChange';
  playerId: string;
  changes: BuffChange[];
}

export interface BuffChange {
    buffType: BuffType;
    from?: number;
    to?: number;
    removed?: boolean;
}
export interface EndActionPayload {
  type: 'endAction';  
  playerId: string;
  reason?: 'manual' | 'timeout' | 'surrender';
}

/** 新增 type 时只需在这里加一行 */
export interface GameLogPayloadMap {
  [GameLogType.DrawCard]:    DrawCardPayload;
  [GameLogType.Discard]:     DiscardPayload;
  [GameLogType.TriggerBuff]: TriggerBuffPayload;
  [GameLogType.BuffChange]:  BuffChangePayload;
  [GameLogType.EndAction]:   EndActionPayload;
  [GameLogType.PlayCard]:    PlayCardPayload;
}

// ----- 通用基类 -----

interface LogEntryBase {
  playerId: string;
  timestamp: number;
  /** 纯文本回退，UI 无法解析 type 时展示 */
  message: string;
  /** 结构化内容：每行一个 ContentSegment[] */
  segments?: ContentSegment[][];
}

/** 带 type 的日志条目（泛型，用于构造阶段类型约束） */
export type GameLogEntryOf<T extends GameLogType> = LogEntryBase & {
  type: T;
  payload: GameLogPayloadMap[T];
};

/** 无 type 的旧日志（兼容历史） */
export type LegacyLogEntry = LogEntryBase & { type?: undefined; payload?: undefined };

/** 最终存储类型 —— 判别联合 */
export type GameLogEntry =
  | { [T in GameLogType]: GameLogEntryOf<T> }[GameLogType]
  | LegacyLogEntry;

// ============================================================
// 2. 推送 / 裁剪
// ============================================================

/** 推送一条带 type 的日志，payload 会被类型约束 */
export function pushLog<T extends GameLogType>(
  s: GameState,
  entry: GameLogEntryOf<T>,
): void {
  //s.log.push(entry as GameLogEntry);
  trimLog(s);
}
/** 日志上限裁剪 */
export function trimLog(s: GameState): void {
  if (s.log.length > MAX_LOG_ENTRIES) {
    s.log.splice(0, s.log.length - MAX_LOG_ENTRIES);
  }
}

/** 向最后一条日志追加一行 segments（沿用现有 `s.log.at(-1)?.segments?.push(...)` 语义） */
export function appendLogSegments(s: GameState, line: ContentSegment[]): void {
  const last = s.log.at(-1);
  if (!last) return;
  if (!last.content) last.content = [];
  last.content.push(line);
}

// ============================================================
// 4. 读取侧 —— 按 type 收窄的辅助函数（可选）
// ============================================================

/** 日志中 type 为 T 的所有条目（payload 自动收窄） */
export type LogEntryOfType<T extends GameLogType> =
  Extract<GameLogEntry, { type: T }>;

export function filterLogByType<T extends GameLogType>(
  log: GameLogEntry[],
  type: T,
): Array<LogEntryOfType<T>> {
  return log.filter((e) => e.type === type) as Array<LogEntryOfType<T>>;
}