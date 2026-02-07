import type { Tile } from '../domain/Tile';
import type { Seat } from '../game/Player';
import type { Phase, GameResult, DiscardEvent } from '../game/Game';
import type { Table } from '../game/Table';
import { WinChecker } from '../domain/WinChecker';

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
  handCounts: number[]; // 0-3
  winAvailable: boolean;
  message: string;
  result?: GameResult;
};

export function stateFor(table: Table, viewerSocketId: string, connected: boolean): PublicState {
  const yourSeat = table.findSeat(viewerSocketId);
  const started = table.game.isStarted;
  const players = table.players.map(p => (p ? { seat: p.seat, name: p.name, ready: p.ready } : null));

  const yourHand = yourSeat !== null ? table.game.getHand(yourSeat) : [];
  const handCounts = ([0, 1, 2, 3] as const).map((s) => table.game.getHandCount(s));

  const result = table.game.getResult();

  const canPrompt = !!(started && yourSeat !== null && table.game.currentTurn === yourSeat && table.game.currentPhase !== 'end');
  const winAvailable = canPrompt ? !!WinChecker.check(yourHand).ok : false;

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
    handCounts,
    winAvailable,
    message: table.message,
    ...(result ? { result } : {})
  };
}

