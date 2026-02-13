import type { Tile } from '../domain/Tile';
import type { Seat } from '../game/Player';
import type { Phase, GameResult, DiscardEvent, Meld } from '../game/Game';

type PublicResult = Omit<GameResult, 'reason'>;
import type { Table } from '../game/Table';
import { WinChecker } from '../domain/WinChecker';
import { chiOptions } from '../game/claim';
import { canChiByRestriction, canPengGangByRestriction, restrictionStateFromMelds } from '../rules/shanghaiRestrictions';

export type PublicState = {
  connected: boolean;
  players: Array<{ seat: Seat; name: string; ready: boolean } | null>;
  started: boolean;
  wallCount: number;
  discards: DiscardEvent[];
  turn: Seat;
  phase: Phase;
  yourSeat: Seat | null;
  yourHand: Tile[];
  yourMelds: Meld[];
  meldsBySeat: Meld[][];
  handCounts: number[]; // 0-3
  winAvailable: boolean;
  gangAvailable: boolean;
  pengAvailable: boolean;
  chiAvailable: boolean;
  /** 当你可以吃时，返回所有可选的吃牌组合（从手牌里拿出的两张） */
  chiOptions?: [Tile, Tile][];
  message: string;

  // Scoreboard
  scores: [number, number, number, number];
  round: number;
  roundHistory: Array<{
    round: number;
    winners: Seat[];
    winTile: Tile | null;
    winType: 'self' | 'discard' | 'unknown';
    fromSeat: Seat | null;
    reason: string;
    deltaBySeat: Record<Seat, number>;
  }>;

  // Old result object no longer contains win text (reason)
  result?: PublicResult;
  // Win text/meta extracted as a new object (per requirement)
  winInfo?: { reason: string };
};

export function stateFor(table: Table, viewerSocketId: string, connected: boolean): PublicState {
  const yourSeat = table.findSeat(viewerSocketId);
  const started = table.game.isStarted;
  const players = table.players.map(p => (p ? { seat: p.seat, name: p.name, ready: p.ready } : null));

  const yourHand = yourSeat !== null ? table.game.getHand(yourSeat) : [];
  const yourMelds = yourSeat !== null ? table.game.getMelds(yourSeat) : [];
  const meldsBySeat = table.game.getAllMelds();
  const handCounts = ([0, 1, 2, 3] as const).map((s) => table.game.getHandCount(s));

  const result = table.game.getResult();
  const winInfo = result ? { reason: result.reason } : undefined;
  const publicResult: PublicResult | undefined = result ? { winners: result.winners, handsBySeat: result.handsBySeat } : undefined;

  const pending = table.game.getPendingClaim();

  // 自摸胡：轮到你且不在 claim
  const canSelfHu = !!(started && yourSeat !== null && table.game.currentTurn === yourSeat && table.game.currentPhase !== 'end' && table.game.currentPhase !== 'claim');
  const tilesForWin = [...yourHand, ...yourMelds.flatMap(m => (m.type === 'gang' ? m.tiles.slice(0, 3) : m.tiles))];
  const flowerCount = yourMelds.filter((m) => m.type === 'flower').reduce((a, m) => a + m.tiles.length, 0);
  const selfOk = canSelfHu ? !!WinChecker.check(tilesForWin).ok : false;
  const selfIsQingYiSe = (() => {
    const ts = tilesForWin.filter((t) => t[0] !== 'f');
    if (ts.length === 0) return false;
    if (ts.some((t) => t[0] === 'z')) return false;
    const suits = new Set(ts.map((t) => t[0]).filter((s) => s === 'm' || s === 'p' || s === 's'));
    return suits.size === 1;
  })();
  const selfWinAvailable = canSelfHu ? (selfOk && (flowerCount > 0 || selfIsQingYiSe)) : false;

  // 点炮胡：claim 阶段，且该 seat 在 huEligible 中且尚未决定
  const claimWinAvailable = !!(
    started &&
    yourSeat !== null &&
    pending &&
    table.game.currentPhase === 'claim' &&
    pending.fromSeat !== yourSeat &&
    pending.huEligible.includes(yourSeat) &&
    !pending.huDecided.includes(yourSeat) &&
    (() => {
      const ok = WinChecker.check([...tilesForWin, pending.tile]).ok;
      const ts = [...tilesForWin, pending.tile].filter((t) => t[0] !== 'f');
      const isQingYiSe = ts.length > 0 && !ts.some((t) => t[0] === 'z') && (new Set(ts.map((t) => t[0]).filter((s) => s === 'm' || s === 'p' || s === 's'))).size === 1;
      return ok && (flowerCount > 0 || isQingYiSe);
    })()
  );

  const winAvailable = selfWinAvailable || claimWinAvailable;

  const claimGangAvailable = (() => {
    if (!started || yourSeat === null || !pending) return false;
    if (table.game.currentPhase !== 'claim') return false;
    if (pending.fromSeat === yourSeat) return false;
    if (!pending.gangEligible?.includes(yourSeat)) return false;
    if (pending.gangDecided?.includes(yourSeat)) return false;
    if (yourHand.filter(t => t === pending.tile).length < 3) return false;

    const state = restrictionStateFromMelds(yourMelds);
    return canPengGangByRestriction(state, pending.tile).ok;
  })();

  const pengAvailable = (() => {
    if (!started || yourSeat === null || !pending) return false;
    if (table.game.currentPhase !== 'claim') return false;
    if (pending.fromSeat === yourSeat) return false;
    if (!pending.pengEligible.includes(yourSeat)) return false;
    if (pending.pengDecided.includes(yourSeat)) return false;
    if (yourHand.filter(t => t === pending.tile).length < 2) return false;

    const state = restrictionStateFromMelds(yourMelds);
    return canPengGangByRestriction(state, pending.tile).ok;
  })();

  const chiOpts = (started && yourSeat !== null && pending && table.game.currentPhase === 'claim' && pending.chiEligible && pending.chiSeat === yourSeat)
    ? (chiOptions(yourHand, pending.tile) as [Tile, Tile][]) : [];

  const chiAvailable = (() => {
    if (!started || yourSeat === null || !pending) return false;
    if (table.game.currentPhase !== 'claim') return false;
    if (!pending.chiEligible) return false;
    if (pending.chiSeat !== yourSeat) return false;
    if (pending.chiDecided) return false;
    if (chiOpts.length <= 0) return false;

    const state = restrictionStateFromMelds(yourMelds);
    return canChiByRestriction(state, pending.tile).ok;
  })();

  // 自己回合的暗杠/加杠
  const selfGangAvailable = (() => {
    if (!started || yourSeat === null) return false;
    if (table.game.currentPhase !== 'discard') return false;
    if (table.game.currentTurn !== yourSeat) return false;

    const state = restrictionStateFromMelds(yourMelds);

    // 加杠：有碰且手里有第 4 张
    for (const m of yourMelds) {
      if (m.type !== 'peng') continue;
      const t = m.tiles[0];
      if (!yourHand.some(x => x === t)) continue;
      if (!canPengGangByRestriction(state, t).ok) continue;
      return true;
    }

    // 暗杠：手里有 4 张
    const cnt = new Map<Tile, number>();
    for (const t of yourHand) cnt.set(t, (cnt.get(t) ?? 0) + 1);
    for (const [t, c] of cnt.entries()) {
      if (c < 4) continue;
      if (!canPengGangByRestriction(state, t).ok) continue;
      return true;
    }

    return false;
  })();

  const gangAvailable = claimGangAvailable || selfGangAvailable;

  return {
    connected,
    players,
    started,
    wallCount: table.game.wallCount,
    discards: table.game.discardsList,
    turn: table.game.currentTurn,
    phase: table.game.currentPhase,
    yourSeat,
    yourHand,
    yourMelds,
    meldsBySeat,
    handCounts,
    winAvailable,
    gangAvailable,
    pengAvailable,
    chiAvailable,
    message: table.message,

    ...(chiAvailable ? { chiOptions: chiOpts } : {}),

    scores: table.scores,
    round: table.round,
    roundHistory: table.roundHistory,

    ...(publicResult ? { result: publicResult } : {}),
    ...(winInfo ? { winInfo } : {}),
  };
}

