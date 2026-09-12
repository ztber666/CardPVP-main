import { useEffect, useRef, useState } from 'react';
import { NICKNAME_MAX_LENGTH, normalizeNickname } from '../store/settingsStore';
import { useT } from '../i18n/i18n';

interface NicknameModalProps {
  /** 初始昵称（编辑场景可传入当前值） */
  initial?: string;
  /** 确认：回调收到清理后的昵称（非空） */
  onConfirm: (nickname: string) => void;
  /** 关闭弹窗（不保存） */
  onClose: () => void;
  /** 标题，默认「设置昵称」 */
  title?: string;
  /** 说明文案，默认提示尚未设置昵称 */
  desc?: string;
  /** 确认按钮文案，默认「保存」 */
  confirmText?: string;
}

/**
 * 昵称创建/编辑弹窗。
 * 用于大厅点击「开始」但尚未设置昵称时的提示，也可复用到其它需要昵称的流程。
 */
export default function NicknameModal({
  initial = '',
  onConfirm,
  onClose,
  title,
  desc,
  confirmText,
}: NicknameModalProps) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开即聚焦，移动端也能直接输入
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const clean = normalizeNickname(value);

  const handleConfirm = () => {
    if (!clean) return;
    onConfirm(clean);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-sm w-full shadow-xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-text-primary mb-1">
          {title ?? t('设置昵称', 'Set nickname')}
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          {desc ?? t('还没有昵称，先创建一个吧，创建房间时会显示给对手。', 'No nickname yet — create one first; it will be shown to your opponent.')}
        </p>

        <input
          ref={inputRef}
          type="text"
          placeholder={t('输入昵称', 'Enter nickname')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
          maxLength={NICKNAME_MAX_LENGTH}
          className="w-full bg-page-bg border border-card-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent-shield/50 transition-colors"
        />
        <p className="text-[11px] text-text-secondary/60 mt-1 text-right">
          {value.length}/{NICKNAME_MAX_LENGTH}
        </p>

        <div className="flex gap-3 mt-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-card-border text-text-secondary text-sm font-medium hover:bg-card-bg/50 transition-colors"
          >
            {t('取消', 'Cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!clean}
            className="flex-1 py-2.5 rounded-xl bg-accent-shield/20 border border-accent-shield/30 text-accent-shield text-sm font-semibold hover:bg-accent-shield/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {confirmText ?? t('保存', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
