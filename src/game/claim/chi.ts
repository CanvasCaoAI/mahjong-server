import type { Tile } from '../../domain/Tile';
import { countTile, makeTile, rankOf, suitOf } from './common';

/**
 * 吃牌相关：计算可吃的组合。
 *
 * 返回值：从手牌里需要拿出的两张牌 (a,b)，最终吃牌组成为 [a, tile, b]。
 * 说明：
 * - 只支持 m/p/s
 * - 字牌 z 不能吃（直接返回空）
 */
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
