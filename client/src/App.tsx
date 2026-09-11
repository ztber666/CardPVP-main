import { useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useGameStore } from './store/gameStore';
import Lobby from './pages/Lobby';
import RoomList from './pages/RoomList';
import WaitingRoom from './pages/WaitingRoom';
import Game from './pages/Game';
import { useT } from './i18n/i18n';

export default function App() {
  const t = useT();
  const { connect, disconnect } = useSocket();
  const { connected, player, gameState, waitingForOpponent, page } = useGameStore();

  // 建立连接
  useEffect(() => {
    connect();
    // 双层 rAF + 微延迟：确保 React 首屏真正画完再通知加载条消失
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.dispatchEvent(new Event('app-ready'));
        }, 50);
      });
    });
    return () => { disconnect(); };
  }, []);

  // URL ?room=XXXX → 直接进房间列表（搜索框预填）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && !gameState && !waitingForOpponent && page === 'lobby') {
      useGameStore.getState().setPage('roomList');
    }
  }, []);

  // gameState 有值 → 自动进游戏页
  useEffect(() => {
    if (gameState && page !== 'game') {
      useGameStore.getState().setPage('game');
    }
    // 游戏结束后 gameState 变 null → 回大厅（由 Game.tsx 的返回大厅按钮处理 reload）
  }, [gameState]);

  // waitingForOpponent = true 且有 room → 进等待页
  useEffect(() => {
    if (waitingForOpponent && player?.roomId && page === 'roomList') {
      useGameStore.getState().setPage('waiting');
    }
  }, [waitingForOpponent, player, page]);

  // 渲染当前页面
  let content;
  switch (page) {
    case 'roomList':
      content = <RoomList />;
      break;
    case 'waiting':
      content = <WaitingRoom />;
      break;
    case 'game':
      content = <Game />;
      break;
    default:
      content = <Lobby />;
  }

  return (
    <div className="min-h-viewport bg-page-bg">
      {content}

      {/* 连接状态指示器 */}
      <div className="fixed bottom-4 right-4 flex items-center gap-2 text-xs z-10">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-text-secondary">{connected ? t('已连接', 'Connected') : t('未连接', 'Disconnected')}</span>
      </div>
    </div>
  );
}
