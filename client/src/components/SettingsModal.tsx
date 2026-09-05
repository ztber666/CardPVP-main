import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { displayMessage } from '../store/notificationStore';

/* ---------- 复制工具（兼容移动端） ---------- */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* 回退 */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* ---------- 设置弹窗 ---------- */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const player = useGameStore((s) => s.player);
  const cardOverlayDuration = useSettingsStore((s) => s.cardOverlayDuration);
  const setCardOverlayDuration = useSettingsStore((s) => s.setCardOverlayDuration);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // 打出提示时长档位
  const overlayOptions = [
    { label: '快', value: 3000 },
    { label: '中', value: 5000 },
    { label: '慢', value: 7000 },
  ];
  const currentOverlayLabel = overlayOptions.find(o => o.value === cardOverlayDuration)?.label ?? '中';

  const handleCopy = async (text: string, field: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } else {
      displayMessage('复制失败，请手动选中复制');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl animate-fade-in my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">设置</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-card-border flex items-center justify-center text-text-secondary hover:bg-card-bg/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ===== 账户 / 重连 ===== */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">账户 / 重连</h3>
          {player ? (
            <div className="flex flex-col gap-2.5">
              {/* 昵称 */}
              <div className="flex items-center gap-2 bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2">
                <span className="text-xs text-text-secondary/70 shrink-0 w-12">昵称</span>
                <span className="text-sm text-text-primary flex-1 truncate">{player.name}</span>
              </div>
              {/* 房间号 */}
              <div className="flex items-center gap-2 bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2">
                <span className="text-xs text-text-secondary/70 shrink-0 w-12">房间号</span>
                <span className="text-sm text-text-primary flex-1 truncate">{player.roomId || '--'}</span>
                <button
                  onClick={() => handleCopy(player.roomId || '', 'room')}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 transition-all text-xs"
                >
                  {copiedField === 'room' ? '✓' : '📋'}
                </button>
              </div>
              {/* token（只读 + 复制） */}
              <div className="flex items-center gap-2 bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2">
                <span className="text-xs text-text-secondary/70 shrink-0 w-12">Token</span>
                <span className="text-sm text-text-primary flex-1 min-w-0 truncate font-mono">{player.token || '--'}</span>
                <button
                  onClick={() => handleCopy(player.token || '', 'token')}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 transition-all text-xs"
                >
                  {copiedField === 'token' ? '✓' : '📋'}
                </button>
              </div>
              <p className="text-[11px] text-text-secondary/60">Token 用于断线重连时的身份校验，仅展示，请妥善保管。</p>
            </div>
          ) : (
            <div className="text-center text-sm text-text-secondary/60 py-4 border border-dashed border-card-border/40 rounded-xl">
              暂无账户信息，创建或加入房间后生成
            </div>
          )}
        </div>

        {/* ===== 全局设置 ===== */}
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">全局设置</h3>
          <div className="flex items-center justify-between bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2.5">
            <span className="text-sm text-text-primary">打出提示时长</span>
            <div className="flex items-center gap-1">
              {overlayOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCardOverlayDuration(opt.value)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    cardOverlayDuration === opt.value
                      ? 'bg-accent-shield/25 border border-accent-shield/40 text-accent-shield'
                      : 'bg-transparent border border-transparent text-text-secondary hover:bg-card-bg/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-text-secondary/60 mt-2">
            当前：{currentOverlayLabel}（{cardOverlayDuration}ms）
          </p>
        </div>
      </div>
    </div>
  );
}
