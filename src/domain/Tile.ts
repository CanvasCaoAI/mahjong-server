export type Suit = 'm' | 'p' | 's' | 'z';
export type Tile = `${Suit}${number}`; // m/p/s:1-9, z:1-7

export const SUITS: Suit[] = ['m', 'p', 's', 'z'];

export function isTile(t: string): t is Tile {
  return /^[mpsz](?:[1-9]|[1-7])$/.test(t);
}

export function tileIndex(t: Tile): number {
  const suit = t[0] as Suit;
  const n = Number(t.slice(1));
  if (suit === 'm') return 0 + (n - 1);
  if (suit === 'p') return 9 + (n - 1);
  if (suit === 's') return 18 + (n - 1);
  return 27 + (n - 1); // z
}

export function indexToTile(i: number): Tile {
  if (i < 0 || i >= 34) throw new Error('bad index');
  if (i < 9) return (`m${i + 1}`) as Tile;
  if (i < 18) return (`p${i - 9 + 1}`) as Tile;
  if (i < 27) return (`s${i - 18 + 1}`) as Tile;
  return (`z${i - 27 + 1}`) as Tile;
}

export function suitOfIndex(i: number): Suit {
  if (i < 9) return 'm';
  if (i < 18) return 'p';
  if (i < 27) return 's';
  return 'z';
}

export function rankOfIndex(i: number): number {
  if (i < 9) return i + 1;
  if (i < 18) return i - 9 + 1;
  if (i < 27) return i - 18 + 1;
  return i - 27 + 1;
}
