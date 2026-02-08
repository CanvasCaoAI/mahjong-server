import type { Tile } from '../domain/Tile';
import { MahjongHand } from '../domain/MahjongHand';
import { Wall } from '../domain/Wall';
import { WinChecker } from '../domain/WinChecker';
import type { Seat } from './Player';
import { countTile, allSeats } from './claim';

export type Phase = 'draw' | 'discard' | 'claim' | 'end';

export type GameResult = {
  winnerSeat: Seat;
  hand: Tile[];
  reason: string;
};

export type DiscardEvent = { seat: Seat; tile: Tile };
export type Meld = { type: 'peng'; tiles: [Tile, Tile, Tile]; fromSeat: Seat };

export class Game {
  private hasPengOpportunity(seat: Seat, tile: Tile) {
    const hand = this.hands[seat].list;
    return countTile(hand, tile) >= 2;
  }

  private resolveClaimIfAllPassed(): boolean {
    if (!this.pendingClaim) return false;
    const passed = this.pendingClaim.passed;
    const all = allSeats().every((s) => passed.has(s));
    if (!all) return false;

    // 所有人都“过”：进入下一家摸牌
    this.pendingClaim = null;
    this.phase = 'draw';
    return true;
  }
  private wall: Wall = Wall.full();
  private hands: [MahjongHand, MahjongHand, MahjongHand, MahjongHand] = [new MahjongHand(), new MahjongHand(), new MahjongHand(), new MahjongHand()];
  private melds: [Meld[], Meld[], Meld[], Meld[]] = [[], [], [], []];
  private discards: DiscardEvent[] = [];
  private turn: Seat = 0;
  private phase: Phase = 'draw';
  private started = false;
  private result: GameResult | undefined;

  private pendingClaim: { tile: Tile; fromSeat: Seat; passed: Set<Seat> } | null = null;

  start() {
    this.wall = Wall.full();
    this.hands = [new MahjongHand(), new MahjongHand(), new MahjongHand(), new MahjongHand()];
    this.melds = [[], [], [], []];
    this.discards = [];
    this.turn = 0; // dealer
    this.phase = 'draw';
    this.started = true;
    this.result = undefined;
    this.pendingClaim = null;

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
    this.melds = [[], [], [], []];
    this.wall = Wall.full();
    this.turn = 0;
    this.phase = 'draw';
    this.pendingClaim = null;
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

  getMelds(seat: Seat): Meld[] {
    return this.melds[seat].slice();
  }

  getAllMelds(): [Meld[], Meld[], Meld[], Meld[]] {
    return [
      this.melds[0].slice(),
      this.melds[1].slice(),
      this.melds[2].slice(),
      this.melds[3].slice(),
    ];
  }

  getPendingClaim() {
    return this.pendingClaim ? { tile: this.pendingClaim.tile, fromSeat: this.pendingClaim.fromSeat, passed: new Set(this.pendingClaim.passed) } : null;
  }

  getHandCount(seat: Seat): number {
    return this.hands[seat].size;
  }

  draw(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase === 'end') return { ok: false, message: '游戏已结束' };
    if (this.phase === 'claim') return { ok: false, message: '有人可以碰，请先选择“碰/过”' };
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
    if (this.phase === 'claim') return { ok: false, message: '请先处理“碰/过”' };
    if (seat !== this.turn) return { ok: false, message: '还没轮到你' };
    if (this.phase !== 'discard') return { ok: false, message: '请先摸牌' };

    try {
      const tile = this.hands[seat].removeAt(index);
      this.discards.push({ seat, tile });

      // Next turn (current code uses -1 mod 4)
      const nextTurn = (((seat as number) + 3) % 4) as Seat;
      this.turn = nextTurn;

      // 进入“可碰”窗口：只有手里确实能碰的人需要选择 碰/过；其他人自动视为“过”。
      const passed = new Set<Seat>([seat]);
      for (const s of allSeats()) {
        if (s === seat) continue;
        if (!this.hasPengOpportunity(s, tile)) passed.add(s);
      }

      this.pendingClaim = { tile, fromSeat: seat, passed };
      this.phase = 'claim';
      const resolved = this.resolveClaimIfAllPassed();

      if (resolved) {
        return { ok: true, message: `座位${seat} 打出 ${tile}，无人可碰，轮到座位${this.turn} 摸牌` };
      }

      return { ok: true, message: `座位${seat} 打出 ${tile}（有人可碰）` };
    } catch {
      return { ok: false, message: '打出的牌不合法' };
    }
  }

  passClaim(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase !== 'claim' || !this.pendingClaim) return { ok: false, message: '当前没有可处理的碰' };
    if (seat === this.pendingClaim.fromSeat) return { ok: true, message: '打牌者无需选择过' };

    this.pendingClaim.passed.add(seat);
    const resolved = this.resolveClaimIfAllPassed();
    return { ok: true, message: resolved ? `座位${seat} 过，轮到座位${this.turn} 摸牌` : `座位${seat} 过` };
  }

  peng(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase !== 'claim' || !this.pendingClaim) return { ok: false, message: '当前不能碰' };
    if (seat === this.pendingClaim.fromSeat) return { ok: false, message: '不能碰自己打出的牌' };

    const tile = this.pendingClaim.tile;
    const fromSeat = this.pendingClaim.fromSeat;

    if (!this.hasPengOpportunity(seat, tile)) return { ok: false, message: '手牌不足两张，不能碰' };

    // 从手牌中移除两张相同的牌
    let removed = 0;
    const hand = this.hands[seat].list.slice();
    for (let i = hand.length - 1; i >= 0 && removed < 2; i--) {
      if (hand[i] === tile) {
        this.hands[seat].removeAt(i);
        removed++;
      }
    }
    if (removed < 2) return { ok: false, message: '碰牌失败（移除手牌异常）' };

    // 移除最后一张弃牌（被碰走）
    const last = this.discards[this.discards.length - 1];
    if (!last || last.tile !== tile || last.seat !== fromSeat) {
      return { ok: false, message: '碰牌失败（弃牌已变化）' };
    }
    this.discards.pop();

    this.melds[seat].push({ type: 'peng', tiles: [tile, tile, tile], fromSeat });

    // 碰完后轮到碰牌者出牌
    this.pendingClaim = null;
    this.turn = seat;
    this.phase = 'discard';

    return { ok: true, message: `座位${seat} 碰 ${tile}` };
  }

  checkWin(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase === 'end') return { ok: false, message: '游戏已结束' };
    if (this.phase === 'claim') return { ok: false, message: '请先处理“碰/过”' };
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
