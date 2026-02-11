export type Suit = 'm' | 'p' | 's' | 'z' | 'f';
export type Tile = `${Suit}${number}`; // m/p/s:1-9, z:1-7, f:1-8

export const SUITS: Suit[] = ['m', 'p', 's', 'z', 'f'];

export function isTile(t: string): t is Tile {
  return /^(?:[mps][1-9]|z[1-7]|f[1-8])$/.test(t);
}

export function tileIndex(t: Tile): number {
  const suit = t[0] as Suit;
  const n = Number(t.slice(1));
  if (suit === 'm') return 0 + (n - 1);
  if (suit === 'p') return 9 + (n - 1);
  if (suit === 's') return 18 + (n - 1);
  if (suit === 'z') return 27 + (n - 1);
  return 34 + (n - 1); // f
}

export function indexToTile(i: number): Tile {
  if (i < 0 || i >= 42) throw new Error('bad index');
  if (i < 9) return (`m${i + 1}`) as Tile;
  if (i < 18) return (`p${i - 9 + 1}`) as Tile;
  if (i < 27) return (`s${i - 18 + 1}`) as Tile;
  if (i < 34) return (`z${i - 27 + 1}`) as Tile;
  return (`f${i - 34 + 1}`) as Tile;
}

export function suitOfIndex(i: number): Suit {
  if (i < 9) return 'm';
  if (i < 18) return 'p';
  if (i < 27) return 's';
  if (i < 34) return 'z';
  return 'f';
}

export function rankOfIndex(i: number): number {
  if (i < 9) return i + 1;
  if (i < 18) return i - 9 + 1;
  if (i < 27) return i - 18 + 1;
  if (i < 34) return i - 27 + 1;
  return i - 34 + 1;
}
