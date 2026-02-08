import { Player, type Seat } from './Player';
import { Game } from './Game';

export class Table {
  readonly game = new Game();
  readonly players: Array<Player | null> = [null, null, null, null];

  // 如果任意客户端用 ?debug=true 连接，则整个房间进入 debug 发牌模式
  debug = false;

  message = '等待四位玩家连接并准备…';

  lastActiveMs: number = Date.now();

  touch() {
    this.lastActiveMs = Date.now();
  }

  joinOrReconnect(params: { clientId: string; socketId: string; debug?: boolean }): { ok: boolean; seat?: Seat; message?: string } {
    const { clientId, socketId, debug } = params;
    if (debug) this.debug = true;

    // Existing clientId => reconnect
    for (const s of [0, 1, 2, 3] as const) {
      const p = this.players[s];
      if (p?.clientId === clientId) {
        p.socketId = socketId;
        p.online = true;
        p.lastSeenMs = Date.now();
        this.touch();
        return { ok: true, seat: s };
      }
    }

    // First empty seat => join
    for (const s of [0, 1, 2, 3] as const) {
      if (!this.players[s]) {
        this.players[s] = new Player(clientId, socketId, s, `玩家${s + 1}`);
        const filled = this.players.filter(Boolean).length;
        this.message = `玩家${s + 1} 已加入（${filled}/4），等待其他玩家…`;
        if (filled === 4) this.message = '四人已加入，点击“准备”开始。';
        this.touch();
        return { ok: true, seat: s };
      }
    }

    return { ok: false, message: '已满员（仅支持四人）' };
  }

  setName(socketId: string, name: string) {
    const p = this.findPlayerBySocket(socketId);
    if (p) {
      p.name = name;
      p.lastSeenMs = Date.now();
      this.touch();
    }
  }

  setReady(socketId: string) {
    const p = this.findPlayerBySocket(socketId);
    if (!p) return;
    p.ready = true;
    p.lastSeenMs = Date.now();

    const allReady = this.players.every(pp => !!pp && pp.ready);
    if (allReady && !this.game.isStarted) {
      this.game.start({ debug: this.debug });
      this.message = this.debug ? '四人已准备（DEBUG）：东家先打出一张。' : '四人已准备：东家先打出一张。';
    } else {
      this.message = `${p.name} 已准备。`;
    }

    this.touch();
  }

  markOffline(socketId: string) {
    const p = this.findPlayerBySocket(socketId);
    if (!p) return;
    p.online = false;
    p.lastSeenMs = Date.now();
    this.touch();
  }

  findSeat(socketId: string): Seat | null {
    const p = this.findPlayerBySocket(socketId);
    return p ? p.seat : null;
  }

  private findPlayerBySocket(socketId: string): Player | null {
    for (const s of [0, 1, 2, 3] as const) {
      const p = this.players[s];
      if (p?.socketId === socketId) return p;
    }
    return null;
  }
}
