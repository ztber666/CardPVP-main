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

// 服务端通知 → 广播给对应房间的客户端（在 cardEngine.ts 中调用 showMessage 时触发）
// category: 'hint'=提示 → server_notify / 'trigger'=触发效果 → server_trigger
// 通过 rooms.ts 的"当前处理房间"上下文定向广播，避免跨房间串消息
// P0-6：payload 携带"当前行动玩家 playerId"，客户端按 playerId 映射 self/opponent，
// 不再依赖 isMyTurn 推断（多房间并发结算时归属才可靠）
(globalThis as any).__card_notify_handler = (msg: string, target: string, category: string = 'hint') => {
  const event = category === 'trigger' ? 'server_trigger' : 'server_notify';
  const roomId = getActiveNotifyRoomId();
  const playerId = getActiveNotifyPlayerId();
  console.log('[Notify] 服务端发送', event + ':', msg, 'target:', target, 'room:', roomId ?? 'N/A', 'player:', playerId ?? 'N/A');
  if (roomId) {
    // 定向广播：只发给当前处理房间内的玩家（已通过 socket.join 加入该 socket.io room）
    io.to(roomId).emit(event, { text: msg, target, playerId });
  } else {
    // 兜底：无房间上下文时保持全局广播，避免漏消息（正常流程不会走到这里）
    io.emit(event, { text: msg, target, playerId });
  }
};
console.log('[Notify] handler 已注册');

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
        const room = getRoom(roomId);
        // 同步最新过滤状态给房间内所有在线玩家（升级断线期间错过的状态）
        if (room?.gameState) {
          for (const p of room.players) {
            if (p.socketId) {
              io.to(p.socketId).emit('state_update', filterStateForPlayer(room.gameState, p.id));
            }
          }
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
          for (const p of room.players) {
            if (p.socketId) {
              io.to(p.socketId).emit('state_update', filterStateForPlayer(room.gameState, p.id));
            }
          }
        } else {
          // 新游戏开始
          io.to(roomId).emit('game_started', room.gameState);

          // 通知双方游戏开始
          for (const p of room.players) {
            const stateForPlayer = filterStateForPlayer(room.gameState, p.id);
            io.to(p.socketId).emit('state_update', stateForPlayer);
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            const stateForPlayer = filterStateForPlayer(result!.gameState!, player.id);
            io.to(player.socketId).emit('state_update', stateForPlayer);
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const player of room.players) {
            io.to(player.socketId).emit('state_update', filterStateForPlayer(result.gameState, player.id));
          }
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
          for (const p of room.players) {
            io.to(p.socketId).emit('rematch_start', result.gameState);
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
    const roomInfo = getRoomBySocketId(socket.id);
    
    if (roomInfo) {
        const room = getRoom(roomInfo.roomId);
        if (room) {
            // 找到该玩家并清空 socketId，而不是直接从数组删除
            const player = room.players.find(p => p.id === roomInfo.playerId);
            if (player) {
                player.socketId = ""; // 标记为离线
            }
            
            // 清除映射关系
            socketToRoom.delete(socket.id);
            
            // 检查房间是否彻底没人了（如果所有人 socketId 都为空，才删除房间）
            const activePlayers = room.players.filter(p => p.socketId !== "");
            if (activePlayers.length === 0) {
                // 游戏进行中时给 60 秒重连窗口，否则立即删除
                if (room.gameState && room.gameState.phase !== 'gameOver') {
                    console.log(`[清理] 房间 ${roomInfo.roomId} 所有人断线，60秒后清理`);
                    setTimeout(() => {
                        const r = rooms.get(roomInfo.roomId);
                        if (r && r.players.every(p => p.socketId === '')) {
                            rooms.delete(roomInfo.roomId);
                            console.log(`[清理] 房间 ${roomInfo.roomId} 无人重连，已清理`);
                        }
                    }, 60000);
                } else {
                    rooms.delete(roomInfo.roomId);
                    console.log(`[清理] 房间 ${roomInfo.roomId} 已清空`);
                }
            } else {
                // 通知对手该玩家断线
                io.to(roomInfo.roomId).emit('opponent_left');
            }
        }
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
            // 供 connectionStateRecovery 恢复会话时定位玩家
            (socket as any).data = { roomId, playerId };
            
            // 4. 回传成功（不含原始 gameState，避免泄露对方手牌）
            callback({ success: true });
            
            // 5. 发送过滤后的游戏状态给所有在线玩家
            if (room.gameState) {
                for (const p of room.players) {
                    if (p.socketId) {
                        io.to(p.socketId).emit('state_update', filterStateForPlayer(room.gameState, p.id));
                    }
                }
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
