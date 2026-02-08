import type { Tile } from '../domain/Tile';
import { tileIndex, suitOfIndex, rankOfIndex } from '../domain/Tile';
import type { RuleStrategy, WinResult } from './RuleStrategy';

/**
 * Shanghai Mahjong (project-specific)
 *
 * Only 4 win patterns are supported (平胡不能胡):
 * 1) 清一色
 * 2) 混一色（必须包含字牌）
 * 3) 对对胡（4 刻子 + 1 将；不允许顺子）
 * 4) 全风向（14 张全是字牌：东南西北中发白；不要求 4 面子 1 将）
 *
 * Combination:
 * - 清一色 + 对对胡 => 清对对胡
 */
export class ShanghaiRule implements RuleStrategy {
  readonly id = 'shanghai';
  readonly name = '上海麻将（4种牌型）';

  checkWin(tiles: Tile[]): WinResult {
    if (tiles.length !== 14) return { ok: false, reason: '需要14张牌才能判断胡牌' };

    const counts = new Array<number>(34).fill(0);
    let hasHonor = false;
    const suits = new Set<string>();

    for (const t of tiles) {
      const idx = tileIndex(t);
      counts[idx] = (counts[idx] ?? 0) + 1;
      const s = t[0] as string;
      if (s === 'z') hasHonor = true;
      else suits.add(s);
    }

    // 4) 全风向：全部是字牌（z1~z7）
    const allHonors = suits.size === 0 && hasHonor;
    if (allHonors) return { ok: true, reason: '全风向' };

    // 3) 对对胡：必须 4 刻子 + 1 将（仅用刻子，不允许顺子）
    const isDuiDuiHu = this.isAllTripletsWithPair(counts.slice());

    // 1) 清一色：仅一种花色（m/p/s），不含字牌
    const isQingYiSe = !hasHonor && suits.size === 1;

    // 2) 混一色：仅一种花色 + 必须有字牌
    const isHunYiSe = hasHonor && suits.size === 1;

    // 组合：清对对胡
    if (isQingYiSe && isDuiDuiHu) return { ok: true, reason: '清对对胡' };

    if (isQingYiSe) return { ok: true, reason: '清一色' };
    if (isHunYiSe) return { ok: true, reason: '混一色' };
    if (isDuiDuiHu) return { ok: true, reason: '对对胡' };

    return { ok: false, reason: '不满足上海麻将胡牌牌型（平胡不能胡）' };
  }

  private isAllTripletsWithPair(counts: number[]): boolean {
    // Try every possible pair
    for (let i = 0; i < 34; i++) {
      if ((counts[i] ?? 0) >= 2) {
        counts[i] = (counts[i] ?? 0) - 2;

        let ok = true;
        for (let k = 0; k < 34; k++) {
          const c = counts[k] ?? 0;
          if (c % 3 !== 0) {
            ok = false;
            break;
          }
        }

        counts[i] = (counts[i] ?? 0) + 2;
        if (ok) return true;
      }
    }
    return false;
  }
}
