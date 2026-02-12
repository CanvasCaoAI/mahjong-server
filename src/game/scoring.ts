import type { Seat } from './Player';
import type { Tile } from '../domain/Tile';

export type RoundRecord = {
  round: number;
  winners: Seat[];
  winTile: Tile | null;
  winType: 'self' | 'discard' | 'unknown';
  fromSeat: Seat | null;
  reason: string;
  deltaBySeat: Record<Seat, number>;
};

// Simple zero-sum scoring (can be replaced later):
// - self-draw: winner +3, others -1
// - discard win (incl 一炮多响): each winner +1, discarder pays -1 per winner
export function computeRoundDelta(args: {
  winners: Seat[];
  winType: 'self' | 'discard' | 'unknown';
  fromSeat: Seat | null;
}): Record<Seat, number> {
  const delta: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

  if (args.winners.length === 0) return delta;

  if (args.winType === 'self' && args.winners.length === 1) {
    const w = args.winners[0]!;
    delta[w] += 3;
    for (const s of [0, 1, 2, 3] as const) {
      if (s === w) continue;
      delta[s] -= 1;
    }
    return delta;
  }

  // discard/unknown: discarder pays winners
  const from = args.fromSeat;
  for (const w of args.winners) {
    delta[w] += 1;
    if (from !== null) delta[from] -= 1;
  }
  return delta;
}
