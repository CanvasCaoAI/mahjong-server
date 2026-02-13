import type { Seat } from './Player';
import type { Tile } from '../domain/Tile';
import type { Game, Meld } from './Game';

export type RoundRecord = {
  round: number;
  winners: Seat[];
  winTile: Tile | null;
  winType: 'self' | 'discard' | 'unknown';
  fromSeat: Seat | null;
  reason: string;
  deltaBySeat: Record<Seat, number>;
};

export type RoundSettleMeta = {
  winType: 'self' | 'discard' | 'unknown';
  fromSeat: Seat | null;
  winTile: Tile | null;
};

type Suit = 'm' | 'p' | 's' | 'z' | 'f';

function suitOf(t: Tile): Suit {
  return t[0] as Suit;
}

function rankOf(t: Tile): number {
  return Number(t.slice(1));
}

function countTiles(tiles: Tile[]): Map<Tile, number> {
  const m = new Map<Tile, number>();
  for (const t of tiles) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function isAllHonors(tiles: Tile[]): boolean {
  const ts = tiles.filter((t) => suitOf(t) !== 'f');
  return ts.length > 0 && ts.every((t) => suitOf(t) === 'z');
}

function isQingYiSe(tiles: Tile[]): boolean {
  const ts = tiles.filter((t) => suitOf(t) !== 'f');
  if (ts.some((t) => suitOf(t) === 'z')) return false;
  const suits = new Set(ts.map((t) => suitOf(t)).filter((s) => s === 'm' || s === 'p' || s === 's'));
  return suits.size === 1;
}

function isHunYiSe(tiles: Tile[]): boolean {
  const ts = tiles.filter((t) => suitOf(t) !== 'f');
  const hasHonor = ts.some((t) => suitOf(t) === 'z');
  const suits = new Set(ts.map((t) => suitOf(t)).filter((s) => s === 'm' || s === 'p' || s === 's'));
  // one suit + honors, and no other suits
  return hasHonor && suits.size === 1;
}

function isPengPeng(tiles: Tile[]): boolean {
  const ts = tiles.filter((t) => suitOf(t) !== 'f');
  const cnt = countTiles(ts);
  let pairs = 0;
  for (const c of cnt.values()) {
    if (c === 2) pairs += 1;
    else if (c === 3) continue;
    else {
      // Note: in this server, gang tiles are represented as 3 tiles in tilesForWin(), so 4 should not appear.
      // If it does, treat as not pengpeng for safety.
      return false;
    }
  }
  return pairs === 1;
}

function isQingPeng(tiles: Tile[]): boolean {
  const ts = tiles.filter((t) => suitOf(t) !== 'f');
  if (ts.some((t) => suitOf(t) === 'z')) return false;
  return isPengPeng(ts);
}

function isFengPeng(tiles: Tile[]): boolean {
  // 字牌的碰碰胡
  const ts = tiles.filter((t) => suitOf(t) !== 'f');
  if (!isAllHonors(ts)) return false;
  return isPengPeng(ts);
}

function isDaDiaoChe(game: Game, winner: Seat, meta: RoundSettleMeta): boolean {
  // 定义：听牌时手里只剩 1 张牌在等胡。
  // 近似判定：
  // - 点炮：胡牌前手牌长度应为 1
  // - 自摸：胡牌前手牌长度应为 1，胡后会变成 2（因此判定手牌长度为 2）
  // 这里只能用结算时手牌长度做 best-effort。
  const handLen = (game.getHand(winner) ?? []).length;
  if (meta.winType === 'discard') return handLen === 1;
  if (meta.winType === 'self') return handLen === 2;
  return false;
}

function normalFlowerCount(game: Game, winner: Seat): number {
  // 普通算花：底 2 花 + 花牌 + 杠/字刻
  // 并封顶 10。
  let flower = 2;

  const melds = game.getMelds(winner) as Meld[];

  // 1) 花牌：每张 1 花
  for (const m of melds) {
    if (m.type === 'flower') flower += m.tiles.length;
  }

  // 2) 杠：按牌种与明暗
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

  // 3) 字牌刻/碰/暗刻：
  // - 东南西北：碰出或暗刻 1 花
  // - 中发白：碰出或暗刻 2 花
  // 注意：普通数牌碰/暗刻不算花。
  // 这里用总牌面计数（排除花牌与杠）来统计字牌刻子数。
  const tilesForWin = (game.getResult()?.handsBySeat?.[winner] ?? []) as Tile[];
  const ts = tilesForWin.filter((t) => suitOf(t) !== 'f');

  // exclude gang tiles (we already counted gangs above). For this server, gangs appear as 3 tiles in tilesForWin.
  const honorGangTiles = new Set<Tile>();
  for (const m of melds) {
    if (m.type !== 'gang') continue;
    const t = m.tiles[0];
    if (suitOf(t) === 'z') honorGangTiles.add(t);
  }

  const cnt = countTiles(ts);
  for (const [t, c] of cnt.entries()) {
    if (suitOf(t) !== 'z') continue;
    if (honorGangTiles.has(t)) continue; // counted as gang
    const triples = Math.floor(c / 3);
    if (triples <= 0) continue;
    const r = rankOf(t);
    const isWind = r >= 1 && r <= 4;
    const isDragon = r >= 5 && r <= 7;
    if (isWind) flower += 1 * triples;
    if (isDragon) flower += 2 * triples;
  }

  return Math.min(flower, 10);
}

export function computeWinnerScoreAndReason(args: {
  game: Game;
  winner: Seat;
  winnerTiles: Tile[];
  meta: RoundSettleMeta;
}): { score: number; reason: string } {
  const { game, winner, winnerTiles, meta } = args;

  const daDiaoChe = isDaDiaoChe(game, winner, meta);
  const qingYiSe = isQingYiSe(winnerTiles);
  const qingPeng = isQingPeng(winnerTiles);
  const allHonors = isAllHonors(winnerTiles);
  const fengPeng = isFengPeng(winnerTiles);

  // 大吊车清一色：同时满足
  if (daDiaoChe && qingYiSe) return { score: 20, reason: '大吊车清一色' };

  // 辣子封顶类：不算花细节
  if (fengPeng) return { score: 40, reason: '风碰' };
  if (allHonors) return { score: 20, reason: '全风向' };
  if (qingPeng) return { score: 20, reason: '清碰' };
  if (qingYiSe) return { score: 10, reason: '清一色' };
  if (daDiaoChe) return { score: 10, reason: '大吊车' };

  // 普通算花：混一色/碰碰胡等都走这里（并封顶 10）
  const score = normalFlowerCount(game, winner);

  // 显示优先级：如果同时满足“大吊车”和（混一色/碰碰胡）优先显示大吊车。
  // （大吊车已在上面处理，这里只剩非大吊车情况）
  if (isHunYiSe(winnerTiles)) return { score, reason: '混一色' };
  if (isPengPeng(winnerTiles)) return { score, reason: '碰碰胡' };

  return { score, reason: '胡牌' };
}

export function computeRoundDelta(args: {
  winners: Seat[];
  winType: 'self' | 'discard' | 'unknown';
  fromSeat: Seat | null;
  scoreByWinner: Partial<Record<Seat, number>>;
}): Record<Seat, number> {
  const delta: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

  if (args.winners.length === 0) return delta;

  // 自摸：默认只支持单胡。若出现多人，退化为点炮逻辑。
  if (args.winType === 'self' && args.winners.length === 1) {
    const w = args.winners[0]!;
    const score = args.scoreByWinner[w] ?? 0;
    delta[w] += score * 3;
    for (const s of [0, 1, 2, 3] as const) {
      if (s === w) continue;
      delta[s] -= score;
    }
    return delta;
  }

  // 点炮/unknown：fromSeat 付给每个胡家（支持一炮多响，且不同胡家可不同分）
  const from = args.fromSeat;
  for (const w of args.winners) {
    const score = args.scoreByWinner[w] ?? 0;
    delta[w] += score;
    if (from !== null) delta[from] -= score;
  }

  return delta;
}
