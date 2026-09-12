import { useSettingsStore, type PlayedCardHint, type AppLang, NICKNAME_MAX_LENGTH } from '../store/settingsStore';
import { useT } from '../i18n/i18n';

/* ---------- 设置弹窗 ---------- */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const nickname = useSettingsStore((s) => s.nickname);
  const setNickname = useSettingsStore((s) => s.setNickname);
  const cardOverlayDuration = useSettingsStore((s) => s.cardOverlayDuration);
  const setCardOverlayDuration = useSettingsStore((s) => s.setCardOverlayDuration);
  const playedCardHint = useSettingsStore((s) => s.playedCardHint);
  const setPlayedCardHint = useSettingsStore((s) => s.setPlayedCardHint);
  const lang = useSettingsStore((s) => s.lang);
  const setLang = useSettingsStore((s) => s.setLang);

  // 打出提示时长档位
  const overlayOptions = [
    { label: t('快', 'Fast'), value: 3000 },
    { label: t('中', 'Normal'), value: 5000 },
    { label: t('慢', 'Slow'), value: 7000 },
  ];
  const currentOverlayLabel = overlayOptions.find(o => o.value === cardOverlayDuration)?.label ?? t('中', 'Normal');

  // 语言选项
  const langOptions: { label: string; value: AppLang }[] = [
    { label: '中文', value: 'zh' },
    { label: 'English', value: 'en' },
  ];

  // 打出牌提示形式
  const hintOptions: { label: string; value: PlayedCardHint; desc: string }[] = [
    { label: t('卡片', 'Card'), value: 'card', desc: t('弹出完整卡牌动画', 'Show the full card animation') },
    { label: t('提示框', 'Toast'), value: 'toast', desc: t('用消息框显示文字+卡图', 'Show text and image in a message box') },
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
          <h2 className="text-xl font-bold text-text-primary">{t('设置', 'Settings')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-card-border flex items-center justify-center text-text-secondary hover:bg-card-bg/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ===== 昵称 ===== */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('昵称', 'Nickname')}</h3>
          <input
            type="text"
            placeholder={t('输入昵称', 'Enter nickname')}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            className="w-full bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent-shield/50 transition-colors"
          />
          <p className="text-[11px] text-text-secondary/60 mt-1">
            {t('创建或加入房间时会使用这个昵称，对手也能看到。', 'Used when creating or joining a room, and visible to your opponent.')}
          </p>
        </div>

        {/* ===== 语言 ===== */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('语言', 'Language')}</h3>
          <div className="flex items-center justify-between bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2.5">
            <span className="text-sm text-text-primary">{t('界面语言', 'UI language')}</span>
            <div className="flex items-center gap-1">
              {langOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setLang(opt.value)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    lang === opt.value
                      ? 'bg-accent-shield/25 border border-accent-shield/40 text-accent-shield'
                      : 'bg-transparent border border-transparent text-text-secondary hover:bg-card-bg/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ===== 打出表现 ===== */}
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('打出表现', 'Playback')}</h3>

          {/* 打出牌提示形式 */}
          <div className="mb-4">
            <div className="flex items-center justify-between bg-page-bg/60 border border-card-border/50 rounded-xl px-3 py-2.5 mb-1">
              <span className="text-sm text-text-primary">{t('打出牌提示', 'Played-card hint')}</span>
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
            <span className="text-sm text-text-primary">{t('打出提示时长', 'Hint duration')}</span>
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
            {t('当前', 'Current')}：{currentOverlayLabel}（{cardOverlayDuration}ms）
          </p>
        </div>
      </div>
    </div>
  );
}
