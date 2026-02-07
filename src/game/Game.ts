import type { Tile } from '../domain/Tile';
import { MahjongHand } from '../domain/MahjongHand';
import { Wall } from '../domain/Wall';
import { WinChecker } from '../domain/WinChecker';
import type { Seat } from './Player';

export type Phase = 'draw' | 'discard' | 'end';

export type GameResult = {
  winnerSeat: Seat;
  hand: Tile[];
  reason: string;
};

export type DiscardEvent = { seat: Seat; tile: Tile };

export class Game {
  private wall: Wall = Wall.full();
  private hands: [MahjongHand, MahjongHand, MahjongHand, MahjongHand] = [new MahjongHand(), new MahjongHand(), new MahjongHand(), new MahjongHand()];
  private discards: DiscardEvent[] = [];
  private turn: Seat = 0;
  private phase: Phase = 'draw';
  private started = false;
  private result: GameResult | undefined;

  start() {
    this.wall = Wall.full();
    this.hands = [new MahjongHand(), new MahjongHand(), new MahjongHand(), new MahjongHand()];
    this.discards = [];
    this.turn = 0; // dealer
    this.phase = 'draw';
    this.started = true;
    this.result = undefined;

    // deal 13 each
    for (let i = 0; i < 13; i++) {
      for (const s of [0, 1, 2, 3] as const) {
        this.hands[s].add(this.wall.draw()!);
      }
    }

    // dealer draws one to begin and must discard
    const t = this.wall.draw();
    if (t) this.hands[0].add(t);
    this.phase = 'discard';
  }

  reset() {
    this.started = false;
    this.result = undefined;
    this.discards = [];
    this.hands = [new MahjongHand(), new MahjongHand(), new MahjongHand(), new MahjongHand()];
    this.wall = Wall.full();
    this.turn = 0;
    this.phase = 'draw';
  }

  get isStarted() { return this.started; }
  get wallCount() { return this.wall.count; }
  get currentTurn() { return this.turn; }
  get currentPhase() { return this.phase; }
  get discardsList() { return this.discards.slice(); }
  getResult() { return this.result; }

  getHand(seat: Seat): Tile[] {
    return this.hands[seat].list;
  }

  getHandCount(seat: Seat): number {
    return this.hands[seat].size;
  }

  draw(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase === 'end') return { ok: false, message: '游戏已结束' };
    if (seat !== this.turn) return { ok: false, message: '还没轮到你' };
    if (this.phase !== 'draw') return { ok: false, message: '请先打出一张' };

    const t = this.wall.draw();
    if (!t) {
      this.phase = 'end';
      return { ok: false, message: '牌堆已空，流局' };
    }

    this.hands[seat].add(t);
    this.phase = 'discard';
    return { ok: true, message: `座位${seat} 摸牌` };
  }

  discard(seat: Seat, index: number): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase === 'end') return { ok: false, message: '游戏已结束' };
    if (seat !== this.turn) return { ok: false, message: '还没轮到你' };
    if (this.phase !== 'discard') return { ok: false, message: '请先摸牌' };

    try {
      const tile = this.hands[seat].removeAt(index);
      this.discards.push({ seat, tile });
      // Counter-clockwise turn order
      this.turn = (((seat as number) + 3) % 4) as Seat;
      this.phase = 'draw';
      return { ok: true, message: `座位${seat} 打出 ${tile}，轮到座位${this.turn} 摸牌` };
    } catch {
      return { ok: false, message: '打出的牌不合法' };
    }
  }

  checkWin(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase === 'end') return { ok: false, message: '游戏已结束' };
    if (seat !== this.turn) return { ok: false, message: '还没轮到你' };

    const hand = this.hands[seat].list;
    const r = WinChecker.check(hand);
    if (r.ok) {
      this.phase = 'end';
      this.result = { winnerSeat: seat, hand, reason: r.reason ?? '胡牌' };
      return { ok: true, message: `座位${seat} 胡了` };
    }
    return { ok: false, message: r.reason ?? '不能胡' };
  }
}
