import { useState, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useGameStore } from '../store/gameStore';
import { useIsLandscape } from '../hooks/useOrientation';
import { displayMessage } from '../store/notificationStore';
import { useT } from '../i18n/i18n';

export default function WaitingRoom() {
  const t = useT();
  const { leaveRoom, updateName } = useSocket();
  const { player } = useGameStore();
  const isLandscape = useIsLandscape();

  const roomId = player?.roomId ?? '';
  const [nickName, setNickName] = useState(player?.name ?? '');
  const [copied, setCopied] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 兼容移动端的复制：先试 Clipboard API，失败则回退 execCommand
  const copyText = async (text: string): Promise<boolean> => {
    // 现代API
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch { /* 继续回退 */ }
    }
    // 回退：隐藏 textarea + execCommand
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
  };

  // 复制房号
  const handleCopyRoom = async () => {
    const ok = await copyText(roomId);
    if (ok) {
      setCopied('room');
      setTimeout(() => setCopied(null), 2000);
    } else {
      displayMessage(t('复制失败，请手动选中复制', 'Copy failed, please copy manually'));
    }
  };

  // 分享链接
  const handleShareLink = async () => {
    const url = `${window.location.origin}?room=${roomId}`;
    const ok = await copyText(url);
    if (ok) {
      setCopied('link');
      setTimeout(() => setCopied(null), 2000);
    } else {
      displayMessage(t('复制失败，请手动选中复制', 'Copy failed, please copy manually'));
    }
  };

  // 昵称修改：防抖自动保存（输入停止 800ms 后触发）
  const handleNameChange = (value: string) => {
    setNickName(value);
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(async () => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === player?.name) return;
      setNameSaving(true);
      const result = await updateName(trimmed);
      setNameSaving(false);
      if (!result.success) {
        displayMessage(result.error || t('昵称更新失败', 'Failed to update nickname'));
      }
    }, 800);
  };

  // 取消匹配 → 返回房间列表
  const handleCancel = () => {
    leaveRoom();
    useGameStore.getState().setPage('roomList');
  };

  // 按钮公共样式
  const btnBase = 'w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.97]';

  // 左侧：LOGO + 房间号 + 等待文本
  const LeftBlock = (
    <div className="flex flex-col items-center animate-fade-in">
      <img src="/assets/connect.png" alt="" className="w-20 h-20 mb-5 drop-shadow-lg" />
      <h1 className="text-2xl font-bold text-text-primary mb-4">{t('等待对手加入', 'Waiting for opponent')}</h1>
      <div className="bg-card-bg border border-card-border rounded-2xl px-8 py-5 mb-5">
        <p className="text-text-secondary text-xs mb-1 text-center">{t('房间码', 'Room code')}</p>
        <p className="text-4xl font-bold tracking-[0.3em] text-accent-shield text-center">{roomId}</p>
      </div>
      {/* 等待动画 */}
      <div className="flex justify-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full bg-accent-shield animate-bounce" style={{ animationDelay: '0s' }} />
        <span className="w-2.5 h-2.5 rounded-full bg-accent-shield animate-bounce" style={{ animationDelay: '0.2s' }} />
        <span className="w-2.5 h-2.5 rounded-full bg-accent-shield animate-bounce" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  );

  // 右侧：4 个按钮/输入框
  const RightBlock = (
    <div className={`flex flex-col gap-3 ${isLandscape ? 'w-72' : 'w-full max-w-xs mx-auto'}`}>
      {/* 复制房号 + 分享链接（同一行） */}
      <div className="flex gap-2">
        <button
          onClick={handleCopyRoom}
          className={`${btnBase} flex-1 bg-card-bg border border-card-border text-text-primary hover:border-accent-shield/30 hover:text-accent-shield`}
        >
          {copied === 'room' ? '✓ ' + t('已复制', 'Copied') : '📋 ' + t('复制房号', 'Copy code')}
        </button>
        <button
          onClick={handleShareLink}
          className={`${btnBase} flex-1 bg-card-bg border border-card-border text-text-primary hover:border-accent-shield/30 hover:text-accent-shield`}
        >
          {copied === 'link' ? '✓ ' + t('已复制', 'Copied') : '🔗 ' + t('分享链接', 'Share link')}
        </button>
      </div>

      {/* 昵称输入 */}
      <div className="relative">
        <input
          type="text"
          placeholder={t('输入昵称', 'Nickname')}
          value={nickName}
          onChange={(e) => handleNameChange(e.target.value)}
          maxLength={12}
          className="w-full bg-card-bg border border-card-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent-shield/50 transition-colors"
        />
        {nameSaving && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">{t('保存中...', 'Saving...')}</span>
        )}
      </div>

      {/* 取消匹配 */}
      <button
        onClick={handleCancel}
        className={`${btnBase} bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20`}
      >
        ✕ {t('取消匹配', 'Cancel Match')}
      </button>

      {/* 提示 */}
      <p className="text-center text-text-secondary text-xs mt-1">
        {t('将房间码或链接发送给好友即可对战', 'Send the code or link to a friend to start a battle')}
      </p>
    </div>
  );

  return (
    <div className="min-h-viewport flex items-center justify-center p-6">
      {isLandscape ? (
        <div className="flex items-center justify-center gap-12 w-full max-w-4xl">
          {LeftBlock}
          {RightBlock}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-6 w-full">
          {LeftBlock}
          {RightBlock}
        </div>
      )}
    </div>
  );
}
