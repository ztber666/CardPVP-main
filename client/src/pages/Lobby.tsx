import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore, normalizeNickname } from '../store/settingsStore';
import { useIsLandscape } from '../hooks/useOrientation';
import CollectionModal from '../components/CollectionModal';
import RulesModal from '../components/RulesModal';
import SettingsModal from '../components/SettingsModal';
import NicknameModal from '../components/NicknameModal';
import { useT } from '../i18n/i18n';

export default function Lobby() {
  const t = useT();
  const { connected } = useGameStore();
  const nickname = useSettingsStore((s) => s.nickname);
  const setNickname = useSettingsStore((s) => s.setNickname);
  const isLandscape = useIsLandscape();
  const [showCollection, setShowCollection] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // 未设置昵称时点击「开始」弹出的创建昵称提示
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(false);

  const handleStart = () => {
    // 没有昵称先提示创建，创建成功后再进入房间列表
    if (!normalizeNickname(nickname)) {
      setShowNicknamePrompt(true);
      return;
    }
    useGameStore.getState().setPage('roomList');
  };

  // 创建昵称并进入房间列表
  const handleNicknameConfirm = (name: string) => {
    setNickname(name);
    setShowNicknamePrompt(false);
    useGameStore.getState().setPage('roomList');
  };

  const currentNickname = normalizeNickname(nickname);

  // 按钮公共样式
  const btnBase = 'w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed';

  // 左侧 Logo + 文本
  const LogoBlock = (
    <div className="flex flex-col items-center animate-fade-in">
      <img src="/assets/game.png" alt="" className="w-28 h-28 mb-4 drop-shadow-lg" />
      <h1 className="text-4xl font-bold text-gradient">CardPVP</h1>
      <p className="text-text-secondary mt-2 text-lg">{t('线上卡牌对战', 'Online Card Battle')}</p>
    </div>
  );

  // 右侧 3 个按钮
  const ButtonBlock = (
    <div className={`flex flex-col gap-4 ${isLandscape ? 'w-72' : 'w-full max-w-xs mx-auto'}`}>
      <button
        onClick={handleStart}
        disabled={!connected}
        className={`${btnBase} bg-accent-shield/20 border-2 border-accent-shield/40 text-accent-shield hover:bg-accent-shield/30 hover:border-accent-shield/60 shadow-lg shadow-accent-shield/10`}
      >
        ⚔️ {t('开始', 'Start')}
      </button>
      {/* 当前昵称（未设置时提示点击开始创建） */}
      <p className="text-center text-xs text-text-secondary/70 -mt-1">
        {currentNickname
          ? `${t('昵称', 'Nickname')}：${currentNickname}`
          : t('尚未设置昵称，点击开始创建', 'No nickname yet — click Start to create one')}
      </p>
      <button
        onClick={() => setShowRules(true)}
        className={`${btnBase} bg-card-bg border-2 border-card-border text-text-primary hover:border-accent-shield/30 hover:bg-card-bg/80`}
      >
        📋 {t('规则', 'Rules')}
      </button>
      <button
        onClick={() => setShowCollection(true)}
        className={`${btnBase} bg-card-bg border-2 border-card-border text-text-primary hover:border-accent-shield/30 hover:bg-card-bg/80`}
      >
        📖 {t('图鉴', 'Gallery')}
      </button>
      <button
        onClick={() => setShowSettings(true)}
        className={`${btnBase} bg-card-bg border-2 border-card-border text-text-primary hover:border-accent-shield/30 hover:bg-card-bg/80`}
      >
        ⚙️ {t('设置', 'Settings')}
      </button>
    </div>
  );

  return (
    <div className="min-h-viewport flex items-center justify-center p-6">
      {isLandscape ? (
        <div className="flex items-center justify-center gap-16 w-full max-w-3xl">
          {LogoBlock}
          {ButtonBlock}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-10 w-full">
          {LogoBlock}
          {ButtonBlock}
        </div>
      )}

      {/* 弹窗 */}
      {showCollection && (
        <CollectionModal onClose={() => setShowCollection(false)} />
      )}
      {showRules && (
        <RulesModal onClose={() => setShowRules(false)} />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {showNicknamePrompt && (
        <NicknameModal
          initial={nickname}
          title={t('创建昵称', 'Create nickname')}
          desc={t('还没有昵称，先创建一个吧，创建房间时会使用它。', 'No nickname yet — create one first; it will be used when you create a room.')}
          confirmText={t('保存并开始', 'Save & Start')}
          onConfirm={handleNicknameConfirm}
          onClose={() => setShowNicknamePrompt(false)}
        />
      )}
    </div>
  );
}
