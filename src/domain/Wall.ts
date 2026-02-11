import type { Tile } from './Tile';
import { indexToTile } from './Tile';
import { makeDebugWallTiles, makeSameTileWallTiles } from './debugTile';

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export class Wall {
  private tiles: Tile[];

  private constructor(tiles: Tile[]) {
    this.tiles = tiles;
  }

  static full(): Wall {
    // 34 tile types x4 copies = 136
    const tiles: Tile[] = [];
    for (let i = 0; i < 34; i++) {
      const t = indexToTile(i);
      for (let k = 0; k < 4; k++) tiles.push(t);
    }
    shuffle(tiles);
    return new Wall(tiles);
  }

  static debugMan(): Wall {
    // 136 张全是万子，用于 debug
    return new Wall(makeDebugWallTiles(136));
  }

  static debugSame(tile: Tile): Wall {
    // 136 张全是同一张牌，用于 debug
    return new Wall(makeSameTileWallTiles(tile, 136));
  }

  draw(): Tile | null {
    return this.tiles.pop() ?? null;
  }

  get count(): number {
    return this.tiles.length;
  }
}
