import { Player, type Seat } from './Player';
import { Game } from './Game';
import type { Tile } from '../domain/Tile';
import { computeRoundDelta, computeWinnerScoreAndReason, type RoundRecord } from '../rules/scoring/finalScoring';

export class Table {
  readonly game = new Game();
  readonly players: Array<Player | null> = [null, null, null, null];

  // Scoreboard across rounds (simple)
  scores: [number, number, number, number] = [0, 0, 0, 0];
  round = 0;
  roundHistory: RoundRecord[] = [];
  private _settledRound = 0;

  // 如果任意客户端用 ?debug=true 连接，则整个房间进入 debug 发牌模式
  debug = false;

  // 如果任意客户端用 ?tile=5 连接，则整个房间起手牌数量变为该值
  tileCount: number | null = null;

  // 如果任意客户端用 sameTile 连接，则整个房间牌墙变为该牌
  sameTile: import('../domain/Tile').Tile | null = null;

  message = '等待四位玩家连接并准备…';

  lastActiveMs: number = Date.now();

  touch() {
    this.lastActiveMs = Date.now();
  }

  joinOrReconnect(params: { clientId: string; socketId: string; debug?: boolean; tileCount?: number | null; sameTile?: import('../domain/Tile').Tile | null }): { ok: boolean; seat?: Seat; message?: string } {
    const { clientId, socketId, debug, tileCount, sameTile } = params;
    if (debug) this.debug = true;
    if (typeof tileCount === 'number' && Number.isFinite(tileCount)) {
      const v = Math.floor(tileCount);
      if (v >= 1 && v <= 13) this.tileCount = v;
    }

    if (sameTile) {
      this.sameTile = sameTile;
    }

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

    const canStart = (!this.game.isStarted) || (this.game.isStarted && this.game.currentPhase === 'end');

    if (allReady && canStart) {
      const base = this.tileCount ? { debug: this.debug, tileCount: this.tileCount } : { debug: this.debug };
      // sameTile 优先级最高（用于 debug）
      const opts = this.sameTile ? { ...base, sameTile: this.sameTile } : base;
      this.game.start(opts);

      // new round started
      this.round += 1;
      this._settledRound = 0;

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

  maybeSettleRound() {
    // Settle once per round when game ends.
    if (!this.game.isStarted) return;
    if (this.game.currentPhase !== 'end') return;
    if (this._settledRound === this.round) return;

    const result = this.game.getResult();

    // determine win meta best-effort
    const meta = (this.game as any).getLastWinMeta?.() as undefined | {
      winType: 'self' | 'discard' | 'unknown';
      fromSeat: Seat | null;
      winTile: Tile | null;
    };

    const winType = meta?.winType ?? 'unknown';
    const fromSeat = meta?.fromSeat ?? null;
    const winTile = meta?.winTile ?? null;

    // 流局：game 进入 end 但没有 result
    if (!result) {
      const deltaBySeat: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      const record: RoundRecord = {
        round: this.round,
        winners: [],
        winTile: null,
        winType: 'unknown',
        fromSeat: null,
        reason: '流局',
        deltaBySeat,
      };
      this.roundHistory.push(record);
      this._settledRound = this.round;

      // 重置准备状态：等待所有人点击“准备”进入下一局
      for (const s of [0, 1, 2, 3] as const) {
        const p = this.players[s];
        if (p) p.ready = false;
      }
      this.message = '流局，点击“准备”开始下一局。';
      return;
    }

    // Compute score per winner + display reason (winInfo.reason)
    const scoreByWinner: Partial<Record<Seat, number>> = {};
    const reasonByWinner: Partial<Record<Seat, string>> = {};
    for (const w of result.winners) {
      const tiles = (result.handsBySeat?.[w] ?? []) as any;
      const rr = computeWinnerScoreAndReason({ game: this.game as any, winner: w, winnerTiles: tiles, meta: { winType, fromSeat, winTile } });
      scoreByWinner[w] = rr.score;
      reasonByWinner[w] = rr.reason;
    }

    const deltaBySeat = computeRoundDelta({ winners: result.winners, winType, fromSeat, scoreByWinner });

    // Pick a single reason for UI: the highest-scoring winner's reason (stable).
    const pickedReason = (() => {
      let best: Seat | null = null;
      let bestScore = -Infinity;
      for (const w of result.winners) {
        const sc = scoreByWinner[w] ?? 0;
        if (best === null || sc > bestScore) {
          best = w;
          bestScore = sc;
        }
      }
      return best !== null ? (reasonByWinner[best] ?? result.reason) : result.reason;
    })();

    // Mutate game result reason so frontend winInfo.reason shows our computed category.
    try {
      (result as any).reason = pickedReason;
    } catch { /* ignore */ }

    // apply scores
    for (const s of [0, 1, 2, 3] as const) {
      this.scores[s] += deltaBySeat[s];
    }

    const record: RoundRecord = {
      round: this.round,
      winners: result.winners,
      winTile,
      winType,
      fromSeat,
      reason: result.reason,
      deltaBySeat,
    };

    this.roundHistory.push(record);
    this._settledRound = this.round;

    // 重置准备状态：等待所有人点击“准备”进入下一局
    for (const s of [0, 1, 2, 3] as const) {
      const p = this.players[s];
      if (p) p.ready = false;
    }
    this.message = '本局结束，点击“准备”开始下一局。';
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
