import type { Tile } from './Tile';

// Debug wall tiles: all tiles are 万子 (m1..m9 cycling), total 136 like a normal wall.
export function makeDebugWallTiles(count = 136): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < count; i++) {
    const r = (i % 9) + 1;
    tiles.push((`m${r}`) as Tile);
  }
  return tiles;
}

// Debug wall tiles: all tiles are the same tile.
export function makeSameTileWallTiles(tile: Tile, count = 136): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < count; i++) tiles.push(tile);
  return tiles;
}
