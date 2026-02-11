import type { Seat } from './Player';
import type { Tile } from '../domain/Tile';
import { WinChecker } from '../domain/WinChecker';
import type { Meld } from './Game';

export function tilesForWin(hand: Tile[], melds: Meld[]): Tile[] {
  const meldTiles = melds.flatMap(m => {
    if (m.type === 'gang') return m.tiles.slice(0, 3);
    return m.tiles;
  });
  return [...hand, ...meldTiles];
}

export function canHuOnDiscard(seat: Seat, hand: Tile[], melds: Meld[], discard: Tile): boolean {
  const tiles = [...tilesForWin(hand, melds), discard];
  return WinChecker.check(tiles).ok;
}
