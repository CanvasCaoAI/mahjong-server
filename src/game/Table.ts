import { Player, type Seat } from './Player';
import { Game } from './Game';

export class Table {
  readonly game = new Game();
  readonly players: Array<Player | null> = [null, null, null, null];

  message = '等待四位玩家连接并准备…';

  join(socketId: string): { ok: boolean; seat?: Seat; message?: string } {
    // already seated?
    for (const s of [0, 1, 2, 3] as const) {
      if (this.players[s]?.id === socketId) return { ok: true, seat: s };
    }

    // find first empty
    for (const s of [0, 1, 2, 3] as const) {
      if (!this.players[s]) {
        this.players[s] = new Player(socketId, s, `玩家${s + 1}`);
        const filled = this.players.filter(Boolean).length;
        this.message = `玩家${s + 1} 已加入（${filled}/4），等待其他玩家…`;
        if (filled === 4) this.message = '四人已加入，点击“准备”开始。';
        return { ok: true, seat: s };
      }
    }

    return { ok: false, message: '已满员（仅支持四人）' };
  }

  setName(socketId: string, name: string) {
    const p = this.findPlayer(socketId);
    if (p) p.name = name;
  }

  setReady(socketId: string) {
    const p = this.findPlayer(socketId);
    if (!p) return;
    p.ready = true;

    const allReady = this.players.every(pp => !!pp && pp.ready);
    if (allReady && !this.game.isStarted) {
      this.game.start();
      this.message = '四人已准备：座位0（庄家）先打出一张。';
    } else {
      this.message = `${p.name} 已准备。`;
    }
  }

  reset() {
    this.game.reset();
    for (const p of this.players) if (p) p.ready = false;
    this.message = '已重置，四人重新准备开始。';
  }

  leave(socketId: string) {
    let changed = false;
    for (const s of [0, 1, 2, 3] as const) {
      if (this.players[s]?.id === socketId) {
        this.players[s] = null;
        changed = true;
      }
    }
    if (changed) {
      this.game.reset();
      this.message = '有玩家离开，等待四位玩家重新连接并准备…';
    }
  }

  findSeat(socketId: string): Seat | null {
    const p = this.findPlayer(socketId);
    return p ? p.seat : null;
  }

  private findPlayer(socketId: string): Player | null {
    for (const s of [0, 1, 2, 3] as const) {
      if (this.players[s]?.id === socketId) return this.players[s];
    }
    return null;
  }
}
