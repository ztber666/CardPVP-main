import { create } from 'zustand';

const STORAGE_KEY = 'cardPvpSettings';

/** 打出牌提示样式：卡片（弹出完整卡牌 Overlay） / 提示框（用 displayMessage 弹出文字+卡图） */
export type PlayedCardHint = 'card' | 'toast';

/** 界面语言 */
export type AppLang = 'zh' | 'en';

/** 从 localStorage 读取已保存的设置 */
function loadSettings(): { cardOverlayDuration?: number; playedCardHint?: PlayedCardHint; lang?: AppLang } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch { /* 忽略损坏数据 */ }
  return {};
}

/** 持久化设置到 localStorage */
function persist(settings: { cardOverlayDuration: number; playedCardHint: PlayedCardHint; lang: AppLang }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* 忽略存储失败 */ }
}

interface SettingsStore {
  /** 打出提示（PlayedCardOverlay）和打出效果提示（TriggerEffectPanel）的显示时长（毫秒） */
  cardOverlayDuration: number;
  /** 打出牌提示形式：卡片 Overlay 或 提示框 */
  playedCardHint: PlayedCardHint;
  /** 界面语言 */
  lang: AppLang;
  /** 设置显示时长 */
  setCardOverlayDuration: (ms: number) => void;
  /** 设置打出牌提示形式 */
  setPlayedCardHint: (mode: PlayedCardHint) => void;
  /** 设置界面语言 */
  setLang: (lang: AppLang) => void;
}

/**
 * 全局显示设置 store。
 *
 * 包含打出提示相关设置（时长 + 形式），通过 localStorage 持久化，刷新/重开后仍保留。
 */
export const useSettingsStore = create<SettingsStore>((set) => {
  const loaded = loadSettings();
  return {
  cardOverlayDuration: loaded.cardOverlayDuration ?? 5000,
  playedCardHint: loaded.playedCardHint ?? 'card',
  lang: loaded.lang ?? 'zh',
  setCardOverlayDuration: (ms) => {
    set((s) => {
      persist({ cardOverlayDuration: ms, playedCardHint: s.playedCardHint, lang: s.lang });
      return { cardOverlayDuration: ms };
    });
  },
  setPlayedCardHint: (mode) => {
    set((s) => {
      persist({ cardOverlayDuration: s.cardOverlayDuration, playedCardHint: mode, lang: s.lang });
      return { playedCardHint: mode };
    });
  },
  setLang: (lang) => {
    set((s) => {
      persist({ cardOverlayDuration: s.cardOverlayDuration, playedCardHint: s.playedCardHint, lang });
      return { lang };
    });
  },
  };
});
