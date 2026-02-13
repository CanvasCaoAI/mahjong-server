import type { Tile } from '../domain/Tile';
import type { Meld } from '../game/Game';

/**
 * Shanghai mahjong restriction to support only:
 * - 清一色 / 混一色 / 对对胡
 *
 * Rule summary (m/p/s only; honors 'z' are ALWAYS exempt; flowers 'f' ignored):
 *
 * 1) If you have ever CHI (吃) a suited tile (m/p/s), then from that point on
 *    you may only chi/peng/gang tiles of that SAME suit. (Honors 'z' exempt.)
 *
 * 2) If you have PENG/GANG (碰/杠) of exactly ONE suit (m/p/s), then
 *    - peng/gang: any suit allowed
 *    - chi: only that ONE suit allowed
 *
 * 3) If you have PENG/GANG of TWO or more suits (m/p/s), then
 *    - peng/gang: any suit allowed
 *    - chi: NOT allowed
 *
 * Notes:
 * - Honors (z) are exempt: they do not affect restriction state and are never blocked by it.
 * - This restriction is enforced on the server and also used to filter "available" UI buttons.
 */

export type MPS = 'm' | 'p' | 's';
export type Suit = MPS | 'z' | 'f';

export function tileSuit(t: Tile): Suit {
  return t[0] as Suit;
}

export type RestrictionState = {
  chiLockedSuit: MPS | null;
  pengGangSuits: Set<MPS>;
};

export function restrictionStateFromMelds(melds: Meld[]): RestrictionState {
  let chiLockedSuit: MPS | null = null;
  const pengGangSuits = new Set<MPS>();

  for (const m of melds) {
    if (m.type === 'flower') continue;

    // any suited tile in this meld counts as that suit
    const t0 = m.tiles[0] as Tile;
    const s = tileSuit(t0);

    if (s === 'z' || s === 'f') continue;

    if (m.type === 'chi') {
      // first chi locks suit
      if (!chiLockedSuit) chiLockedSuit = s;
      continue;
    }

    if (m.type === 'peng' || m.type === 'gang') {
      pengGangSuits.add(s);
    }
  }

  return { chiLockedSuit, pengGangSuits };
}

export function isHonor(t: Tile): boolean {
  return tileSuit(t) === 'z';
}

export function isMPS(s: Suit): s is MPS {
  return s === 'm' || s === 'p' || s === 's';
}

export function canChiByRestriction(state: RestrictionState, tile: Tile): { ok: boolean; reason?: string } {
  const s = tileSuit(tile);
  if (s === 'z') return { ok: true };
  if (!isMPS(s)) return { ok: false, reason: '不能吃该牌' };

  if (state.chiLockedSuit) {
    return s === state.chiLockedSuit ? { ok: true } : { ok: false, reason: '已吃牌定色，不能吃其它花色' };
  }

  if (state.pengGangSuits.size >= 2) {
    return { ok: false, reason: '已碰/杠两门，不能再吃牌' };
  }

  if (state.pengGangSuits.size === 1) {
    const only = [...state.pengGangSuits][0] as MPS;
    return s === only ? { ok: true } : { ok: false, reason: '已碰/杠定色，吃牌只能吃该花色' };
  }

  return { ok: true };
}

export function canPengGangByRestriction(state: RestrictionState, tile: Tile): { ok: boolean; reason?: string } {
  const s = tileSuit(tile);
  if (s === 'z') return { ok: true };
  if (!isMPS(s)) return { ok: false, reason: '不能碰/杠该牌' };

  if (state.chiLockedSuit) {
    return s === state.chiLockedSuit ? { ok: true } : { ok: false, reason: '已吃牌定色，不能碰/杠其它花色' };
  }

  // peng/gang are always allowed otherwise
  return { ok: true };
}
