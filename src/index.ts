import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { Table } from './game/Table';
import { stateFor } from './net/dto';

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

const table = new Table();

function broadcastState() {
  for (const s of io.sockets.sockets.values()) {
    s.emit('state', stateFor(table, s.id, s.connected));
  }
}

function errorTo(socketId: string, message: string) {
  io.to(socketId).emit('errorMsg', { message });
}

io.on('connection', (socket) => {
  // auto-join the single table
  const joinRes = table.join(socket.id);
  if (!joinRes.ok) {
    errorTo(socket.id, joinRes.message ?? '无法加入');
    socket.disconnect(true);
    return;
  }

  broadcastState();

  socket.on('setName', ({ name }: { name?: string }) => {
    const n = (name ?? '').trim();
    if (!n) return;
    table.setName(socket.id, n.slice(0, 24));
    table.message = `${n} 已加入。`;
    broadcastState();
  });

  socket.on('ready', () => {
    table.setReady(socket.id);
    broadcastState();
  });

  socket.on('draw', () => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.draw(seat);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastState();
  });

  socket.on('discard', ({ index }: { index: number }) => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.discard(seat, index);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastState();
  });

  socket.on('checkWin', () => {
    const seat = table.findSeat(socket.id);
    if (seat === null) return;
    const r = table.game.checkWin(seat);
    table.message = r.message;
    if (!r.ok) errorTo(socket.id, r.message);
    broadcastState();
  });

  socket.on('reset', () => {
    table.reset();
    broadcastState();
  });

  socket.on('disconnect', () => {
    table.leave(socket.id);
    broadcastState();
  });
});

const PORT = Number(process.env.PORT || 5174);
server.listen(PORT, () => {
  console.log(`[mahjong-server] listening on http://localhost:${PORT}`);
});
