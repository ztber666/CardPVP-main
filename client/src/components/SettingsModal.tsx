import { useSettingsStore, type PlayedCardHint } from '../store/settingsStore';

/* ---------- 设置弹窗 ---------- */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const cardOverlayDuration = useSettingsStore((s) => s.cardOverlayDuration);
  const setCardOverlayDuration = useSettingsStore((s) => s.setCardOverlayDuration);
  const playedCardHint = useSettingsStore((s) => s.playedCardHint);
  const setPlayedCardHint = useSettingsStore((s) => s.setPlayedCardHint);

  // 打出提示时长档位
  const overlayOptions = [
    { label: '快', value: 3000 },
    { label: '中', value: 5000 },
    { label: '慢', value: 7000 },
  ];
  const currentOverlayLabel = overlayOptions.find(o => o.value === cardOverlayDuration)?.label ?? '中';

  // 打出牌提示形式
  const hintOptions: { label: string; value: PlayedCardHint; desc: string }[] = [
    { label: '卡片', value: 'card', desc: '弹出完整卡牌动画' },
    { label: '提示框', value: 'toast', desc: '用消息框显示文字+卡图' },
  ];

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

        {/* ===== 打出表现 ===== */}
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">打出表现</h3>

          {/* 打出牌提示形式 */}
          <div className="mb-4">
            <div className="flex items-center justify-between bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2.5 mb-1">
              <span className="text-sm text-text-primary">打出牌提示</span>
              <div className="flex items-center gap-1">
                {hintOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPlayedCardHint(opt.value)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      playedCardHint === opt.value
                        ? 'bg-accent-shield/25 border border-accent-shield/40 text-accent-shield'
                        : 'bg-transparent border border-transparent text-text-secondary hover:bg-card-bg/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-text-secondary/60 mb-3">
              {hintOptions.find(o => o.value === playedCardHint)?.desc}
            </p>
          </div>

          {/* 打出提示时长 */}
          <div className="flex items-center justify-between bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2.5 mb-1">
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
          <p className="text-[11px] text-text-secondary/60 mt-1">
            当前：{currentOverlayLabel}（{cardOverlayDuration}ms）
          </p>
        </div>
      </div>
    </div>
  );
}
