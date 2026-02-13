import type { Tile } from '../domain/Tile';

export function isQingYiSeTiles(tiles: Tile[]): boolean {
  // 清一色：纯一门数牌，不含字牌；忽略花牌
  const ts = tiles.filter((t) => t[0] !== 'f');
  if (ts.length === 0) return false;
  if (ts.some((t) => t[0] === 'z')) return false;
  const suits = new Set(ts.map((t) => t[0]).filter((s) => s === 'm' || s === 'p' || s === 's'));
  return suits.size === 1;
}
