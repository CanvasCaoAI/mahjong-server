import type { Tile } from '../domain/Tile';
import type { Meld } from '../game/Game';

export function isQingYiSeTiles(tiles: Tile[]): boolean {
  // 清一色：纯一门数牌，不含字牌；忽略花牌
  const ts = tiles.filter((t) => t[0] !== 'f');
  if (ts.length === 0) return false;
  if (ts.some((t) => t[0] === 'z')) return false;
  const suits = new Set(ts.map((t) => t[0]).filter((s) => s === 'm' || s === 'p' || s === 's'));
  return suits.size === 1;
}

function suitOf(t: Tile): 'm'|'p'|'s'|'z'|'f' {
  return t[0] as any;
}
function rankOf(t: Tile): number {
  return Number(t.slice(1));
}

/**
 * “有花”判定（用于：没有花不能胡，清一色除外）
 *
 * 注意：这里的“花”指计分里能算花的来源，不包含“底 2 花”，否则人人都有花就失去意义。
 *
 * 计入：
 * - 花牌（meld.type === 'flower'）
 * - 明/暗杠（普通数牌、风牌、三元牌都算花，按规则的花数）
 * - 字牌刻子/碰（东南西北=1花，中发白=2花）
 */
export function extraFlowerCountForHu(melds: Meld[], tilesForWin: Tile[]): number {
  let flower = 0;

  // 1) 花牌
  for (const m of melds) {
    if (m.type === 'flower') flower += m.tiles.length;
  }

  // 2) 杠
  for (const m of melds) {
    if (m.type !== 'gang') continue;
    const t = m.tiles[0];
    const suit = suitOf(t);
    const r = rankOf(t);
    const isConcealed = m.kind === 'concealed';
    const isMing = m.kind === 'discard' || m.kind === 'add';

    if (suit === 'm' || suit === 'p' || suit === 's') {
      if (isMing) flower += 1;
      if (isConcealed) flower += 2;
    } else if (suit === 'z') {
      const isWind = r >= 1 && r <= 4;
      const isDragon = r >= 5 && r <= 7;
      if (isWind) {
        if (isMing) flower += 2;
        if (isConcealed) flower += 3;
      } else if (isDragon) {
        if (isMing) flower += 3;
        if (isConcealed) flower += 4;
      }
    }
  }

  // 3) 字牌刻子/碰（非杠）
  // tilesForWin 里杠按 3 张表示；我们已经在(2)计过杠的花，这里跳过杠对应的字牌。
  const honorGangTiles = new Set<Tile>();
  for (const m of melds) {
    if (m.type === 'gang') {
      const t = m.tiles[0];
      if (suitOf(t) === 'z') honorGangTiles.add(t);
    }
  }

  const ts = tilesForWin.filter((t) => suitOf(t) !== 'f');
  const cnt = new Map<Tile, number>();
  for (const t of ts) cnt.set(t, (cnt.get(t) ?? 0) + 1);

  for (const [t, c] of cnt.entries()) {
    if (suitOf(t) !== 'z') continue;
    if (honorGangTiles.has(t)) continue;
    const triples = Math.floor(c / 3);
    if (triples <= 0) continue;
    const r = rankOf(t);
    const isWind = r >= 1 && r <= 4;
    const isDragon = r >= 5 && r <= 7;
    if (isWind) flower += 1 * triples;
    if (isDragon) flower += 2 * triples;
  }

  return flower;
}
