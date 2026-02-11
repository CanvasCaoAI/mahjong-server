import type { Tile } from '../domain/Tile';
import { MahjongHand } from '../domain/MahjongHand';
import { Wall } from '../domain/Wall';
import { WinChecker } from '../domain/WinChecker';
import type { Seat } from './Player';
import { countTile, allSeats, chiOptions } from './claim';

export type Phase = 'draw' | 'discard' | 'claim' | 'end';

export type GameResult = {
  winners: Seat[];
  handsBySeat: Partial<Record<Seat, Tile[]>>;
  reason: string;
};

export type DiscardEvent = { seat: Seat; tile: Tile };
export type Meld =
  | { type: 'peng'; tiles: [Tile, Tile, Tile]; fromSeat: Seat }
  | { type: 'chi'; tiles: [Tile, Tile, Tile]; fromSeat: Seat };

export class Game {
  private hasPengOpportunity(seat: Seat, tile: Tile) {
    const hand = this.hands[seat].list;
    return countTile(hand, tile) >= 2;
  }

  private resolveClaimIfReady(): boolean {
    if (!this.pendingClaim) return false;

    const p = this.pendingClaim;

    const allHuDecided = [...p.huEligible].every((s) => p.huDecision.has(s));
    if (!allHuDecided) return false;

    // Hu priority（支持一炮多响）
    const huWinners = [...p.huEligible].filter((s) => p.huDecision.get(s) === 'hu');
    if (huWinners.length > 0) {
      const winners = huWinners.sort((a, b) => (a as number) - (b as number));
      const handsBySeat: Partial<Record<Seat, Tile[]>> = {};
      let reason = '胡牌';

      for (const w of winners) {
        const tiles = [...this.tilesForWin(w), p.tile];
        const r = WinChecker.check(tiles);
        if (!r.ok) {
          // 如果出现不一致，视为该玩家过
          p.huDecision.set(w, 'pass');
          continue;
        }
        handsBySeat[w] = tiles;
        reason = r.reason ?? reason;
      }

      const finalWinners = winners.filter((w) => !!handsBySeat[w]);
      if (finalWinners.length > 0) {
        this.phase = 'end';
        this.result = { winners: finalWinners, handsBySeat, reason };
        this.pendingClaim = null;
        return true;
      }
    }

    const allPengDecided = [...p.pengEligible].every((s) => p.pengDecision.has(s));
    if (!allPengDecided) return false;

    const pengChoosers = [...p.pengEligible].filter((s) => p.pengDecision.get(s) === 'peng');
    if (pengChoosers.length > 0) {
      const seat = pengChoosers.sort((a, b) => (a as number) - (b as number))[0]!;
      // execute peng immediately
      const rr = this.execPeng(seat);
      if (rr.ok) {
        this.pendingClaim = null;
        return true;
      }
      // failed => treat as pass
      p.pengDecision.set(seat, 'pass');
    }

    // Chi is only for chiSeat
    if (p.chiEligible) {
      if (!p.chiDecision) return false;
      if (p.chiDecision === 'chi') {
        const rr = this.execChi(p.chiSeat);
        if (rr.ok) {
          this.pendingClaim = null;
          return true;
        }
        p.chiDecision = 'pass';
      }
    }

    // Everyone passed at all available levels => draw phase
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

  private pendingClaim: {
    tile: Tile;
    fromSeat: Seat;
    chiSeat: Seat;

    huEligible: Set<Seat>;
    pengEligible: Set<Seat>;
    chiEligible: boolean;

    huDecision: Map<Seat, 'hu' | 'pass'>;
    pengDecision: Map<Seat, 'peng' | 'pass'>;
    chiDecision: 'chi' | 'pass' | null;
  } | null = null;

  start(opts?: { debug?: boolean; tileCount?: number }) {
    this.wall = opts?.debug ? Wall.debugMan() : Wall.full();
    this.hands = [new MahjongHand(), new MahjongHand(), new MahjongHand(), new MahjongHand()];
    this.melds = [[], [], [], []];
    this.discards = [];
    this.turn = 0; // dealer
    this.phase = 'draw';
    this.started = true;
    this.result = undefined;
    this.pendingClaim = null;

    const tileCount = Math.max(1, Math.min(13, Math.floor(opts?.tileCount ?? 13)));

    // deal N each
    for (let i = 0; i < tileCount; i++) {
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

  // 用于调试：直接开启全万子牌墙
  enableDebugWall() {
    this.wall = Wall.debugMan();
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
    if (!this.pendingClaim) return null;
    const p = this.pendingClaim;
    return {
      tile: p.tile,
      fromSeat: p.fromSeat,
      chiSeat: p.chiSeat,
      huEligible: [...p.huEligible],
      pengEligible: [...p.pengEligible],
      chiEligible: p.chiEligible,
      huDecided: [...p.huDecision.keys()],
      pengDecided: [...p.pengDecision.keys()],
      chiDecided: p.chiDecision !== null,
    };
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

      // Next turn：按需求改为逆时针（+1 mod 4）
      const nextTurn = (((seat as number) + 1) % 4) as Seat;
      this.turn = nextTurn;

      // 进入“可胡/可碰/可吃”窗口：同时计算，同时展示。
      const chiSeat = this.turn;
      const chiPossible = chiOptions(this.hands[chiSeat].list, tile).length > 0;

      const huEligible = new Set<Seat>();
      const pengEligible = new Set<Seat>();

      for (const s of allSeats()) {
        if (s === seat) continue;
        if (WinChecker.check([...this.tilesForWin(s), tile]).ok) huEligible.add(s);
        if (this.hasPengOpportunity(s, tile)) pengEligible.add(s);
      }

      const chiEligible = chiPossible; // only chiSeat can act; availability checked in dto

      if (huEligible.size === 0 && pengEligible.size === 0 && !chiEligible) {
        this.pendingClaim = null;
        this.phase = 'draw';
        return { ok: true, message: `座位${seat} 打出 ${tile}，无人可胡/可碰/可吃，轮到座位${this.turn} 摸牌` };
      }

      this.pendingClaim = {
        tile,
        fromSeat: seat,
        chiSeat,
        huEligible,
        pengEligible,
        chiEligible,
        huDecision: new Map(),
        pengDecision: new Map(),
        chiDecision: null,
      };

      this.phase = 'claim';
      return { ok: true, message: `座位${seat} 打出 ${tile}（等待胡/碰/吃）` };
    } catch {
      return { ok: false, message: '打出的牌不合法' };
    }
  }

  passClaim(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase !== 'claim' || !this.pendingClaim) return { ok: false, message: '当前没有可处理的胡/碰/吃' };
    if (seat === this.pendingClaim.fromSeat) return { ok: true, message: '打牌者无需选择过' };

    const p = this.pendingClaim;
    if (p.huEligible.has(seat) && !p.huDecision.has(seat)) p.huDecision.set(seat, 'pass');
    if (p.pengEligible.has(seat) && !p.pengDecision.has(seat)) p.pengDecision.set(seat, 'pass');
    if (p.chiEligible && seat === p.chiSeat && p.chiDecision === null) p.chiDecision = 'pass';

    const resolved = this.resolveClaimIfReady();
    return { ok: true, message: resolved ? `座位${seat} 过` : `座位${seat} 过（等待其他人决定）` };
  }

  peng(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase !== 'claim' || !this.pendingClaim) return { ok: false, message: '当前不能碰' };
    if (seat === this.pendingClaim.fromSeat) return { ok: false, message: '不能碰自己打出的牌' };

    const p = this.pendingClaim;
    if (seat === p.fromSeat) return { ok: false, message: '不能碰自己打出的牌' };
    if (!p.pengEligible.has(seat)) return { ok: false, message: '当前不能碰' };

    // 如果你本来可胡但选择碰，等价于对“胡”选择过
    if (p.huEligible.has(seat) && !p.huDecision.has(seat)) p.huDecision.set(seat, 'pass');

    p.pengDecision.set(seat, 'peng');

    const resolved = this.resolveClaimIfReady();
    return { ok: true, message: resolved ? `座位${seat} 碰（已结算）` : `座位${seat} 碰（已记录，等待胡/碰更高优先级决定）` };
  }

  chi(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase !== 'claim' || !this.pendingClaim) return { ok: false, message: '当前不能吃' };
    if (seat !== this.pendingClaim.chiSeat) return { ok: false, message: '只有下一家可以吃' };
    if (seat === this.pendingClaim.fromSeat) return { ok: false, message: '不能吃自己打出的牌' };

    const p = this.pendingClaim;
    if (!p.chiEligible) return { ok: false, message: '当前不能吃' };
    if (seat === p.fromSeat) return { ok: false, message: '不能吃自己打出的牌' };

    // choosing chi implies pass on higher priority
    if (p.huEligible.has(seat) && !p.huDecision.has(seat)) p.huDecision.set(seat, 'pass');
    if (p.pengEligible.has(seat) && !p.pengDecision.has(seat)) p.pengDecision.set(seat, 'pass');

    p.chiDecision = 'chi';

    const resolved = this.resolveClaimIfReady();
    return { ok: true, message: resolved ? `座位${seat} 吃（已结算）` : `座位${seat} 吃（已记录，等待胡/碰更高优先级决定）` };
  }

  private execPeng(seat: Seat): { ok: boolean; message: string } {
    const p = this.pendingClaim;
    if (!p) return { ok: false, message: 'no claim' };
    const tile = p.tile;
    const fromSeat = p.fromSeat;

    if (!this.hasPengOpportunity(seat, tile)) return { ok: false, message: '手牌不足两张，不能碰' };

    // remove two from hand
    let removed = 0;
    const hand = this.hands[seat].list.slice();
    for (let i = hand.length - 1; i >= 0 && removed < 2; i--) {
      if (hand[i] === tile) {
        this.hands[seat].removeAt(i);
        removed++;
      }
    }
    if (removed < 2) return { ok: false, message: '碰牌失败（移除手牌异常）' };

    const last = this.discards[this.discards.length - 1];
    if (!last || last.tile !== tile || last.seat !== fromSeat) return { ok: false, message: '碰牌失败（弃牌已变化）' };
    this.discards.pop();

    this.melds[seat].push({ type: 'peng', tiles: [tile, tile, tile], fromSeat });
    this.turn = seat;
    this.phase = 'discard';
    return { ok: true, message: `座位${seat} 碰 ${tile}` };
  }

  private execChi(seat: Seat): { ok: boolean; message: string } {
    const p = this.pendingClaim;
    if (!p) return { ok: false, message: 'no claim' };
    const tile = p.tile;
    const fromSeat = p.fromSeat;

    const opts = chiOptions(this.hands[seat].list, tile);
    if (!opts.length) return { ok: false, message: '当前不能吃' };

    const first = opts[0];
    if (!first) return { ok: false, message: '当前不能吃' };
    const [a, b] = first;

    const removeOne = (t: Tile) => {
      const hand = this.hands[seat].list;
      for (let i = hand.length - 1; i >= 0; i--) {
        if (hand[i] === t) {
          this.hands[seat].removeAt(i);
          return true;
        }
      }
      return false;
    };

    if (!removeOne(a) || !removeOne(b)) return { ok: false, message: '吃牌失败（移除手牌异常）' };

    const last = this.discards[this.discards.length - 1];
    if (!last || last.tile !== tile || last.seat !== fromSeat) return { ok: false, message: '吃牌失败（弃牌已变化）' };
    this.discards.pop();

    this.melds[seat].push({ type: 'chi', tiles: [a, tile, b], fromSeat });
    this.turn = seat;
    this.phase = 'discard';
    return { ok: true, message: `座位${seat} 吃 ${tile}` };
  }

  private tilesForWin(seat: Seat): Tile[] {
    const hand = this.hands[seat].list;
    const meldTiles = this.melds[seat].flatMap(m => m.tiles);
    return [...hand, ...meldTiles];
  }

  hu(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase === 'end') return { ok: false, message: '游戏已结束' };

    // 点炮胡：claim 阶段（只记录决定，等待所有可胡者决定后结算）
    if (this.phase === 'claim' && this.pendingClaim) {
      const p = this.pendingClaim;
      if (seat === p.fromSeat) return { ok: false, message: '不能胡自己打出的牌' };
      if (!p.huEligible.has(seat)) return { ok: false, message: '当前不能胡' };
      if (p.huDecision.has(seat)) return { ok: true, message: '已选择' };

      p.huDecision.set(seat, 'hu');
      const resolved = this.resolveClaimIfReady();
      return { ok: true, message: resolved ? `座位${seat} 胡（已结算）` : `座位${seat} 胡（已记录，等待其他胡家决定）` };
    }

    // 自摸胡：仅轮到你时
    if (seat !== this.turn) return { ok: false, message: '还没轮到你' };
    if (this.phase === 'claim') return { ok: false, message: '请先处理“吃/碰/过”' };

    const tiles = this.tilesForWin(seat);
    const r = WinChecker.check(tiles);
    if (r.ok) {
      this.phase = 'end';
      this.result = { winners: [seat], handsBySeat: { [seat]: tiles }, reason: r.reason ?? '胡牌' };
      return { ok: true, message: `座位${seat} 胡了` };
    }
    return { ok: false, message: r.reason ?? '不能胡' };
  }

  // Back-compat: keep old event name
  checkWin(seat: Seat): { ok: boolean; message: string } {
    return this.hu(seat);
  }
}
