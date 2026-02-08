import type { Tile } from '../domain/Tile';
import type { Seat } from '../game/Player';
import type { Phase, GameResult, DiscardEvent, Meld } from '../game/Game';
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
  pengAvailable: boolean;
  chiAvailable: boolean;
  message: string;
  result?: GameResult;
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

  const canPrompt = !!(started && yourSeat !== null && table.game.currentTurn === yourSeat && table.game.currentPhase !== 'end');
  const winAvailable = canPrompt ? !!WinChecker.check(yourHand).ok : false;

  const pending = table.game.getPendingClaim();
  const pengAvailable = !!(
    started &&
    yourSeat !== null &&
    pending &&
    table.game.currentPhase === 'claim' &&
    pending.fromSeat !== yourSeat &&
    yourHand.filter(t => t === pending.tile).length >= 2
  );

  const chiAvailable = !!(
    started &&
    yourSeat !== null &&
    pending &&
    table.game.currentPhase === 'claim' &&
    pending.chiSeat === yourSeat &&
    chiOptions(yourHand, pending.tile).length > 0
  );

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
    pengAvailable,
    chiAvailable,
    message: table.message,
    ...(result ? { result } : {})
  };
}

