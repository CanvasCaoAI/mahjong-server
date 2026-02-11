import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { stateFor } from './net/dto';
import { RoomManager } from './rooms/RoomManager';

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

// 30 days offline retention
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const rooms = new RoomManager(TTL_MS);

// simple cleanup timer
setInterval(() => rooms.cleanup(), 6 * 60 * 60 * 1000).unref();

function errorTo(socketId: string, message: string) {
  io.to(socketId).emit('errorMsg', { message });
}

function broadcastRoom(roomId: string) {
  const table = rooms.get(roomId);
  for (const s of io.sockets.sockets.values()) {
    const auth: any = s.handshake.auth || {};
    if (auth.roomId !== roomId) continue;
    s.emit('state', stateFor(table, s.id, s.connected));
  }
}

io.on('connection', (socket) => {
  const auth: any = socket.handshake.auth || {};
  const roomId = String(auth.roomId || '').trim();
  const clientId = String(auth.clientId || '').trim();

  if (!roomId || !clientId) {
    errorTo(socket.id, '缺少 roomId/clientId');
    socket.disconnect(true);
    return;
  }

  const table = rooms.get(roomId);

  const debug = !!auth.debug;

  const tileCountRaw = (auth.tile ?? auth.tileCount);
  const tileCount = (typeof tileCountRaw === 'number') ? tileCountRaw : Number(String(tileCountRaw ?? ''));

  const joinRes = table.joinOrReconnect({ clientId, socketId: socket.id, debug, tileCount: Number.isFinite(tileCount) ? tileCount : null });
  if (!joinRes.ok) {
    errorTo(socket.id, joinRes.message ?? '无法加入');
    socket.disconnect(true);
    return;
  }

  broadcastRoom(roomId);

  socket.on('setName', ({ name }: { name?: string }) => {
    const n = (name ?? '').trim();
    if (!n) return;
    table.setName(socket.id, n.slice(0, 24));
    table.message = `${n} 已加入。`;
    broadcastRoom(roomId);
  });

  socket.on('ready', () => {
    table.setReady(socket.id);
    broadcastRoom(roomId);
  });

  socket.on('draw', () => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.draw(seat);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastRoom(roomId);
  });

  socket.on('discard', ({ index }: { index: number }) => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.discard(seat, index);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastRoom(roomId);
  });

  socket.on('hu', () => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.hu(seat);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastRoom(roomId);
  });

  // Back-compat
  socket.on('checkWin', () => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.hu(seat);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastRoom(roomId);
  });

  socket.on('peng', () => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.peng(seat);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastRoom(roomId);
  });

  socket.on('passClaim', () => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.passClaim(seat);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastRoom(roomId);
  });

  socket.on('chi', () => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.chi(seat);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastRoom(roomId);
  });

  socket.on('disconnect', () => {
    table.markOffline(socket.id);
    broadcastRoom(roomId);
  });
});

const PORT = Number(process.env.PORT || 5174);
server.listen(PORT, () => {
  console.log(`[mahjong-server] listening on http://localhost:${PORT}`);
});
