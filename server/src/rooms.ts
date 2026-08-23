import { GameState, GamePhase, CardDef } from '../../shared/types';
import {
  createGame, initGame, startTurn, endTurn, playCard,
  discardFromHand, unequipCard, handleGuessWeight, handleDraftPick,
  handleBucketChoice, handleEquipChoice, cancelEquipChoice, handleBrewConversion,
  handleRedstoneChoice,
  surrender,
} from '../../shared/gameEngine';
import { validatePlayCard, validateEndTurn } from '../../shared/validation';
import { deepClone } from '../../shared/buffEngine';
import { CARDS, generateCardInstanceId } from '../../shared/constants';
import { addCardToHand } from '../../shared/cardEngine';

/**
 * 房间管理
 */

interface RoomPlayer {
  id: string;
  socketId: string;
  name: string;
}

interface Room {
  id: string;
  players: RoomPlayer[];
  gameState: GameState | null;
  createdAt: number;
  rematchRequestedBy?: string; // playerId of who requested a rematch
}

export const rooms = new Map<string, Room>();
export const socketToRoom = new Map<string, { roomId: string; playerId: string }>();

// ===== 通知广播上下文 =====
// 引擎（shared/cardEngine.ts 的 showMessage）通过 globalThis.__card_notify_handler 发送提示，
// 但引擎不知道消息属于哪个房间。由于所有引擎调用都是同步的，
// 在调用引擎前后记录/清除"当前处理房间"，服务端就能把通知定向广播到该房间，
// 避免 io.emit 全局广播导致跨房间串消息。
let activeNotifyRoomId: string | null = null;
// P0-6：同时记录“当前行动玩家”，使 target:'self'/'opponent' 能按 playerId 精确归属，
// 而非依赖客户端 isMyTurn 推断（多房间并发结算时语义才可靠）
let activeNotifyPlayerId: string | null = null;

export function getActiveNotifyRoomId(): string | null {
  return activeNotifyRoomId;
}

export function getActiveNotifyPlayerId(): string | null {
  return activeNotifyPlayerId;
}

/** 在同步引擎调用期间设置/清除通知房间+行动玩家上下文（支持嵌套） */
export function withNotifyRoom<T>(roomId: string, playerId: string | null, fn: () => T): T {
  const prevRoom = activeNotifyRoomId;
  const prevPlayer = activeNotifyPlayerId;
  activeNotifyRoomId = roomId;
  activeNotifyPlayerId = playerId;
  try {
    return fn();
  } finally {
    activeNotifyRoomId = prevRoom;
    activeNotifyPlayerId = prevPlayer;
  }
}

// ===== 房间操作 =====
export function createRoom(socketId: string, playerName: string): { roomId: string; playerId: string } | null {
  const roomId = generateRoomCode();
  const playerId = generatePlayerId();

  const room: Room = {
    id: roomId,
    players: [{ id: playerId, socketId, name: playerName }],
    gameState: null,
    createdAt: Date.now(),
  };

  rooms.set(roomId, room);
  socketToRoom.set(socketId, { roomId, playerId });
  console.log(`[房间] 创建房间 ${roomId} (${playerName})`);
  return { roomId, playerId };
}

export function joinRoom(socketId: string, roomId: string, playerName: string, verifyName?: string): { success: boolean; playerId?: string; isReconnection?: boolean; error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: '房间不存在' };

  // 检查活跃玩家数（socketId 非空才算活跃）
  const activePlayers = room.players.filter(p => p.socketId !== '');
  if (activePlayers.length >= 2) return { success: false, error: '房间已满' };

  // 如果有断线玩家且游戏进行中，复用其位置（保留 playerId 以维持游戏状态）
  const disconnectedSlot = room.players.find(p => p.socketId === '');
  if (disconnectedSlot) {
    // 重连校验：输入对方昵称以验证身份
    // reconnecting 状态下校验在线玩家的昵称
    // cleaning 状态下两个玩家都断线，校验任意其他玩家的昵称
    if (verifyName !== undefined) {
      const otherPlayer = room.players.find(p => p.id !== disconnectedSlot.id && p.name === verifyName);
      if (!otherPlayer) {
        return { success: false, error: '昵称不匹配，无法验证身份' };
      }
    }
    disconnectedSlot.socketId = socketId;
    socketToRoom.set(socketId, { roomId, playerId: disconnectedSlot.id });
    console.log(`[房间] 玩家重连房间 ${roomId}，复用 playerId ${disconnectedSlot.id}`);
    return { success: true, playerId: disconnectedSlot.id, isReconnection: true };
  }

  // 正常加入（新房间或等待中的房间）
  const playerId = generatePlayerId();
  room.players.push({ id: playerId, socketId, name: playerName });
  socketToRoom.set(socketId, { roomId, playerId });

  // 两名玩家到齐，开始游戏
  if (room.players.length === 2) {
    const gameState = createGame(
      roomId,
      room.players[0].id, room.players[0].name,
      room.players[1].id, room.players[1].name
    );
    room.gameState = withNotifyRoom(roomId, playerId, () => initGame(gameState));
  }

  return { success: true, playerId };
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getRoomBySocketId(socketId: string): { roomId: string; playerId: string } | undefined {
  return socketToRoom.get(socketId);
}

export function removePlayer(socketId: string): { roomId: string; playerId: string } | undefined {
  const roomInfo = socketToRoom.get(socketId);
  if (!roomInfo) return undefined;

  const room = rooms.get(roomInfo.roomId);
  if (room) {
    // 从房间中移除该玩家
    room.players = room.players.filter(p => p.socketId !== socketId);
    // 房间空了就删除
    if (room.players.length === 0) {
      rooms.delete(roomInfo.roomId);
      console.log(`[房间] 删除空房间 ${roomInfo.roomId}`);
    }
  }

  socketToRoom.delete(socketId);
  return roomInfo;
}

/**
 * 获取所有房间列表（不含 socketId，安全返回给前端）
 *
 * 状态映射：
 * - waiting    等待加入：无游戏 + 玩家数 < 2（可加入）
 * - playing    正在对战：游戏进行中 + 所有玩家在线
 * - reconnecting 等待重连：游戏进行中 + 有人断线（可重连）
 * - cleaning   即将清除：游戏进行中 + 全员断线（60秒清理倒计时中，可重连）
 */
export function getAllRooms(): any[] {
  return Array.from(rooms.values()).map(room => {
    const activeCount = room.players.filter(p => p.socketId !== '').length;
    const totalCount = room.players.length;
    const hasGame = room.gameState !== null;
    const isGameOver = room.gameState?.phase === 'gameOver';

    let status: string;
    if (!hasGame && totalCount < 2) {
      status = 'waiting'; // 等待加入
    } else if (hasGame && !isGameOver && activeCount === 0) {
      status = 'cleaning'; // 即将清除
    } else if (hasGame && !isGameOver && activeCount < totalCount) {
      status = 'reconnecting'; // 等待重连
    } else {
      status = 'playing'; // 正在对战
    }

    return {
      id: room.id,
      playerCount: totalCount,
      activePlayerCount: activeCount,
      playerNames: room.players.map(p => p.name),
      status,
      elapsed: Math.floor((Date.now() - room.createdAt) / 1000),
    };
  });
}

function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generatePlayerId(): string {
  // 确定性 ID（randomUUID），避免 Date.now + Math.random 的碰撞/非确定问题
  const randomPart =
    ((globalThis as any).crypto?.randomUUID?.() as string | undefined)?.replace(/-/g, '').slice(0, 8) ??
    Math.random().toString(36).substring(2, 10);
  return `player_${randomPart}`;
}

// ===== 处理出牌 =====
export function handlePlayCard(
  socketId: string,
  cardId: string,
  targetId: string
): { success: boolean; gameState?: GameState; error?: string; messages?: string[] } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };

  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };

  const validation = validatePlayCard(room.gameState!, roomInfo.playerId, { cardId, targetId });
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const result = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => playCard(room.gameState!, { cardId, targetId }, roomInfo.playerId));

  if (result.success) {
    room.gameState = result.gameState;
  }

  return {
    success: result.success,
    gameState: result.gameState,
    messages: result.messages,
  };
}

// ===== 处理结束回合 =====
export function handleEndTurn(socketId: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };

  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };

  const validation = validateEndTurn(room.gameState!, roomInfo.playerId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => endTurn(room.gameState!));
  if (room.gameState.phase !== GamePhase.GameOver) {
    room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => startTurn(room.gameState!));
  }

  return { success: true, gameState: room.gameState };
}

// ===== 丢弃手牌 =====
export function handleDiscardCard(socketId: string, cardId: string, targetId?: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };

  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };

  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => discardFromHand(room.gameState!, roomInfo.playerId, cardId, targetId));
  return { success: true, gameState: room.gameState };
}

// ===== 卸下装备 =====
export function handleUnequipCard(socketId: string, slot: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };

  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };

  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => unequipCard(room.gameState!, roomInfo.playerId, slot));
  return { success: true, gameState: room.gameState };
}

// ===== 离开房间 =====
export function handleLeaveRoom(socketId: string): { roomId?: string; gameState?: GameState } {
  const roomInfo = removePlayer(socketId);
  if (!roomInfo) return {};

  const room = rooms.get(roomInfo.roomId);
  return { roomId: roomInfo.roomId, gameState: room?.gameState ?? undefined };
}

// ===== 侦测器 =====
export function handleGuessWeightAction(socketId: string, guess: number): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };
  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => handleGuessWeight(room.gameState!, roomInfo.playerId, guess));
  return { success: true, gameState: room.gameState };
}

// ===== 运输矿车 =====
export function handleDraftPickAction(socketId: string, cardIndex: number): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };
  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => handleDraftPick(room.gameState!, roomInfo.playerId, cardIndex));
  return { success: true, gameState: room.gameState };
}

// ===== 蜘蛛网 =====
export function handleBucketChoiceAction(socketId: string, lockType: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };
  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => handleBucketChoice(room.gameState!, roomInfo.playerId, lockType));
  return { success: true, gameState: room.gameState };
}

// ===== 红石粉 =====
// P1：改用 buffType + sourcePlayerId 定位目标 buff（不再依赖客户端数组下标）
export function handleRedstoneChoiceAction(socketId: string, buffType: string, sourcePlayerId?: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };
  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => handleRedstoneChoice(room.gameState!, roomInfo.playerId, buffType as any, sourcePlayerId));
  return { success: true, gameState: room.gameState };
}

// ===== 诡异钓竿 =====
export function handleEquipChoiceAction(socketId: string, slot: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };
  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => handleEquipChoice(room.gameState!, roomInfo.playerId, slot));
  return { success: true, gameState: room.gameState };
}

// ===== 诡异钓竿：取消选择 =====
export function handleCancelEquipChoiceAction(socketId: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };
  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => cancelEquipChoice(room.gameState!, roomInfo.playerId));
  return { success: true, gameState: room.gameState };
}

// ===== 酿造台 =====
export function handleBrewConversionAction(socketId: string, cardId: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };
  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => handleBrewConversion(room.gameState!, roomInfo.playerId, cardId));
  return { success: true, gameState: room.gameState };
}

// ===== 调试：摸指定卡牌 =====
export function handleDebugDrawCard(socketId: string, cardIdInput: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };

  const templateId = cardIdInput.startsWith('card_') ? cardIdInput : `card_${cardIdInput}`;
  const template = CARDS.find(c => c.id === templateId);
  if (!template) return { success: false, error: `未找到卡牌: ${cardIdInput}` };

  const newCard: CardDef = {
    ...template,
    // 确定性实例 ID（randomUUID），避免 Date.now 碰撞/非确定
    id: generateCardInstanceId(templateId, 'debug'),
  };

  const state = deepClone(room.gameState!);
  const idx = state.players.findIndex(p => p.id === roomInfo.playerId);
  if (idx === -1) return { success: false, error: '玩家不存在' };
  withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => addCardToHand(state.players[idx], newCard));
  room.gameState = state;
  return { success: true, gameState: state };
}

// ===== 管理员删除房间 =====
export function adminDeleteRoom(roomId: string): boolean {
  if (!rooms.has(roomId)) return false;
  rooms.delete(roomId);
  console.log(`[管理员] 删除房间 ${roomId}`);
  return true;
}

// ===== 投降 =====
export function handleSurrender(socketId: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };
  const room = rooms.get(roomInfo.roomId);
  if (!room || !room.gameState) return { success: false, error: '房间或游戏状态不存在' };
  room.gameState = withNotifyRoom(roomInfo.roomId, roomInfo.playerId, () => surrender(room.gameState!, roomInfo.playerId));
  return { success: true, gameState: room.gameState };
}

// ===== 再战 =====
export function handleRematchRequest(socketId: string): { success: boolean; requesterName?: string; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };

  const room = rooms.get(roomInfo.roomId);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.gameState?.phase !== GamePhase.GameOver) {
    return { success: false, error: '游戏未结束' };
  }

  room.rematchRequestedBy = roomInfo.playerId;
  const requester = room.players.find(p => p.id === roomInfo.playerId);
  return { success: true, requesterName: requester?.name };
}

export function handleRematchAccept(socketId: string): { success: boolean; gameState?: GameState; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };

  const room = rooms.get(roomInfo.roomId);
  if (!room) return { success: false, error: '房间不存在' };
  if (!room.rematchRequestedBy) return { success: false, error: '没有再战请求' };

  // 重置再战状态
  room.rematchRequestedBy = undefined;

  // 创建新游戏
  const gameState = createGame(
    room.id,
    room.players[0].id, room.players[0].name,
    room.players[1].id, room.players[1].name,
  );
  room.gameState = withNotifyRoom(room.id, roomInfo.playerId, () => initGame(gameState));
  return { success: true, gameState: room.gameState };
}

export function handleRematchDecline(socketId: string): { success: boolean; error?: string } {
  const roomInfo = getRoomBySocketId(socketId);
  if (!roomInfo) return { success: false, error: '未找到房间' };

  const room = rooms.get(roomInfo.roomId);
  if (!room) return { success: false, error: '房间不存在' };

  room.rematchRequestedBy = undefined;
  return { success: true };
}

// ===== 清理过期房间 =====
const ROOM_TTL = 5 * 60 * 1000;
export function startRoomCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      // 原逻辑：人数 < 2 且 游戏未开始 且 超时 -> 删除
      // 这会导致只有房主一个人在等待时，超时后房间被删
      if (room.players.length < 2 && room.gameState === null && (now - room.createdAt) > ROOM_TTL) {
        console.log(`[清理] 过期房间 ${roomId}`);
        rooms.delete(roomId);
      }
    }
  }, 30000);
}
// 根据 playerId 查找所在的房间和玩家对象
export function getRoomByPlayerId(playerId: string): { room: Room; player: RoomPlayer } | undefined {
    for (const room of rooms.values()) {
        const player = room.players.find(p => p.id === playerId);
        if (player) return { room, player };
    }
    return undefined;
}

// 更新玩家的 socketId，并重新绑定 socketToRoom 映射
export function updatePlayerSocket(playerId: string, newSocketId: string): boolean {
    const data = getRoomByPlayerId(playerId);
    if (!data) return false;

    const { room, player } = data;

    // 更新房间内的 socketId
    player.socketId = newSocketId;

    // 更新映射表
    socketToRoom.set(newSocketId, { roomId: room.id, playerId });

    return true;
}

// 更新玩家昵称（等待匹配时可调用）
export function updatePlayerName(socketId: string, name: string): { success: boolean; error?: string } {
    const roomInfo = getRoomBySocketId(socketId);
    if (!roomInfo) return { success: false, error: '未找到房间' };

    const room = rooms.get(roomInfo.roomId);
    if (!room) return { success: false, error: '房间不存在' };

    const player = room.players.find(p => p.id === roomInfo.playerId);
    if (!player) return { success: false, error: '玩家不存在' };

    player.name = name;

    // 同步更新 gameState 中的玩家名（如果游戏已开始）
    if (room.gameState!) {
        const gsPlayer = room.gameState.players.find(p => p.id === roomInfo.playerId);
        if (gsPlayer) gsPlayer.name = name;
    }

    return { success: true };
}
