import type { Tile } from '../domain/Tile';
import type { Seat } from './Player';

export function countTile(hand: Tile[], t: Tile): number {
  let c = 0;
  for (const x of hand) if (x === t) c++;
  return c;
}

export function allSeats(): Seat[] {
  return [0, 1, 2, 3];
}
