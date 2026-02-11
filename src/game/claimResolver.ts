import type { Seat } from './Player';

/**
 * 行动仲裁（核心规则）：用于在【claim 阶段】多人同时拥有操作权时，决定接下来该结算什么。
 *
 * 你的项目当前的对局推进大致是：
 * - 某人打出一张牌 => 进入 claim 阶段
 * - 其他玩家可能同时拥有：胡 / 杠 / 碰 / 吃 的资格
 * - 服务器需要：
 *   1) 等所有“有资格的人”表态（选择操作 or 过）
 *   2) 按优先级结算（胡 > 杠 > 碰 > 吃）
 *   3) 若所有人都过 => 回到 draw 阶段（下一家摸牌）
 *
 * 这里的 decidePendingClaim() 只做“仲裁决策”，不做具体执行（execGang/execPeng/...）。
 * 好处：
 * - 算法集中、可读性更强
 * - Game.ts 仍负责真正改变牌局状态（移牌、改 turn/phase、补摸、结束游戏等）
 */

export type PendingClaim = {
  // 本次争议牌（由 fromSeat 打出）
  tile: any;
  fromSeat: Seat;

  // 吃只允许下一家（chiSeat）
  chiSeat: Seat;

  // === 资格集合（Eligible） ===
  // 只有在集合内的人，才需要对该动作做出“决定”
  huEligible: Set<Seat>;
  gangEligible: Set<Seat>;
  pengEligible: Set<Seat>;
  chiEligible: boolean;

  // === 决策记录（Decision） ===
  // 对于 eligible 的人：必须有一条记录才能进入结算
  // - 'hu' / 'gang' / 'peng' 表示选择执行
  // - 'pass' 表示放弃该层级机会
  huDecision: Map<Seat, 'hu' | 'pass'>;
  gangDecision: Map<Seat, 'gang' | 'pass'>;
  pengDecision: Map<Seat, 'peng' | 'pass'>;

  // 吃只有一个人（chiSeat），所以用单值
  chiDecision: 'chi' | 'pass' | null;
};

export type ClaimResolution =
  | { kind: 'wait' }
  | { kind: 'hu'; winners: Seat[] }
  | { kind: 'gang'; seat: Seat }
  | { kind: 'peng'; seat: Seat }
  | { kind: 'chi'; seat: Seat }
  | { kind: 'all_pass' };

function sortSeatsAsc(seats: Seat[]): Seat[] {
  return seats.slice().sort((a, b) => (a as number) - (b as number));
}

function allDecided<T extends string>(eligible: Set<Seat>, decision: Map<Seat, T>): boolean {
  for (const s of eligible) {
    if (!decision.has(s)) return false;
  }
  return true;
}

/**
 * 决定 claim 阶段下一步怎么结算。
 *
 * 优先级（你要求的版本）：胡 > 杠 > 碰 > 吃
 * - 胡支持“一炮多响”（可能返回多个 winners）
 * - 杠/碰如果多人可做：选 seat 编号最小的那一家（与你项目现有写法一致）
 */
export function decidePendingClaim(p: PendingClaim): ClaimResolution {
  // 1) 胡：如果存在多人可胡，只要任意一人选择“胡”，则视为所有可胡者一起胡
  // 这样可以避免有人没点导致卡住，也符合“一炮多响，点一人=全响”的项目需求。
  const anyHuChosen = [...p.huEligible].some((s) => p.huDecision.get(s) === 'hu');
  if (anyHuChosen) return { kind: 'hu', winners: sortSeatsAsc([...p.huEligible]) };

  // 否则：仍需要等所有可胡者表态（胡/过），才能进入下一优先级
  if (!allDecided(p.huEligible, p.huDecision)) return { kind: 'wait' };


  // 2) 再等所有可杠者表态
  if (!allDecided(p.gangEligible, p.gangDecision)) return { kind: 'wait' };

  const gangChoosers = [...p.gangEligible].filter((s) => p.gangDecision.get(s) === 'gang');
  if (gangChoosers.length > 0) return { kind: 'gang', seat: sortSeatsAsc(gangChoosers)[0]! };

  // 3) 再等所有可碰者表态
  if (!allDecided(p.pengEligible, p.pengDecision)) return { kind: 'wait' };

  const pengChoosers = [...p.pengEligible].filter((s) => p.pengDecision.get(s) === 'peng');
  if (pengChoosers.length > 0) return { kind: 'peng', seat: sortSeatsAsc(pengChoosers)[0]! };

  // 4) 最后处理吃（只有 chiSeat 一家）
  if (p.chiEligible) {
    if (p.chiDecision === null) return { kind: 'wait' };
    if (p.chiDecision === 'chi') return { kind: 'chi', seat: p.chiSeat };
  }

  // 5) 所有人都过
  return { kind: 'all_pass' };
}
