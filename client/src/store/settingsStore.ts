import { create } from 'zustand';

const STORAGE_KEY = 'cardPvpSettings';

/** 打出牌提示样式：卡片（弹出完整卡牌 Overlay） / 提示框（用 displayMessage 弹出文字+卡图） */
export type PlayedCardHint = 'card' | 'toast';

/** 从 localStorage 读取已保存的设置 */
function loadSettings(): { cardOverlayDuration?: number; playedCardHint?: PlayedCardHint } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch { /* 忽略损坏数据 */ }
  return {};
}

/** 持久化设置到 localStorage */
function persist(settings: { cardOverlayDuration: number; playedCardHint: PlayedCardHint }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* 忽略存储失败 */ }
}

interface SettingsStore {
  /** 打出提示（PlayedCardOverlay）和打出效果提示（TriggerEffectPanel）的显示时长（毫秒） */
  cardOverlayDuration: number;
  /** 打出牌提示形式：卡片 Overlay 或 提示框 */
  playedCardHint: PlayedCardHint;
  /** 设置显示时长 */
  setCardOverlayDuration: (ms: number) => void;
  /** 设置打出牌提示形式 */
  setPlayedCardHint: (mode: PlayedCardHint) => void;
}

/**
 * 全局显示设置 store。
 *
 * 包含打出提示相关设置（时长 + 形式），通过 localStorage 持久化，刷新/重开后仍保留。
 */
export const useSettingsStore = create<SettingsStore>((set) => ({
  cardOverlayDuration: loadSettings().cardOverlayDuration ?? 5000,
  playedCardHint: loadSettings().playedCardHint ?? 'card',
  setCardOverlayDuration: (ms) => {
    set((s) => {
      persist({ cardOverlayDuration: ms, playedCardHint: s.playedCardHint });
      return { cardOverlayDuration: ms };
    });
  },
  setPlayedCardHint: (mode) => {
    set((s) => {
      persist({ cardOverlayDuration: s.cardOverlayDuration, playedCardHint: mode });
      return { playedCardHint: mode };
    });
  },
}));
