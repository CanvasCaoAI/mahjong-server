import type { Suit, Tile } from '../domain/Tile';
import type { Seat } from './Player';

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

// 返回可吃的组合（需要从手牌里拿出的两张牌）；只支持 m/p/s；z 不能吃
export function chiOptions(hand: Tile[], tile: Tile): [Tile, Tile][] {
  const suit = suitOf(tile);
  if (suit === 'z') return [];
  const n = rankOf(tile);

  const has = (t: Tile) => countTile(hand, t) >= 1;

  const opts: [Tile, Tile][] = [];

  // (n-2,n-1,tile)
  if (n - 2 >= 1) {
    const a = makeTile(suit, n - 2);
    const b = makeTile(suit, n - 1);
    if (has(a) && has(b)) opts.push([a, b]);
  }

  // (n-1,tile,n+1)
  if (n - 1 >= 1 && n + 1 <= 9) {
    const a = makeTile(suit, n - 1);
    const b = makeTile(suit, n + 1);
    if (has(a) && has(b)) opts.push([a, b]);
  }

  // (tile,n+1,n+2)
  if (n + 2 <= 9) {
    const a = makeTile(suit, n + 1);
    const b = makeTile(suit, n + 2);
    if (has(a) && has(b)) opts.push([a, b]);
  }

  return opts;
}
