import type { Tile } from './Tile';
import { tileIndex, suitOfIndex, rankOfIndex } from './Tile';

export type WinResult = { ok: boolean; reason?: string };

export class WinChecker {
  // Simplest win rule: standard hand = 4 melds (pong/chow) + 1 pair, total 14 tiles.
  static check(tiles: Tile[]): WinResult {
    if (tiles.length !== 14) return { ok: false, reason: '需要14张牌才能判断胡牌' };

    const counts = new Array<number>(34).fill(0);
    for (const t of tiles) {
      const idx = tileIndex(t);
      counts[idx] = (counts[idx] ?? 0) + 1;
    }

    // Try every possible pair
    for (let i = 0; i < 34; i++) {
      if ((counts[i] ?? 0) >= 2) {
        counts[i] = (counts[i] ?? 0) - 2;
        if (this.canFormMelds(counts)) {
          counts[i] = (counts[i] ?? 0) + 2;
          return { ok: true, reason: '四面子一雀头' };
        }
        counts[i] = (counts[i] ?? 0) + 2;
      }
    }

    return { ok: false, reason: '未满足四面子一雀头' };
  }

  private static canFormMelds(counts: number[]): boolean {
    // Find first tile with count > 0
    let i = -1;
    for (let k = 0; k < 34; k++) {
      if ((counts[k] ?? 0) > 0) { i = k; break; }
    }
    if (i === -1) return true;

    // Try triplet
    if ((counts[i] ?? 0) >= 3) {
      counts[i] = (counts[i] ?? 0) - 3;
      if (this.canFormMelds(counts)) { counts[i] = (counts[i] ?? 0) + 3; return true; }
      counts[i] = (counts[i] ?? 0) + 3;
    }

    // Try sequence for suits m/p/s only
    const suit = suitOfIndex(i);
    if (suit !== 'z') {
      const r = rankOfIndex(i);
      if (r <= 7) {
        const i2 = i + 1;
        const i3 = i + 2;
        if ((counts[i2] ?? 0) > 0 && (counts[i3] ?? 0) > 0) {
          counts[i] = (counts[i] ?? 0) - 1; counts[i2] = (counts[i2] ?? 0) - 1; counts[i3] = (counts[i3] ?? 0) - 1;
          if (this.canFormMelds(counts)) { counts[i] = (counts[i] ?? 0) + 1; counts[i2] = (counts[i2] ?? 0) + 1; counts[i3] = (counts[i3] ?? 0) + 1; return true; }
          counts[i] = (counts[i] ?? 0) + 1; counts[i2] = (counts[i2] ?? 0) + 1; counts[i3] = (counts[i3] ?? 0) + 1;
        }
      }
    }

    return false;
  }
}
