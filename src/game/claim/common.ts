import type { Suit, Tile } from '../../domain/Tile';
import type { Seat } from '../Player';

/**
 * claim 阶段的通用小函数（偏“麻将领域通用”，不是仲裁器 utils）。
 *
 * 之所以单独抽出来：
 * - 避免原 claim.ts 这个名字过于宽泛
 * - countTile / allSeats / suitOf / rankOf 这类函数在多处会复用
 */

export function countTile(hand: Tile[], t: Tile): number {
  let c = 0;
  for (const x of hand) if (x === t) c++;
  return c;
}

export function allSeats(): Seat[] {
  return [0, 1, 2, 3];
}

export function suitOf(t: Tile): Suit {
  return t[0] as Suit;
}

export function rankOf(t: Tile): number {
  return Number(t.slice(1));
}

export function makeTile(suit: Suit, rank: number): Tile {
  return (`${suit}${rank}`) as Tile;
}
