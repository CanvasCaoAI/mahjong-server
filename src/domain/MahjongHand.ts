import type { Tile } from './Tile';

export class MahjongHand {
  private tiles: Tile[] = [];

  constructor(init?: Tile[]) {
    if (init) this.tiles = init.slice();
  }

  add(tile: Tile) {
    this.tiles.push(tile);
  }

  removeAt(index: number): Tile {
    if (!Number.isInteger(index) || index < 0 || index >= this.tiles.length) {
      throw new Error('bad index');
    }
    const removed = this.tiles.splice(index, 1);
    if (!removed[0]) throw new Error('bad index');
    return removed[0];
  }

  get list(): Tile[] {
    return this.tiles.slice();
  }

  get size(): number {
    return this.tiles.length;
  }
}
