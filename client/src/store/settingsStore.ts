import { create } from 'zustand';

const STORAGE_KEY = 'cardPvpSettings';

/** 从 localStorage 读取已保存的设置 */
function loadSettings(): { cardOverlayDuration?: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch { /* 忽略损坏数据 */ }
  return {};
}

/** 持久化设置到 localStorage */
function persist(settings: { cardOverlayDuration: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* 忽略存储失败 */ }
}

interface SettingsStore {
  /** 打出提示（PlayedCardOverlay）和打出效果提示（TriggerEffectPanel）的显示时长（毫秒） */
  cardOverlayDuration: number;
  /** 设置显示时长（未来设置界面调用） */
  setCardOverlayDuration: (ms: number) => void;
}

/**
 * 全局显示设置 store。
 *
 * 目前仅包含打出提示相关时长，后续添加设置界面时在此扩展。
 * 通过 localStorage 持久化，刷新/重开后仍保留。
 */
export const useSettingsStore = create<SettingsStore>((set) => ({
  cardOverlayDuration: loadSettings().cardOverlayDuration ?? 5000,
  setCardOverlayDuration: (ms) => {
    set({ cardOverlayDuration: ms });
    persist({ cardOverlayDuration: ms });
  },
}));
