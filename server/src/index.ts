import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createRoom,
  joinRoom,
  getRoom,
  getRoomBySocketId,
  getPlayerBySocketId,
  handlePlayCard,
  handleEndTurn,
  handleDiscardCard,
  handleUnequipCard,
  handleLeaveRoom,
  removePlayer,
  startRoomCleanup,
  getAllRooms,
  adminDeleteRoom,
  handleGuessWeightAction,
  handleDraftPickAction,
  handleBucketChoiceAction,
  handleRedstoneChoiceAction,
  handleEquipChoiceAction,
  handleCancelEquipChoiceAction,
  handleBrewConversionAction,
  handleDebugDrawCard,
  handleRematchRequest,
  handleRematchAccept,
  handleRematchDecline,
  handleSurrender,
  socketToRoom,
  rooms,
  getRoomByPlayerId,
  updatePlayerSocket,
  updatePlayerName,
  getActiveNotifyRoomId,
  getActiveNotifyPlayerId,
} from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());

// 生产环境：托管前端静态文件
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// 托管资源文件
const assetsDir = path.resolve(__dirname, '../../assets');
app.use('/assets', express.static(assetsDir));

// ===== 管理 API =====
app.get('/api/rooms', (_req, res) => {
  res.json(getAllRooms());
});

app.delete('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const deleted = adminDeleteRoom(roomId);
  if (deleted) {
    res.json({ success: true, message: `房间 ${roomId} 已删除` });
  } else {
    res.status(404).json({ success: false, error: '房间不存在' });
  }
});

// ===== 后台管理页面 =====
app.get('/admin', (_req, res) => {
  const adminPath = path.resolve(__dirname, 'admin.html');
  res.sendFile(adminPath);
});

// ===== 托管前端（SPA 降级） =====
app.get('*', (_req, res) => {
  res.sendFile(path.resolve(clientDist, 'index.html'));
});

// ===== Socket.IO =====
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // ===== 断线重连方案A：开启 socket.io 原生连接状态恢复 =====
  // 允许在临时断线后恢复 socket.id / rooms / data，并自动重放断线期间丢失的包。
  // 恢复连接可通过 socket.recovered 判断；但业务层的 socketToRoom / player.socketId 映射
  // 在 disconnect 处理器里已被清空，仍需在 connection 时用 socket.data 恢复。
  // 注意：内置内存适配器支持该特性（单实例），仅覆盖过渡性网络中断，不覆盖页面刷新。
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 分钟重连窗口（默认值）
    skipMiddlewares: true,
  },
});

const PORT = 3001;

/** 房间内各玩家的在线状态（playerId -> 是否在线）。
 *  随每次 state_update 一起下发，让客户端按"服务端权威状态"判断对手是否在线，
 *  而不再依赖 opponent_left / player_joined 两个事件的到达顺序：
 *  重连很快时，旧连接迟到的 opponent_left 可能晚于 player_joined 到达，
 *  会把已经清掉的"对手断线"遮罩重新点亮。 */
function getOnlineMap(room: { players: { id: string; socketId: string }[] }): Record<string, boolean> {
  return Object.fromEntries(room.players.map(p => [p.id, p.socketId !== '']));
}

/** 向房间内所有在线玩家广播过滤后的状态 + 在线状态 */
const emitStateUpdates = (
  room: { players: { id: string; socketId: string }[] },
  state: any,
  onlySocketId?: string,
) => {
  const online = getOnlineMap(room);
  for (const p of room.players) {
    if (!p.socketId) continue;
    if (onlySocketId && p.socketId !== onlySocketId) continue;
    io.to(p.socketId).emit('state_update', filterStateForPlayer(state, p.id), online);
  }
};

/** "对手断线"通知的宽限期：刷新页面/网络闪断通常在这段时间内就能重连回来 */
const DISCONNECT_NOTIFY_GRACE_MS = 1500;
const pendingOpponentLeftNotify = new Map<string, NodeJS.Timeout>();

/** 延迟通知对手"某人断线"；玩家在宽限期内重连则取消 */
function scheduleOpponentLeftNotify(roomId: string, playerId: string): void {
  cancelOpponentLeftNotify(playerId);
  const timer = setTimeout(() => {
    pendingOpponentLeftNotify.delete(playerId);
    const room = rooms.get(roomId);
    const player = room?.players.find(p => p.id === playerId);
    // 宽限期内已经重连（或房间/玩家已不存在）就不再打扰对手
    if (!room || !player || player.socketId !== '') return;
    io.to(roomId).emit('opponent_left', { playerId });
    console.log(`[断线] 通知房间 ${roomId}：玩家 ${playerId} 断线`);
  }, DISCONNECT_NOTIFY_GRACE_MS);
  pendingOpponentLeftNotify.set(playerId, timer);
}

/** 玩家重新连上：取消尚未发出的"断线"通知 */
function cancelOpponentLeftNotify(playerId: string): void {
  const timer = pendingOpponentLeftNotify.get(playerId);
  if (timer) {
    clearTimeout(timer);
    pendingOpponentLeftNotify.delete(playerId);
  }
}

// 服务端通知 → 广播给对应房间的客户端（在 cardEngine.ts 中调用 showMessage 时触发）
// category: 'hint'=提示 → server_notify / 'trigger'=触发效果 → server_trigger
// 通过 rooms.ts 的"当前处理房间"上下文定向广播，避免跨房间串消息
// P0-6：payload 携带"当前行动玩家 playerId"，客户端按 playerId 映射 self/opponent，
// 不再依赖 isMyTurn 推断（多房间并发结算时归属才可靠）
(globalThis as any).__card_notify_handler = (msg: string, target: string, category: string = 'hint') => {
  const event = category === 'trigger' ? 'server_trigger' : 'server_notify';
  const roomId = getActiveNotifyRoomId();
  const playerId = getActiveNotifyPlayerId();
  //console.log('[Notify] 服务端发送', event + ':', msg, 'target:', target, 'room:', roomId ?? 'N/A', 'player:', playerId ?? 'N/A');
  if (roomId) {
    // 定向广播：只发给当前处理房间内的玩家（已通过 socket.join 加入该 socket.io room）
    io.to(roomId).emit(event, { text: msg, target, playerId });
  } else {
    // 兜底：无房间上下文时保持全局广播，避免漏消息（正常流程不会走到这里）
    io.emit(event, { text: msg, target, playerId });
  }
};
//console.log('[Notify] handler 已注册');

io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}${(socket as any).recovered ? ' (已恢复会话)' : ''}`);

  // ===== 恢复断线会话（socket.io 原生 connectionStateRecovery） =====
  // 传输层已恢复 socket.id / rooms / data 并重放丢失包，这里只需恢复业务映射：
  // disconnect 处理器已把 player.socketId 置空并删除 socketToRoom[socket.id]。
  if ((socket as any).recovered) {
    const data = (socket as any).data || {};
    const { roomId, playerId } = data;
    if (roomId && playerId) {
      const ok = updatePlayerSocket(playerId, socket.id);
      if (ok) {
        socket.join(roomId);
        cancelOpponentLeftNotify(playerId); // 会话恢复成功，撤销"断线"通知
        const room = getRoom(roomId);
        // 用更新后的玩家状态判断游戏是否进行中，避免把 gameOver 后仍在房间里的状态当成对局
        const playing = !!room?.gameState && room.gameState.phase !== 'gameOver';
        // 同步最新过滤状态给房间内所有在线玩家（升级断线期间错过的状态）
        if (playing) {
          emitStateUpdates(room!, room!.gameState!);
        }
        // 通知房间：该玩家回到线上，清除对端"等待重连"遮罩
        const count = room?.players.length ?? 2;
        io.to(roomId).emit('player_joined', { playerCount: count, playerId });
        console.log(`[恢复] 玩家 ${playerId} 会话恢复成功 (房间 ${roomId})`);
      } else {
        console.log(`[恢复] 玩家 ${playerId} 会话恢复失败：房间已不存在`);
      }
    }
  }

  // ===== 创建房间 =====
  socket.on('create_room', (playerName: string, callback) => {
    console.log(`[创建房间] ${socket.id} 玩家名: ${playerName}`); 
    const createResult = createRoom(socket.id, playerName || `玩家${socket.id.slice(0, 4)}`);
    if (!createResult) {
      callback({ success: false, error: '创建房间失败' });
      return;
    }
    const { roomId, playerId, token } = createResult;
    socket.join(roomId);
    // 供 connectionStateRecovery 恢复会话时定位玩家
    (socket as any).data = { roomId, playerId };
    callback({ roomId, playerId, token });
    console.log(`[创建成功] 房间: ${roomId}, 玩家: ${playerId}`);
  });

  // ===== 加入房间 =====
  socket.on('join_room', ({ roomId, playerName, verifyName }: { roomId: string; playerName?: string; verifyName?: string }, callback) => {
    console.log(`[加入房间] ${socket.id} -> ${roomId}`);

    const room = getRoom(roomId);
    if (!room) {
      callback({ success: false, error: '房间不存在' });
      return;
    }

    const result = joinRoom(
      socket.id,
      roomId,
      playerName || `玩家${socket.id.slice(0, 4)}`,
      verifyName
    );

    if (result.success) {
      socket.join(roomId);
      // 供 connectionStateRecovery 恢复会话时定位玩家
      (socket as any).data = { roomId, playerId: result.playerId! };

      // 通知房间内已有玩家
      io.to(roomId).emit('player_joined', {
        playerCount: room.players.length,
        playerId: result.playerId!,
      });

      // 有 gameState 时，根据是否重连发送不同事件
      if (room.gameState) {
        if (result.isReconnection) {
          // 重连：只发 state_update（过滤后），不发 game_started（避免泄露对方手牌）
          emitStateUpdates(room, room.gameState);
        } else {
          // 新游戏开始（同样按玩家过滤，避免把对方手牌下发给客户端）
          const online = getOnlineMap(room);
          for (const p of room.players) {
            if (p.socketId) {
              io.to(p.socketId).emit('game_started', filterStateForPlayer(room.gameState, p.id), online);
            }
          }

          // 通知双方游戏开始
          emitStateUpdates(room, room.gameState);
        }
      }

      callback({ success: true, playerId: result.playerId, token: result.token });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 出牌 =====
  socket.on('play_card', ({ cardId, targetId }: { cardId: string; targetId: string }, callback) => {
    console.log(`[出牌] ${socket.id} card:${cardId} target:${targetId}`);

    const result = handlePlayCard(socket.id, cardId, targetId);

    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true, messages: result.messages });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 结束回合 =====
  socket.on('end_turn', (_data, callback) => {
    console.log(`[结束回合] ${socket.id}`);

    const result = handleEndTurn(socket.id);

    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result!.gameState!);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 丢弃手牌 =====
  socket.on('discard_card', ({ cardId, targetId }: { cardId: string; targetId?: string }, callback) => {
    console.log(`[丢弃] ${socket.id} card:${cardId} target:${targetId ?? 'default'}`);

    const result = handleDiscardCard(socket.id, cardId, targetId);

    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 卸下装备 =====
  socket.on('unequip_card', ({ slot }: { slot: string }, callback) => {
    const result = handleUnequipCard(socket.id, slot);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 离开房间 =====
  socket.on('leave_room', () => {
    const result = handleLeaveRoom(socket.id);
    if (result.roomId) {
      socket.leave(result.roomId);
    }
    // 清除会话定位数据，避免恢复时映射到已离开的玩家
    (socket as any).data = {};
  });

  // ===== 获取房间列表 =====
  socket.on('get_rooms', (callback) => {
    callback(getAllRooms());
  });

  // ===== 更新昵称 =====
  socket.on('update_name', ({ name }: { name: string }, callback) => {
    const result = updatePlayerName(socket.id, name);
    callback(result);
  });

  // ===== 侦测器：猜测权重 =====
  socket.on('guess_weight', ({ guess }: { guess: number }, callback) => {
    const result = handleGuessWeightAction(socket.id, guess);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 运输矿车：选牌 =====
  socket.on('draft_pick', ({ cardIndex }: { cardIndex: number }, callback) => {
    const result = handleDraftPickAction(socket.id, cardIndex);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 蜘蛛网：选择封锁类型 =====
  socket.on('bucket_choice', ({ lockType }: { lockType: string }, callback) => {
    const result = handleBucketChoiceAction(socket.id, lockType);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 红石粉：选择限时状态 =====
  socket.on('redstone_choice', ({ buffType, sourcePlayerId }: { buffType: string; sourcePlayerId?: string }, callback) => {
    const result = handleRedstoneChoiceAction(socket.id, buffType, sourcePlayerId);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 诡异钓竿：选择装备 =====
  socket.on('equip_choice', ({ slot }: { slot: string }, callback) => {
    const result = handleEquipChoiceAction(socket.id, slot);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 诡异钓竿：取消选择，返还卡牌 =====
  socket.on('cancel_equip_choice', (_data, callback) => {
    const result = handleCancelEquipChoiceAction(socket.id);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 酿造台：选择转化方向 =====
  socket.on('brew_choice', ({ cardId }: { cardId: string }, callback) => {
    const result = handleBrewConversionAction(socket.id, cardId);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 调试：摸指定卡牌 =====
  socket.on('debug_draw_card', ({ cardId }: { cardId: string }, callback) => {
    const result = handleDebugDrawCard(socket.id, cardId);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 投降 =====
  socket.on('surrender', (_data, callback) => {
    console.log(`[投降] ${socket.id}`);
    const result = handleSurrender(socket.id);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          emitStateUpdates(room, result.gameState);
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  // ===== 再战 =====
  socket.on('rematch_request', (_data, callback) => {
    console.log(`[再战] ${socket.id} 请求再战`);
    const result = handleRematchRequest(socket.id);
    if (result.success) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          for (const p of room.players) {
            if (p.socketId !== socket.id) {
              io.to(p.socketId).emit('rematch_invite', { requesterName: result.requesterName });
            }
          }
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  socket.on('rematch_accept', (_data, callback) => {
    console.log(`[再战] ${socket.id} 接受再战`);
    const result = handleRematchAccept(socket.id);
    if (result.success && result.gameState) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          // 按玩家过滤 + 附带在线状态（与 state_update 保持一致）
          const online = getOnlineMap(room);
          for (const p of room.players) {
            if (p.socketId) {
              io.to(p.socketId).emit('rematch_start', filterStateForPlayer(result.gameState, p.id), online);
            }
          }
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  socket.on('rematch_decline', (_data, callback) => {
    console.log(`[再战] ${socket.id} 拒绝再战`);
    const result = handleRematchDecline(socket.id);
    if (result.success) {
      const roomInfo = getRoomBySocketId(socket.id);
      if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
          for (const p of room.players) {
            if (p.socketId !== socket.id) {
              io.to(p.socketId).emit('rematch_declined');
            }
          }
        }
      }
      callback({ success: true });
    } else {
      callback({ success: false, error: result.error });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[断线] ${socket.id}`);

    // 【关键】只有"当前有效连接"的断开才算掉线。
    // 玩家换新连接重连（rejoin / connectionStateRecovery / 刷新页面）后，
    // 旧连接的 disconnect 可能迟到；此时 room 里该玩家已经绑定到新 socketId，
    // 若还按旧映射去清空 socketId，就会把**在线的玩家**标记成离线，
    // 并向对手广播 opponent_left —— 表现为"双方同时显示对方断线等待重连"。
    // 对这类过期连接，只需清掉自己的映射，不能动房间里的在线状态。
    const current = getPlayerBySocketId(socket.id);
    if (!current) {
        if (socketToRoom.has(socket.id)) {
            console.log(`[断线] ${socket.id} 是已被新连接顶替的旧连接，忽略（不影响在线状态）`);
            socketToRoom.delete(socket.id);
        }
        return;
    }

    const { room, player } = current;
    // 玩家重新连上就取消"通知对手断线"的宽限计时器
    cancelOpponentLeftNotify(player.id);
    player.socketId = ""; // 标记为离线

    // 清除映射关系
    socketToRoom.delete(socket.id);

    // 检查房间是否彻底没人了（如果所有人 socketId 都为空，才删除房间）
    const activePlayers = room.players.filter(p => p.socketId !== "");
    if (activePlayers.length === 0) {
        // 游戏进行中时给 60 秒重连窗口，否则立即删除
        if (room.gameState && room.gameState.phase !== 'gameOver') {
            console.log(`[清理] 房间 ${room.id} 所有人断线，60秒后清理`);
            setTimeout(() => {
                const r = rooms.get(room.id);
                if (r && r.players.every(p => p.socketId === '')) {
                    rooms.delete(room.id);
                    console.log(`[清理] 房间 ${room.id} 无人重连，已清理`);
                }
            }, 60000);
        } else {
            rooms.delete(room.id);
            console.log(`[清理] 房间 ${room.id} 已清空`);
        }
    } else {
        // 通知对手该玩家断线。
        // 延迟 GRACE 毫秒再发：刷新页面/网络抖动导致的短暂重连不会惊动对手，
        // 玩家在宽限期内回来（rejoin / 会话恢复）就会取消这条通知。
        // 单靠状态里带在线标记还不够——晚到的 opponent_left 可能晚于重连后的
        // state_update 到达，把已经清掉的"对手断线"遮罩重新点亮。
        scheduleOpponentLeftNotify(room.id, player.id);
    }
  });
  // ===== 新增：重连处理 =====
  socket.on('rejoin', ({ playerId, roomId, token }: { playerId: string, roomId: string, token?: string }, callback) => {
    console.log(`[重连] 尝试重连玩家 ${playerId} 到房间${roomId}`);
    
    // 1. 身份校验：需要匹配有效的会话令牌，防止仅凭 playerId+roomId 顶号
    const data = getRoomByPlayerId(playerId);
    
    if (data && data.room.id === roomId && data.player.token && token && data.player.token === token) {
        const { room } = data;
        
        // 2. 更新该玩家的 socketId
        const success = updatePlayerSocket(playerId, socket.id);
        
        if (success) {
            // 3. 重新加入 Socket.IO 房间
            socket.join(roomId);
            // 自己已经回来了，撤销尚未通知出去的"断线"
            cancelOpponentLeftNotify(playerId);
            // 供 connectionStateRecovery 恢复会话时定位玩家
            (socket as any).data = { roomId, playerId };
            
            // 4. 回传成功（不含原始 gameState，避免泄露对方手牌）
            callback({ success: true });
            
            // 5. 发送过滤后的游戏状态 + 在线状态。
            // 先直接回给本次重连的 socket，保证"重连者一定能拿到最新状态"：
            // 历史版本曾把在线玩家的 socketId 清空，此时房间广播会漏掉重连者自己，
            // 导致重连后画面停留在旧状态。
            if (room.gameState) {
                const online = getOnlineMap(room);
                socket.emit('state_update', filterStateForPlayer(room.gameState, playerId), online);
                emitStateUpdates(room, room.gameState);
            }
            
            // 6. 通知房间内所有人：玩家重连成功
            io.to(roomId).emit('player_joined', { playerCount: room.players.length, playerId });
            console.log(`[重连] 玩家 ${playerId} 重连成功`);
        } else {
            callback({ success: false, error: '重连更新失败' });
        }
    } else {
        callback({ success: false, error: '身份验证失败或房间不存在' });
    }
  });
});

function filterStateForPlayer(state: any, playerId: string): any {
  const filtered = JSON.parse(JSON.stringify(state));

  const draftOwner = filtered.players.find((p: any) => p.draftCards?.length > 0);
  const draftInfo = draftOwner ? { draftCards: draftOwner.draftCards, draftPlayerPick: draftOwner.draftPlayerPick, draftPickedBy: draftOwner.draftPickedBy } : null;

  for (const p of filtered.players) {
    if (p.id !== playerId) {
      p.hand = p.hand.map(() => ({ hidden: true }));
      p.deck = [];
      p.draftPickCount = undefined;
    } else {
      if (draftInfo) {
        p.draftCards = draftInfo.draftCards;
        p.draftPlayerPick = draftInfo.draftPlayerPick;
        p.draftPickedBy = draftInfo.draftPickedBy;
      }
    }
  }

  // 清理临时标记
  for (const p of filtered.players) {
    delete (p as any)._blazePowderTrigger;
  }

  return filtered;
}

server.listen(PORT, () => {
  console.log(`[CardPVP] 服务器启动: http://localhost:${PORT}`);
  startRoomCleanup();
});
