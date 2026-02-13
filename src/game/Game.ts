import type { Tile } from '../domain/Tile';
import { MahjongHand } from '../domain/MahjongHand';
import { Wall } from '../domain/Wall';
import { WinChecker } from '../domain/WinChecker';
import { extraFlowerCountForHu, isQingYiSeTiles } from '../rules/winExtras';
import type { Seat } from './Player';
import { countTile, allSeats, chiOptions } from './claim';
import { canChiByRestriction, canPengGangByRestriction, restrictionStateFromMelds, tileSuit } from '../rules/shanghaiRestrictions';
import { decidePendingClaim, type PendingClaim } from './claimResolver';

export type Phase = 'draw' | 'discard' | 'claim' | 'end';

export type GameResult = {
  winners: Seat[];
  handsBySeat: Partial<Record<Seat, Tile[]>>;
  reason: string;
};

export type DiscardEvent = { seat: Seat; tile: Tile };
export type Meld =
  | { type: 'peng'; tiles: [Tile, Tile, Tile]; fromSeat: Seat }
  | { type: 'chi'; tiles: [Tile, Tile, Tile]; fromSeat: Seat }
  | { type: 'gang'; tiles: [Tile, Tile, Tile, Tile]; fromSeat: Seat | null; kind: 'discard' | 'concealed' | 'add' }
  | { type: 'flower'; tiles: [Tile]; fromSeat: null; kind: 'flower' };

export class Game {
  private lastWinMeta: { winType: 'self' | 'discard' | 'unknown'; fromSeat: Seat | null; winTile: Tile | null } | null = null;

  getLastWinMeta() {
    return this.lastWinMeta;
  }

  private hasPengOpportunity(seat: Seat, tile: Tile) {
    const hand = this.hands[seat].list;
    return countTile(hand, tile) >= 2;
  }

  private hasGangOpportunityOnDiscard(seat: Seat, tile: Tile) {
    const hand = this.hands[seat].list;
    return countTile(hand, tile) >= 3;
  }

  private restriction(seat: Seat) {
    return restrictionStateFromMelds(this.melds[seat]);
  }

  private resolveClaimIfReady(): boolean {
    if (!this.pendingClaim) return false;

    const p = this.pendingClaim;
    const decision = decidePendingClaim(p);

    if (decision.kind === 'wait') return false;

    if (decision.kind === 'hu') {
      // 胡（支持一炮多响）：这里仍然由 Game 负责做最终校验 + 写入 result
      const winners = decision.winners;
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
        // 规则：没有花不能胡（清一色除外）
        const extraFlower = extraFlowerCountForHu(this.melds[w], tiles);
        const qingYiSe = isQingYiSeTiles(tiles);
        if (extraFlower <= 0 && !qingYiSe) {
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
        this.lastWinMeta = { winType: 'discard', fromSeat: p.fromSeat, winTile: p.tile };
        this.pendingClaim = null;
        return true;
      }

      // 如果胡家都被校验刷掉了，则继续等待（理论上不常发生）
      return false;
    }

    if (decision.kind === 'gang') {
      const rr = this.execGangFromDiscard(decision.seat);
      if (rr.ok) {
        this.pendingClaim = null;
        return true;
      }
      // 失败则视为该玩家“过”，然后继续等待下一轮决策
      p.gangDecision.set(decision.seat, 'pass');
      return false;
    }

    if (decision.kind === 'peng') {
      const rr = this.execPeng(decision.seat);
      if (rr.ok) {
        this.pendingClaim = null;
        return true;
      }
      p.pengDecision.set(decision.seat, 'pass');
      return false;
    }

    if (decision.kind === 'chi') {
      const rr = this.execChi(decision.seat);
      if (rr.ok) {
        this.pendingClaim = null;
        return true;
      }
      p.chiDecision = 'pass';
      return false;
    }

    // all pass
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

  private pendingClaim: PendingClaim | null = null;

  start(opts?: { debug?: boolean; tileCount?: number; sameTile?: Tile }) {
    this.wall = opts?.sameTile ? Wall.debugSame(opts.sameTile) : (opts?.debug ? Wall.debugMan() : Wall.full());
    this.hands = [new MahjongHand(), new MahjongHand(), new MahjongHand(), new MahjongHand()];
    this.melds = [[], [], [], []];
    this.discards = [];
    this.turn = 0; // dealer
    this.phase = 'draw';
    this.started = true;
    this.result = undefined;
    this.pendingClaim = null;
    this.lastWinMeta = null;

    const tileCount = Math.max(1, Math.min(13, Math.floor(opts?.tileCount ?? 13)));

    // deal N each
    for (let i = 0; i < tileCount; i++) {
      for (const s of [0, 1, 2, 3] as const) {
        this.hands[s].add(this.wall.draw()!);
      }
    }

    // 起手补花：所有玩家把手里的花牌立刻补掉（直到手里没有花）
    for (const s of [0, 1, 2, 3] as const) {
      const rr = this.extractFlowersAnd补摸(s);
      // 起手补花如果导致牌堆空，则直接结束
      if (!rr.ok) {
        this.phase = 'end';
        break;
      }
    }

    // dealer draws one to begin and must discard (handle flower replacement)
    const t = this.wall.draw();
    if (t) {
      if (this.isFlower(t)) {
        this.melds[0].push({ type: 'flower', tiles: [t], fromSeat: null, kind: 'flower' });
        this.extractFlowersAnd补摸(0);
      } else {
        this.hands[0].add(t);
      }
    }
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
    this.lastWinMeta = null;
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
      gangEligible: [...p.gangEligible],
      pengEligible: [...p.pengEligible],
      chiEligible: p.chiEligible,
      huDecided: [...p.huDecision.keys()],
      gangDecided: [...p.gangDecision.keys()],
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

    // 轮到你时：先把手里已有的花都补掉（起手摸到花的情况）
    const rr0 = this.extractFlowersAnd补摸(seat);
    if (!rr0.ok) return rr0;

    // 正常摸牌：如果摸到花，则自动补摸直到摸到非花
    while (true) {
      const t = this.wall.draw();
      if (!t) {
        this.phase = 'end';
        return { ok: false, message: '牌堆已空，流局' };
      }

      if (this.isFlower(t)) {
        this.melds[seat].push({ type: 'flower', tiles: [t], fromSeat: null, kind: 'flower' });
        const rr = this.extractFlowersAnd补摸(seat);
        if (!rr.ok) return rr;
        continue;
      }

      this.hands[seat].add(t);
      break;
    }

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
      const gangEligible = new Set<Seat>();
      const pengEligible = new Set<Seat>();

      for (const s of allSeats()) {
        if (s === seat) continue;

        // Hu is not restricted by the suit rule (win checking stays the same)
        const candidate = [...this.tilesForWin(s), tile];
        const ok = WinChecker.check(candidate).ok;
        if (ok) {
          // 规则：没有花不能胡（清一色除外）。
          // 这里的“花”包含：花牌、杠的花、字牌刻/碰的花（不含底花）。
          const extraFlower = extraFlowerCountForHu(this.melds[s], candidate);
          const qingYiSe = isQingYiSeTiles(candidate);
          if (extraFlower > 0 || qingYiSe) huEligible.add(s);
        }

        // Suit restriction for peng/gang (honors z exempt)
        const rs = this.restriction(s);
        if (this.hasGangOpportunityOnDiscard(s, tile) && canPengGangByRestriction(rs, tile).ok) gangEligible.add(s);
        if (this.hasPengOpportunity(s, tile) && canPengGangByRestriction(rs, tile).ok) pengEligible.add(s);
      }

      // Suit restriction for chi (only chiSeat can act)
      const chiEligible = (() => {
        if (!chiPossible) return false;
        const rs = this.restriction(chiSeat);
        return canChiByRestriction(rs, tile).ok;
      })();

      if (huEligible.size === 0 && gangEligible.size === 0 && pengEligible.size === 0 && !chiEligible) {
        this.pendingClaim = null;
        this.phase = 'draw';
        return { ok: true, message: `座位${seat} 打出 ${tile}，无人可胡/可杠/可碰/可吃，轮到座位${this.turn} 摸牌` };
      }

      this.pendingClaim = {
        tile,
        fromSeat: seat,
        chiSeat,
        huEligible,
        gangEligible,
        pengEligible,
        chiEligible,
        huDecision: new Map(),
        gangDecision: new Map(),
        pengDecision: new Map(),
        chiDecision: null,
      };

      this.phase = 'claim';
      return { ok: true, message: `座位${seat} 打出 ${tile}（等待胡/杠/碰/吃）` };
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
    if (p.gangEligible.has(seat) && !p.gangDecision.has(seat)) p.gangDecision.set(seat, 'pass');
    if (p.pengEligible.has(seat) && !p.pengDecision.has(seat)) p.pengDecision.set(seat, 'pass');
    if (p.chiEligible && seat === p.chiSeat && p.chiDecision === null) p.chiDecision = 'pass';

    const resolved = this.resolveClaimIfReady();
    return { ok: true, message: resolved ? `座位${seat} 过` : `座位${seat} 过（等待其他人决定）` };
  }

  gang(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase === 'end') return { ok: false, message: '游戏已结束' };

    // 明杠：claim 阶段（只记录决定，等待所有可胡者决定后结算）
    if (this.phase === 'claim' && this.pendingClaim) {
      const p = this.pendingClaim;
      if (seat === p.fromSeat) return { ok: false, message: '不能杠自己打出的牌' };
      if (!p.gangEligible.has(seat)) return { ok: false, message: '当前不能杠' };
      if (p.gangDecision.has(seat)) return { ok: true, message: '已选择' };

      // Shanghai suit restriction (honors z exempt)
      const rr = canPengGangByRestriction(this.restriction(seat), p.tile);
      if (!rr.ok) return { ok: false, message: rr.reason ?? '当前不能杠' };

      // 如果你本来可胡但选择杠，等价于对“胡”选择过
      if (p.huEligible.has(seat) && !p.huDecision.has(seat)) p.huDecision.set(seat, 'pass');

      p.gangDecision.set(seat, 'gang');
      const resolved = this.resolveClaimIfReady();
      return { ok: true, message: resolved ? `座位${seat} 杠（已结算）` : `座位${seat} 杠（已记录，等待其他人决定）` };
    }

    // 暗杠/加杠：仅轮到你且在 discard 阶段
    if (seat !== this.turn) return { ok: false, message: '还没轮到你' };
    if (this.phase !== 'discard') return { ok: false, message: '当前不能杠' };

    // 优先尝试加杠（更直观）
    const add = this.findAddGangTile(seat);
    if (add) {
      const rr = this.execAddGang(seat, add);
      return rr;
    }

    const concealed = this.findConcealedGangTile(seat);
    if (concealed) {
      const rr = this.execConcealedGang(seat, concealed);
      return rr;
    }

    return { ok: false, message: '当前没有可杠的牌' };
  }

  peng(seat: Seat): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase !== 'claim' || !this.pendingClaim) return { ok: false, message: '当前不能碰' };
    if (seat === this.pendingClaim.fromSeat) return { ok: false, message: '不能碰自己打出的牌' };

    const p = this.pendingClaim;
    if (seat === p.fromSeat) return { ok: false, message: '不能碰自己打出的牌' };
    if (!p.pengEligible.has(seat)) return { ok: false, message: '当前不能碰' };

    // Shanghai suit restriction (honors z exempt)
    const rr = canPengGangByRestriction(this.restriction(seat), p.tile);
    if (!rr.ok) return { ok: false, message: rr.reason ?? '当前不能碰' };

    // 如果你本来可胡但选择碰，等价于对“胡”选择过
    if (p.huEligible.has(seat) && !p.huDecision.has(seat)) p.huDecision.set(seat, 'pass');
    // 杠优先于碰：选择碰 => 对“杠”选择过（避免卡住）
    if (p.gangEligible.has(seat) && !p.gangDecision.has(seat)) p.gangDecision.set(seat, 'pass');

    p.pengDecision.set(seat, 'peng');

    const resolved = this.resolveClaimIfReady();
    return { ok: true, message: resolved ? `座位${seat} 碰（已结算）` : `座位${seat} 碰（已记录，等待胡/碰更高优先级决定）` };
  }

  chi(seat: Seat, opts?: { a?: Tile; b?: Tile }): { ok: boolean; message: string } {
    if (!this.started) return { ok: false, message: '游戏尚未开始' };
    if (this.phase !== 'claim' || !this.pendingClaim) return { ok: false, message: '当前不能吃' };
    if (seat !== this.pendingClaim.chiSeat) return { ok: false, message: '只有下一家可以吃' };
    if (seat === this.pendingClaim.fromSeat) return { ok: false, message: '不能吃自己打出的牌' };

    const p = this.pendingClaim;
    if (!p.chiEligible) return { ok: false, message: '当前不能吃' };

    // Shanghai suit restriction (honors z exempt)
    const rr = canChiByRestriction(this.restriction(seat), p.tile);
    if (!rr.ok) return { ok: false, message: rr.reason ?? '当前不能吃' };
    if (seat === p.fromSeat) return { ok: false, message: '不能吃自己打出的牌' };

    // choosing chi implies pass on higher priority
    if (p.huEligible.has(seat) && !p.huDecision.has(seat)) p.huDecision.set(seat, 'pass');
    if (p.gangEligible.has(seat) && !p.gangDecision.has(seat)) p.gangDecision.set(seat, 'pass');
    if (p.pengEligible.has(seat) && !p.pengDecision.has(seat)) p.pengDecision.set(seat, 'pass');

    // record chosen option (if provided)
    if (opts?.a && opts?.b) {
      (p as any).chiOption = [opts.a, opts.b] as [Tile, Tile];
    }
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

    // If client specified a chi option, use it; otherwise fallback to the first option.
    const picked = (p as any).chiOption as undefined | [Tile, Tile];
    const chosen = picked && opts.some(([x, y]) => x === picked[0] && y === picked[1])
      ? picked
      : opts[0]!;

    const [a, b] = chosen;

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

  private isFlower(t: Tile): boolean {
    return t[0] === 'f';
  }

  /**
   * 将手牌中的花牌（f1..f8）全部移入 meld，并为每张花补摸一张。
   * - 只要补摸到的还是花，就继续补摸，直到补到非花。
   * - 该过程不改变 turn；phase 由调用方控制。
   */
  private extractFlowersAnd补摸(seat: Seat): { ok: boolean; message: string } {
    let moved = 0;

    while (true) {
      const hand = this.hands[seat].list;
      const idx = hand.findIndex((x) => this.isFlower(x));
      if (idx < 0) break;

      const flower = this.hands[seat].removeAt(idx);
      this.melds[seat].push({ type: 'flower', tiles: [flower], fromSeat: null, kind: 'flower' });
      moved++;

      // replacement draw (may chain)
      while (true) {
        const t = this.wall.draw();
        if (!t) {
          this.phase = 'end';
          return { ok: false, message: '牌堆已空，流局' };
        }
        if (this.isFlower(t)) {
          this.melds[seat].push({ type: 'flower', tiles: [t], fromSeat: null, kind: 'flower' });
          moved++;
          continue;
        }
        this.hands[seat].add(t);
        break;
      }
    }

    return { ok: true, message: moved ? `座位${seat} 补花 x${moved}` : '' };
  }

  private drawAfterGang(seat: Seat): { ok: boolean; message: string } {
    // gang 补摸：也要处理花牌
    const t0 = this.wall.draw();
    if (!t0) {
      this.phase = 'end';
      return { ok: false, message: '牌堆已空，流局' };
    }

    if (this.isFlower(t0)) {
      this.melds[seat].push({ type: 'flower', tiles: [t0], fromSeat: null, kind: 'flower' });
      const rr = this.extractFlowersAnd补摸(seat);
      if (!rr.ok) return rr;
    } else {
      this.hands[seat].add(t0);
    }

    this.phase = 'discard';
    this.turn = seat;
    return { ok: true, message: `座位${seat} 补摸` };
  }

  private execGangFromDiscard(seat: Seat): { ok: boolean; message: string } {
    const p = this.pendingClaim;
    if (!p) return { ok: false, message: 'no claim' };
    const tile = p.tile;
    const fromSeat = p.fromSeat;

    if (!this.hasGangOpportunityOnDiscard(seat, tile)) return { ok: false, message: '手牌不足三张，不能杠' };

    // remove three from hand
    let removed = 0;
    const hand = this.hands[seat].list.slice();
    for (let i = hand.length - 1; i >= 0 && removed < 3; i--) {
      if (hand[i] === tile) {
        this.hands[seat].removeAt(i);
        removed++;
      }
    }
    if (removed < 3) return { ok: false, message: '杠牌失败（移除手牌异常）' };

    const last = this.discards[this.discards.length - 1];
    if (!last || last.tile !== tile || last.seat !== fromSeat) return { ok: false, message: '杠牌失败（弃牌已变化）' };
    this.discards.pop();

    this.melds[seat].push({ type: 'gang', tiles: [tile, tile, tile, tile], fromSeat, kind: 'discard' });

    // 杠后补摸一张，继续出牌
    const rr = this.drawAfterGang(seat);
    return rr.ok ? { ok: true, message: `座位${seat} 明杠 ${tile}，${rr.message}` } : rr;
  }

  private findConcealedGangTile(seat: Seat): Tile | null {
    const rs = this.restriction(seat);
    const hand = this.hands[seat].list;
    const cnt = new Map<Tile, number>();
    for (const t of hand) cnt.set(t, (cnt.get(t) ?? 0) + 1);
    for (const [t, c] of cnt.entries()) {
      if (c < 4) continue;
      // restriction: if chi-locked, only allow that suit (honors exempt)
      if (!canPengGangByRestriction(rs, t).ok) continue;
      return t;
    }
    return null;
  }

  private findAddGangTile(seat: Seat): Tile | null {
    const rs = this.restriction(seat);
    const melds = this.melds[seat];
    const hand = this.hands[seat].list;
    for (const m of melds) {
      if (m.type !== 'peng') continue;
      const t = m.tiles[0];
      if (countTile(hand, t) < 1) continue;
      if (!canPengGangByRestriction(rs, t).ok) continue;
      return t;
    }
    return null;
  }

  private execConcealedGang(seat: Seat, tile: Tile): { ok: boolean; message: string } {
    const hand = this.hands[seat].list.slice();
    let removed = 0;
    for (let i = hand.length - 1; i >= 0 && removed < 4; i--) {
      if (hand[i] === tile) {
        this.hands[seat].removeAt(i);
        removed++;
      }
    }
    if (removed < 4) return { ok: false, message: '暗杠失败（手牌不足）' };

    this.melds[seat].push({ type: 'gang', tiles: [tile, tile, tile, tile], fromSeat: null, kind: 'concealed' });
    const rr = this.drawAfterGang(seat);
    return rr.ok ? { ok: true, message: `座位${seat} 暗杠 ${tile}，${rr.message}` } : rr;
  }

  private execAddGang(seat: Seat, tile: Tile): { ok: boolean; message: string } {
    // must have a peng meld
    const melds = this.melds[seat];
    const idx = melds.findIndex((m) => m.type === 'peng' && m.tiles[0] === tile);
    if (idx < 0) return { ok: false, message: '加杠失败（没有碰）' };

    // remove one tile from hand
    const hand = this.hands[seat].list;
    let removed = false;
    for (let i = hand.length - 1; i >= 0; i--) {
      if (hand[i] === tile) {
        this.hands[seat].removeAt(i);
        removed = true;
        break;
      }
    }
    if (!removed) return { ok: false, message: '加杠失败（手牌没有第4张）' };

    const fromSeat = (melds[idx] as any).fromSeat as Seat;
    melds[idx] = { type: 'gang', tiles: [tile, tile, tile, tile], fromSeat, kind: 'add' };

    const rr = this.drawAfterGang(seat);
    return rr.ok ? { ok: true, message: `座位${seat} 加杠 ${tile}，${rr.message}` } : rr;
  }

  private tilesForWin(seat: Seat): Tile[] {
    const hand = this.hands[seat].list;
    const meldTiles = this.melds[seat].flatMap(m => {
      if (m.type === 'gang') return m.tiles.slice(0, 3);
      if (m.type === 'flower') return [];
      return m.tiles;
    });
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
      // 规则：没有花不能胡（清一色除外）
      const extraFlower = extraFlowerCountForHu(this.melds[seat], tiles);
      const qingYiSe = isQingYiSeTiles(tiles);
      if (extraFlower <= 0 && !qingYiSe) return { ok: false, message: '没有花不能胡（清一色除外）' };
      this.phase = 'end';
      this.result = { winners: [seat], handsBySeat: { [seat]: tiles }, reason: r.reason ?? '胡牌' };
      // Best-effort: treat the last tile in hand list as the winning tile (usually the drawn tile).
      const winTile = (this.hands[seat].list.length > 0) ? (this.hands[seat].list[this.hands[seat].list.length - 1] ?? null) : null;
      this.lastWinMeta = { winType: 'self', fromSeat: null, winTile: winTile as any };
      return { ok: true, message: `座位${seat} 胡了` };
    }
    return { ok: false, message: r.reason ?? '不能胡' };
  }

  // Back-compat: keep old event name
  checkWin(seat: Seat): { ok: boolean; message: string } {
    return this.hu(seat);
  }
}
