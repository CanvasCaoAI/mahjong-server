import type { Tile } from '../domain/Tile';
import type { Seat } from '../game/Player';
import type { Phase, GameResult, DiscardEvent, Meld } from '../game/Game';

type PublicResult = Omit<GameResult, 'reason'>;
import type { Table } from '../game/Table';
import { WinChecker } from '../domain/WinChecker';
import { chiOptions } from '../game/claim';

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
  message: string;
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
  const selfWinAvailable = canSelfHu ? !!WinChecker.check(tilesForWin).ok : false;

  // 点炮胡：claim 阶段，且该 seat 在 huEligible 中且尚未决定
  const claimWinAvailable = !!(
    started &&
    yourSeat !== null &&
    pending &&
    table.game.currentPhase === 'claim' &&
    pending.fromSeat !== yourSeat &&
    pending.huEligible.includes(yourSeat) &&
    !pending.huDecided.includes(yourSeat) &&
    WinChecker.check([...tilesForWin, pending.tile]).ok
  );

  const winAvailable = selfWinAvailable || claimWinAvailable;

  const claimGangAvailable = !!(
    started &&
    yourSeat !== null &&
    pending &&
    table.game.currentPhase === 'claim' &&
    pending.fromSeat !== yourSeat &&
    pending.gangEligible?.includes(yourSeat) &&
    !pending.gangDecided?.includes(yourSeat) &&
    yourHand.filter(t => t === pending.tile).length >= 3
  );

  const pengAvailable = !!(
    started &&
    yourSeat !== null &&
    pending &&
    table.game.currentPhase === 'claim' &&
    pending.fromSeat !== yourSeat &&
    pending.pengEligible.includes(yourSeat) &&
    !pending.pengDecided.includes(yourSeat) &&
    yourHand.filter(t => t === pending.tile).length >= 2
  );

  const chiAvailable = !!(
    started &&
    yourSeat !== null &&
    pending &&
    table.game.currentPhase === 'claim' &&
    pending.chiEligible &&
    pending.chiSeat === yourSeat &&
    !pending.chiDecided &&
    chiOptions(yourHand, pending.tile).length > 0
  );

  // 自己回合的暗杠/加杠
  const selfGangAvailable = (() => {
    if (!started || yourSeat === null) return false;
    if (table.game.currentPhase !== 'discard') return false;
    if (table.game.currentTurn !== yourSeat) return false;

    // 加杠：有碰且手里有第 4 张
    for (const m of yourMelds) {
      if (m.type !== 'peng') continue;
      const t = m.tiles[0];
      if (yourHand.some(x => x === t)) return true;
    }

    // 暗杠：手里有 4 张
    const cnt = new Map<Tile, number>();
    for (const t of yourHand) cnt.set(t, (cnt.get(t) ?? 0) + 1);
    for (const c of cnt.values()) if (c >= 4) return true;

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
    ...(publicResult ? { result: publicResult } : {}),
    ...(winInfo ? { winInfo } : {}),
  };
}

