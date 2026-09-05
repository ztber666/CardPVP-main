import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useIsLandscape } from '../hooks/useOrientation';
import CollectionModal from '../components/CollectionModal';
import RulesModal from '../components/RulesModal';
import SettingsModal from '../components/SettingsModal';

export default function Lobby() {
  const { connected } = useGameStore();
  const isLandscape = useIsLandscape();
  const [showCollection, setShowCollection] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleStart = () => {
    useGameStore.getState().setPage('roomList');
  };

  // 按钮公共样式
  const btnBase = 'w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed';

  // 左侧 Logo + 文本
  const LogoBlock = (
    <div className="flex flex-col items-center animate-fade-in">
      <img src="/assets/game.png" alt="" className="w-28 h-28 mb-4 drop-shadow-lg" />
      <h1 className="text-4xl font-bold text-gradient">CardPVP</h1>
      <p className="text-text-secondary mt-2 text-lg">线上卡牌对战</p>
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
        ⚔️ 开始
      </button>
      <button
        onClick={() => setShowRules(true)}
        className={`${btnBase} bg-card-bg border-2 border-card-border text-text-primary hover:border-accent-shield/30 hover:bg-card-bg/80`}
      >
        📋 规则
      </button>
      <button
        onClick={() => setShowCollection(true)}
        className={`${btnBase} bg-card-bg border-2 border-card-border text-text-primary hover:border-accent-shield/30 hover:bg-card-bg/80`}
      >
        📖 图鉴
      </button>
      <button
        onClick={() => setShowSettings(true)}
        className={`${btnBase} bg-card-bg border-2 border-card-border text-text-primary hover:border-accent-shield/30 hover:bg-card-bg/80`}
      >
        ⚙️ 设置
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
    </div>
  );
}
