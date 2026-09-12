import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket, type RoomInfo } from '../hooks/useSocket';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore, normalizeNickname, NICKNAME_MAX_LENGTH } from '../store/settingsStore';
import { useIsLandscape } from '../hooks/useOrientation';
import NicknameModal from '../components/NicknameModal';
import { displayMessage } from '../store/notificationStore';
import { useLang, useT, type AppLang } from '../i18n/i18n';

// 房间状态信息
const STATUS_INFO: Record<string, { text: string; dotClass: string }> = {
  waiting:      { text: '等待加入', dotClass: 'bg-yellow-400' },
  playing:      { text: '正在对战', dotClass: 'bg-blue-400' },
  reconnecting: { text: '等待重连', dotClass: 'bg-orange-400' },
  cleaning:     { text: '即将清除', dotClass: 'bg-red-400' },
};

const STATUS_EN: Record<string, string> = {
  waiting: 'Waiting',
  playing: 'In battle',
  reconnecting: 'Reconnect',
  cleaning: 'Closing soon',
};

function statusText(lang: AppLang, status: string): string {
  const info = STATUS_INFO[status];
  if (!info) return statusText(lang, 'playing');
  if (lang === 'en') return STATUS_EN[status] || info.text;
  return info.text;
}

// 房间图片
const ROOM_IMAGES = ['/assets/room/1.png', '/assets/room/2.png', '/assets/room/3.png', '/assets/room/4.png', '/assets/room/5.png', '/assets/room/6.png', '/assets/room/7.png', '/assets/room/8.png', '/assets/room/9.png', '/assets/room/10.png', '/assets/room/11.png', '/assets/room/12.png'];
function getRoomImage(roomId: string): string {
  const seed = parseInt(roomId, 10) || 0;
  return ROOM_IMAGES[seed % ROOM_IMAGES.length];
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const REFRESH_INTERVAL = 3; // 秒

export default function RoomList() {
  const { getRooms, createRoom, joinRoom } = useSocket();
  const { connected } = useGameStore();
  const isLandscape = useIsLandscape();
  const lang = useLang();
  const t = useT();

  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.toUpperCase() || '';
  });
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  // 昵称统一由全局设置维护（设置弹窗 / 大厅创建），这里直接读写 store
  const nickname = useSettingsStore((s) => s.nickname);
  const setNickname = useSettingsStore((s) => s.setNickname);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);

  // 未设置昵称却要创建房间时，先弹窗创建（创建完成后再继续建房）
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(false);

  // 重连校验弹窗
  const [verifyRoom, setVerifyRoom] = useState<RoomInfo | null>(null);
  const [verifyName, setVerifyName] = useState('');

  const displayName = normalizeNickname(nickname) || String.fromCodePoint(0x1F600 + Math.floor(Math.random() * 0x50));


  // 拉取房间列表
  const fetchRooms = useCallback(async () => {
    const list = await getRooms();
    setRooms(list);
  }, [getRooms]);

  // 倒计时 + 自动刷新
  useEffect(() => {
    setCountdown(REFRESH_INTERVAL);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchRooms();
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchRooms]);

  // 初次加载
  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // 手动刷新
  const handleRefresh = () => {
    fetchRooms();
    setCountdown(REFRESH_INTERVAL);
  };

  // 创建房间（先确保已有昵称）
  const handleCreate = async () => {
    if (!connected) return;
    if (!normalizeNickname(nickname)) {
      setShowNicknamePrompt(true);
      return;
    }
    await doCreate();
  };

  // 实际调用 createRoom —— 使用设置里的昵称（name 参数用于刚创建昵称、store 尚未重渲染的场景）
  const doCreate = async (name?: string) => {
    setLoading(true);
    setError(null);
    try {
      await createRoom(normalizeNickname(name ?? nickname) || displayName);
    } catch (e: any) {
      setError(e.message || t('创建房间失败', 'Failed to create room'));
    } finally {
      setLoading(false);
    }
  };

  // 昵称创建完成（保存到设置后继续建房）
  const handleNicknameConfirm = (name: string) => {
    setNickname(name);
    setShowNicknamePrompt(false);
    doCreate(name);
  };

  // 随机加入 — 只选「等待加入」状态的房间
  const handleRandomJoin = async () => {
    if (!connected) return;
    const joinable = rooms.filter(r => r.status === 'waiting');
    if (joinable.length === 0) {
      setError(t('没有可加入的房间', 'No rooms available to join'));
      setTimeout(() => setError(null), 3000);
      return;
    }
    const random = joinable[Math.floor(Math.random() * joinable.length)];
    await doJoin(random);
  };

  // 点击加入/重连按钮
  const handleJoin = (room: RoomInfo) => {
    if (!connected) return;
    //重连需要弹窗校验对方昵称（已注释掉，暂时停用）
   /* if (room.status === 'reconnecting' || room.status === 'cleaning') {
      // 重连需要弹窗校验对方昵称
      setVerifyRoom(room);
      setVerifyName('');
    } else {
      // 等待加入 → 直接进
      doJoin(room);
    } */
    doJoin(room);
  };

  // 实际调用 joinRoom
  const doJoin = async (room: RoomInfo, verify?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await joinRoom(room.id, displayName, verify);
      if (!result.success) {
        setError(result.error || t('加入房间失败', 'Failed to join room'));
      }
    } catch (e: any) {
      setError(e.message || t('加入房间失败', 'Failed to join room'));
    } finally {
      setLoading(false);
    }
  };

  // 弹窗确认重连
  const handleVerifyConfirm = async () => {
    if (!verifyRoom || !verifyName.trim()) return;
    await doJoin(verifyRoom, verifyName.trim());
    setVerifyRoom(null);
    setVerifyName('');
  };

  // 搜索过滤
  const filteredRooms = searchQuery.trim()
    ? rooms.filter(r => r.id.includes(searchQuery.trim().toUpperCase()))
    : rooms;

  // 房间列表项渲染
  const renderRoom = (room: RoomInfo) => {
    const info = STATUS_INFO[room.status] || STATUS_INFO.playing;
    const canJoin = room.status === 'waiting' || room.status === 'reconnecting' || room.status === 'cleaning';
    const joinLabel = room.status === 'waiting' ? t('加入', 'Join') : t('重连', 'Reconnect');
    return (
      <div
        key={room.id}
        className="flex items-center gap-3 bg-card-bg border border-card-border rounded-2xl p-3 hover:border-accent-shield/20 transition-colors"
      >
        <img
          src={getRoomImage(room.id)}
          alt=""
          className="shrink-0 w-14 h-14 rounded-xl object-cover border border-card-border/50"
          style={{ imageRendering: 'pixelated' }}
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-text-primary tracking-wider">{room.id}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${info.dotClass}`} />
            <span className="text-xs text-text-secondary">{statusText(lang, room.status)}</span>
            <span className="text-xs text-text-secondary/50 ml-2">{formatTime(room.elapsed)}</span>
          </div>
        </div>
        {canJoin && (
          <button
            onClick={() => handleJoin(room)}
            disabled={loading}
            className="shrink-0 px-5 py-2 rounded-xl bg-accent-shield/15 border border-accent-shield/25 text-accent-shield text-sm font-semibold hover:bg-accent-shield/25 transition-colors disabled:opacity-40"
          >
            {joinLabel}
          </button>
        )}
      </div>
    );
  };

  // 顶部返回栏
  const TopBar = (
    <div className="flex items-center gap-3 shrink-0">
      <button
        onClick={() => useGameStore.getState().setPage('lobby')}
        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-card-bg border border-card-border text-text-secondary hover:text-text-primary hover:border-accent-shield/30 transition-colors"
      >
        ←
      </button>
      <h1 className="text-lg font-bold text-text-primary">{t('房间列表', 'Rooms')}</h1>
    </div>
  );

  // 搜索框
  const SearchInput = (
    <input
      type="text"
      placeholder={t('查找房间...', 'Search rooms...')}
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
      className="w-full bg-card-bg border border-card-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent-shield/50 transition-colors uppercase tracking-widest"
      maxLength={6}
    />
  );

  // 刷新按钮（带倒计时）— 横屏用
  const RefreshBtn = (
    <button
      onClick={handleRefresh}
      className="w-full py-2 rounded-xl bg-card-bg border border-card-border text-text-secondary text-sm hover:text-accent-shield hover:border-accent-shield/30 transition-all active:scale-95 active:bg-accent-shield/10"
    >
      ↻ {t('刷新', 'Refresh')}({countdown}s)
    </button>
  );

  // 随机加入按钮
  const RandomJoinBtn = (
    <button
      onClick={handleRandomJoin}
      disabled={!connected || loading}
      className="w-full py-2.5 rounded-xl bg-accent-shield/15 border border-accent-shield/25 text-accent-shield text-sm font-semibold hover:bg-accent-shield/25 transition-colors disabled:opacity-40"
    >
      🎲 {t('随机加入', 'Random Join')}
    </button>
  );

  // 昵称输入（与「设置」中的昵称同一份数据）
  const NameInput = (
    <input
      type="text"
      placeholder={t('输入昵称', 'Nickname')}
      value={nickname}
      onChange={(e) => setNickname(e.target.value)}
      className="w-full bg-card-bg border border-card-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent-shield/50 transition-colors"
      maxLength={NICKNAME_MAX_LENGTH}
    />
  );

  // 昵称创建弹窗（创建后自动继续建房）
  const NicknamePromptModal = showNicknamePrompt && (
    <NicknameModal
      initial={nickname}
      title={t('创建昵称', 'Create nickname')}
      desc={t('创建房间需要先设置昵称，对手也能看到它。', 'Creating a room requires a nickname; your opponent will see it too.')}
      confirmText={t('保存并创建', 'Save & Create')}
      onConfirm={handleNicknameConfirm}
      onClose={() => setShowNicknamePrompt(false)}
    />
  );

  // 创建房间按钮
  const CreateBtn = (
    <button
      onClick={handleCreate}
      disabled={!connected || loading}
      className="w-full py-2.5 rounded-xl bg-accent-shield/20 border border-accent-shield/30 text-accent-shield text-sm font-semibold hover:bg-accent-shield/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading ? t('处理中...', 'Processing...') : t('创建房间', 'Create Room')}
    </button>
  );

  // 错误提示
  const ErrorMsg = error && (
    <p className="text-xs text-red-400 text-center">{error}</p>
  );

  // 重连校验弹窗
  const VerifyModal = verifyRoom && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setVerifyRoom(null)}
    >
      <div
        className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-text-primary mb-1">{t('重连房间', 'Reconnect to room')} {verifyRoom.id}</h2>
        <p className="text-sm text-text-secondary mb-4">{t('请输入对方昵称以校验身份', 'Enter the opponent nickname to verify')}</p>
        <input
          type="text"
          placeholder={t('对方昵称', 'Opponent nickname')}
          value={verifyName}
          onChange={(e) => setVerifyName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyConfirm(); }}
          className="w-full bg-page-bg border border-card-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent-shield/50 transition-colors mb-4"
          maxLength={12}
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={() => setVerifyRoom(null)}
            className="flex-1 py-2.5 rounded-xl border border-card-border text-text-secondary text-sm font-medium hover:bg-card-bg/50 transition-colors"
          >
            {t('取消', 'Cancel')}
          </button>
          <button
            onClick={handleVerifyConfirm}
            disabled={!verifyName.trim() || loading}
            className="flex-1 py-2.5 rounded-xl bg-accent-shield/20 border border-accent-shield/30 text-accent-shield text-sm font-semibold hover:bg-accent-shield/30 transition-colors disabled:opacity-40"
          >
            {loading ? t('加入中...', 'Joining...') : t('确认重连', 'Reconnect')}
          </button>
        </div>
      </div>
    </div>
  );

  if (isLandscape) {
    // ===== 横屏：左侧列表 + 右侧竖直控件 =====
    return (
      <>
        <div className="h-viewport flex flex-col bg-page-bg">
          <div className="px-4 pt-4 pb-2 border-b border-card-border/30">
            {TopBar}
          </div>
          <div className="flex-1 flex overflow-hidden">
            {/* 左侧：房间列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {filteredRooms.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-3">
                  <p className="text-sm">{searchQuery.trim() ? t('未找到匹配的房间', 'No matching rooms') : t('暂无房间', 'No rooms yet')}</p>
                  {!searchQuery.trim() && (
                    <button
                      onClick={handleCreate}
                      disabled={!connected || loading}
                      className="text-sm font-semibold text-accent-shield hover:text-accent-shield/80 active:scale-95 transition-all disabled:opacity-40"
                    >
                      {t('创建→', 'Create →')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredRooms.map(renderRoom)}
                </div>
              )}
            </div>
            {/* 右侧：竖直控件栏 */}
            <div className="shrink-0 w-64 px-4 py-3 border-l border-card-border/30 flex flex-col gap-3 items-center overflow-y-auto">
              {RandomJoinBtn}
              <div className="w-full">
                <label className="text-xs text-text-secondary mb-1 block text-center">{t('查找', 'Search')}</label>
                {SearchInput}
              </div>
              {RefreshBtn}
              <div className="w-full">
                <label className="text-xs text-text-secondary mb-1 block text-center">{t('昵称', 'Nickname')}</label>
                {NameInput}
              </div>
              {CreateBtn}
              {ErrorMsg}
            </div>
          </div>
        </div>
        {VerifyModal}
        {NicknamePromptModal}
      </>
    );
  }

  // ===== 竖屏：刷新按钮在右上角，底部昵称和创建分两行 =====
  return (
    <>
      <div className="h-viewport flex flex-col bg-page-bg">
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-card-border/30">
          <div className="flex items-center justify-between mb-3">
            {TopBar}
            <button
              onClick={handleRefresh}
              className="shrink-0 px-3 py-2 rounded-xl bg-card-bg border border-card-border text-text-secondary text-sm hover:text-accent-shield hover:border-accent-shield/30 transition-all active:scale-95 active:bg-accent-shield/10"
            >
              ↻ {t('刷新', 'Refresh')}({countdown}s)
            </button>
          </div>
          {SearchInput}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary">
              <p className="text-sm">{searchQuery.trim() ? t('未找到匹配的房间', 'No matching rooms') : t('暂无房间', 'No rooms yet')}</p>
              {!searchQuery.trim() && (
                <button
                  onClick={handleCreate}
                  disabled={!connected || loading}
                   className="text-sm font-semibold text-accent-shield hover:text-accent-shield/80 active:scale-95 transition-all disabled:opacity-40"
                >
                  创建→
                 </button>
               )}
              </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredRooms.map(renderRoom)}
            </div>
          )}
        </div>
        <div className="shrink-0 px-4 py-3 border-t border-card-border/30 bg-card-bg/30">
          <div className="space-y-2">
            {NameInput}
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!connected || loading}
                className="flex-1 py-2.5 rounded-xl bg-accent-shield/20 border border-accent-shield/30 text-accent-shield text-sm font-semibold hover:bg-accent-shield/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? t('处理中...', 'Processing...') : t('创建房间', 'Create Room')}
              </button>
              <button
                onClick={handleRandomJoin}
                disabled={!connected || loading}
                className="flex-1 py-2.5 rounded-xl bg-card-bg border border-card-border text-text-secondary text-sm font-semibold hover:text-accent-shield hover:border-accent-shield/30 transition-colors disabled:opacity-40 active:scale-95"
              >
                🎲 {t('随机加入', 'Random Join')}
              </button>
            </div>
          </div>
          {ErrorMsg}
        </div>
      </div>
      {VerifyModal}
      {NicknamePromptModal}
    </>
  );
}
