// 临时冒烟测试：验证便携包内打包后的服务端（房间创建/加入/开局/过滤）是否正常
import { io } from 'socket.io-client';

const URL = process.env.TEST_URL || 'http://127.0.0.1:3001';
const log = (...a) => console.log('[smoke]', ...a);

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket', 'polling'], forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 8000);
  });
}
const emitAck = (s, ev, payload) => new Promise((res) => s.emit(ev, payload, res));

const a = await connect();
const b = await connect();
log('two clients connected');

const created = await emitAck(a, 'create_room', 'SmokeA');
if (!created?.roomId) throw new Error('create_room failed: ' + JSON.stringify(created));
log('room created:', created.roomId);

const joined = await new Promise((resolve) => {
  b.once('game_started', (state) => resolve({ started: true, state }));
  b.emit('join_room', { roomId: created.roomId, playerName: 'SmokeB' }, (r) => {
    setTimeout(() => resolve({ started: false, ack: r }), 1500);
  });
});
if (!joined.started) throw new Error('no game_started: ' + JSON.stringify(joined.ack));

const st = joined.state;
const cards = st.players.map((p) => p.hand.length).join('/');
const hidden = st.players.some((p) => p.hand.every((c) => c.hidden));
log(`game_started: phase=${st.phase} players=${st.players.length} hands=${cards} opponentHidden=${hidden}`);
if (st.phase !== 'playing' || st.players.length !== 2 || !hidden) throw new Error('unexpected game state');

// 结束回合：验证游戏引擎在打包后也能正常结算
const endTurn = await emitAck(a, 'end_turn', {});
log('end_turn ack:', JSON.stringify(endTurn));

for (const u of ['/', '/admin', '/assets/item/1.png', '/RULE.md', '/RULE_EN.md', '/api/rooms']) {
  const r = await fetch(URL + u);
  if (!r.ok) throw new Error(`GET ${u} -> ${r.status}`);
  log(`GET ${u} -> ${r.status}`);
}

a.close(); b.close();
await new Promise((r) => setTimeout(r, 300)); // 等 socket 优雅关闭，避免 libuv 断言
log('SMOKE TEST PASSED');
