import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
import { displayMessage } from '../store/notificationStore';
import { displayTrigger } from '../store/triggerStore';
import type { RematchState } from '../store/gameStore';
import type { GameState } from '@shared/types';

// 全局单例 socket
let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(window.location.origin, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return globalSocket;
}

export interface RoomInfo {
  id: string;
  playerCount: number;
  activePlayerCount: number;
  playerNames: string[];
  status: 'waiting' | 'playing' | 'reconnecting' | 'cleaning';
  elapsed: number;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const {
    setConnected,
    setPlayer,
    setGameState,
    setWaitingForOpponent,
    reset,
  } = useGameStore();

  // 连接
  const connect = useCallback(() => {
    const socket = getSocket();
    socket.connect();
    socketRef.current = socket;
  }, []);

  // 断开
  const disconnect = useCallback(() => {
    const socket = getSocket();
    socket.disconnect();
    socketRef.current = null;
    reset();
  }, [reset]);

  // 修改 createRoom 和 joinRoom，保存数据到本地存储
  const createRoom = useCallback(
    (playerName: string): Promise<{ roomId: string; playerId: string; token: string }> => {
      return new Promise((resolve, reject) => {
        const socket = getSocket();
        socket.emit('create_room', playerName, (response: { roomId: string; playerId: string; token: string }) => {
          if (response.roomId) {
            // 新增：保存到本地存储（含会话令牌，用于 rejoin 身份校验）
            localStorage.setItem('gamePlayer', JSON.stringify({ id: response.playerId, name: playerName, roomId: response.roomId, token: response.token }));
            setPlayer({ id: response.playerId, name: playerName, roomId: response.roomId, token: response.token });
            setWaitingForOpponent(true);
            resolve(response);
          } else {
            reject(new Error('创建房间失败'));
          }
        });
      });
    },
    [setPlayer, setWaitingForOpponent]
  );

  // 加入房间
  const joinRoom = useCallback(
    (roomId: string, playerName: string, verifyName?: string): Promise<{ success: boolean; playerId?: string; token?: string; error?: string }> => {
      return new Promise((resolve) => {
        const socket = getSocket();
        socket.emit('join_room', { roomId, playerName, verifyName }, (response: { success: boolean; playerId?: string; token?: string; error?: string }) => {
          if (response.success && response.playerId) {
            // 新增：保存到本地存储（含会话令牌，用于 rejoin 身份校验）
            localStorage.setItem('gamePlayer', JSON.stringify({ id: response.playerId, name: playerName, roomId: roomId, token: response.token }));
            setPlayer({ id: response.playerId, name: playerName, roomId, token: response.token });
            resolve(response);
          } else {
            resolve(response);
          }
        });
      });
    },
    [setPlayer]
  );

  // 出牌
  const playCard = useCallback((cardId: string, targetId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('play_card', { cardId, targetId }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 结束回合
  const endTurn = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('end_turn', {}, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 丢弃手牌
  const discardCard = useCallback((cardId: string, targetId?: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('discard_card', { cardId, targetId }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 卸下装备
  const unequipCard = useCallback((slot: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('unequip_card', { slot }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 修改 leaveRoom，清除本地存储
  const leaveRoom = useCallback(() => {
    const socket = getSocket();
    socket.emit('leave_room');
    localStorage.removeItem('gamePlayer'); // 新增：清理数据
    reset();
  }, [reset]);

  // ===== 新增：获取房间列表 =====
  const getRooms = useCallback((): Promise<RoomInfo[]> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('get_rooms', (rooms: RoomInfo[]) => {
        resolve(rooms || []);
      });
    });
  }, []);

  // ===== 新增：更新昵称（等待匹配时可调用） =====
  const updateName = useCallback((name: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('update_name', { name }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          // 同步更新本地 player 状态
          const player = useGameStore.getState().player;
          if (player) {
            const updated = { ...player, name };
            useGameStore.getState().setPlayer(updated);
            localStorage.setItem('gamePlayer', JSON.stringify(updated));
          }
        }
        resolve(response);
      });
    });
  }, []);

  // 侦测器：猜测权重
  const guessWeight = useCallback((guess: number): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('guess_weight', { guess }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 诡异钓竿：选择装备
  const equipChoice = useCallback((slot: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('equip_choice', { slot }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 诡异钓竿：取消选择，返还卡牌
  const cancelEquipChoice = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('cancel_equip_choice', {}, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 蜘蛛网：选择封锁类型
  const bucketChoice = useCallback((lockType: 'action' | 'strategy'): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('bucket_choice', { lockType }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 运输矿车：选牌
  const draftPick = useCallback((cardIndex: number): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('draft_pick', { cardIndex }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 酿造台：选择转化方向
  const brewChoice = useCallback((cardId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('brew_choice', { cardId }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 烈焰棒：确认丢弃手牌
  const blazeDiscard = useCallback((confirm: boolean): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('blaze_discard', { confirm }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 再战
  const rematchRequest = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('rematch_request', {}, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  const rematchAccept = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('rematch_accept', {}, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  const rematchDecline = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('rematch_decline', {}, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 调试：摸指定卡牌
  const debugDrawCard = useCallback((cardId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('debug_draw_card', { cardId }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 投降
  const surrender = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('surrender', {}, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // ===== 红石粉：选择限时状态（P1：按 buffType + sourcePlayerId 定位，不再传数组下标） =====
  const redstoneChoice = useCallback((buffType: string, sourcePlayerId?: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      socket.emit('redstone_choice', { buffType, sourcePlayerId: sourcePlayerId || '' }, (response: { success: boolean; error?: string }) => {
        resolve(response);
      });
    });
  }, []);

  // 初始化事件监听
  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => {
      console.log('[Socket] 已连接');
      setConnected(true);

      // 注：即使是 socket.io 原生会话恢复（socket.recovered），也仍走 rejoin。
      // rejoin 幂等：服务端恢复分支会重挂业务映射并同步状态；同时 rejoin 兜底覆盖
      // “会话已恢复但房间已不存在”的情况——此时 rejoin 失败会自动回大厅，避免卡死。
      // 新增：自动重连逻辑
      const savedPlayer = localStorage.getItem('gamePlayer');
      if (savedPlayer) {
        try {
          // localStorage 键名为 id（与 store 的 player.id 一致），而非 playerId
          const { id, roomId, name, token } = JSON.parse(savedPlayer);
          console.log('[Socket] 检测到断线记录，尝试重连...', id);
          socket.emit('rejoin', { playerId: id, roomId, token }, (res: any) => {
            if (res.success) {
              console.log('[Socket] 重连成功');
              setPlayer({ id, name, roomId, token });
              // 不在此处设置 gameState — 等待 state_update 事件发送过滤后的状态
            } else {
              console.log('[Socket] 重连失败，房间可能已解散', res.error);
              localStorage.removeItem('gamePlayer'); // 清理无效数据
              // 【兜底】避免卡在过期 gameState 页面：清空状态并回大厅
              reset();
              useGameStore.getState().setPage('lobby');
            }
          });
        } catch (e) {
          console.error('[Socket] 解析本地存档失败', e);
          localStorage.removeItem('gamePlayer');
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('[Socket] 已断开');
      setConnected(false);
    });

    socket.on('player_joined', (data: { playerCount: number; playerId?: string }) => {
      console.log('[Socket] 有玩家加入', data);
      setWaitingForOpponent(false);
      // 【新增】如果人齐了（2人），说明对手在线，清除断线标记
      if (data.playerCount === 2) {
        useGameStore.getState().setOpponentDisconnected(false);
        // 加入/重连者不是自己 → 说明是对手进入房间，提示"对手已连接"
        const me = useGameStore.getState().player;
        if (data.playerId && me && data.playerId !== me.id) {
          displayMessage('对手已连接');
        }
      }
    });

    socket.on('game_started', (state: GameState) => {
      console.log('[Socket] 游戏开始', state);
      setGameState(state);
      setWaitingForOpponent(false);
    });

    socket.on('state_update', (state: GameState) => {
      console.log('[Socket] 状态更新', state);
      setGameState(state);
    });

    socket.on('game_over', (data: { winnerId: string; state: GameState }) => {
      console.log('[Socket] 游戏结束', data);
      setGameState(data.state);
    });

    socket.on('opponent_left', () => {
      console.log('[Socket] 对手已断开连接');
      displayMessage('对手已断开连接');
      // 【新增】设置断线标记
      useGameStore.getState().setOpponentDisconnected(true);
    });

    socket.on('error', (error: string) => {
      console.error('[Socket] 错误', error);
      if (error.includes('房间不存在') || error.includes('未找到房间')) {
        reset();
        window.location.reload();
      }
    });

    socket.on('rematch_invite', (data: { requesterName: string }) => {
      console.log('[Socket] 收到再战邀请', data);
      useGameStore.getState().setRematchState('invited', data.requesterName);
    });

    socket.on('rematch_start', (state: GameState) => {
      console.log('[Socket] 再战开始', state);
      useGameStore.getState().setRematchState(null);
      useGameStore.getState().setGameState(state);
    });

    socket.on('rematch_declined', () => {
      console.log('[Socket] 再战被拒绝');
      useGameStore.getState().setRematchState('declined');
      setTimeout(() => useGameStore.getState().setRematchState(null), 2000);
    });

    socket.on('server_notify', (data: { text: string; target: string; playerId?: string | null }) => {
      console.log('[Notify] 客户端收到 server_notify:', data);
      const me = useGameStore.getState().player;
      // P0-6：按服务端下发的行动玩家 playerId 精确归属，而非 isMyTurn 推断
      if (data.target === 'all') {
        displayMessage(data.text);
      } else if (data.target === 'self' && me && data.playerId === me.id) {
        displayMessage(data.text);
      } else if (data.target === 'opponent' && me && data.playerId !== me.id) {
        displayMessage(data.text);
      }
    });

    socket.on('server_trigger', (data: { text: string; target: string; playerId?: string | null }) => {
      console.log('[Trigger] 客户端收到 server_trigger:', data);
      const me = useGameStore.getState().player;
      if (data.target === 'all') {
        displayTrigger(data.text);
      } else if (data.target === 'self' && me && data.playerId === me.id) {
        displayTrigger(data.text);
      } else if (data.target === 'opponent' && me && data.playerId !== me.id) {
        displayTrigger(data.text);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('player_joined');
      socket.off('game_started');
      socket.off('state_update');
      socket.off('game_over');
      socket.off('opponent_left');
      socket.off('error');
      socket.off('rematch_invite');
      socket.off('rematch_start');
      socket.off('rematch_declined');
      socket.off('server_notify');
      socket.off('server_trigger');
    };
  }, [setConnected, setGameState, setWaitingForOpponent, reset, setPlayer]);

  return {
    connect,
    disconnect,
    createRoom,
    joinRoom,
    playCard,
    endTurn,
    discardCard,
    unequipCard,
    leaveRoom,
    getRooms, // 新增
    updateName, // 新增
    guessWeight,
    draftPick,
    bucketChoice,
    equipChoice,
    cancelEquipChoice,
    brewChoice,
    blazeDiscard,
    debugDrawCard,
    rematchRequest,
    rematchAccept,
    rematchDecline,
    surrender,
    redstoneChoice, // ===== 新增 =====
  };
}
