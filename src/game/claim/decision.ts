import type { PendingClaim, ClaimResolution } from './types';
import { allDecided, sortSeatsAsc } from './utils';

/**
 * 决策：决定 claim 阶段下一步怎么结算。
 *
 * 优先级（当前项目版本）：胡 > 杠 > 碰 > 吃
 *
 * 设计目标：
 * - 这是一个“纯函数”：只读取 PendingClaim，不修改任何外部状态。
 * - Game.ts 负责真正改变牌局状态（移牌、改 turn/phase、补摸、结束游戏等）。
 */
export function decidePendingClaim(p: PendingClaim): ClaimResolution {
  // 1) 胡：支持“一炮多响”。
  // 规则：只要任意一位可胡者点了“胡”，就视为所有可胡者一起胡。
  // 这样能避免有人没点导致卡住，并符合你当前项目的 UI/交互约定。
  const anyHuChosen = [...p.huEligible].some((s) => p.huDecision.get(s) === 'hu');
  if (anyHuChosen) return { kind: 'hu', winners: sortSeatsAsc([...p.huEligible]) };

  // 否则：仍需要等所有可胡者表态（胡/过），才能进入下一优先级。
  if (!allDecided(p.huEligible, p.huDecision)) return { kind: 'wait' };

  // 2) 杠：先等所有可杠者表态，再按 seat 升序取第一个选择“杠”的人。
  if (!allDecided(p.gangEligible, p.gangDecision)) return { kind: 'wait' };
  const gangChoosers = [...p.gangEligible].filter((s) => p.gangDecision.get(s) === 'gang');
  if (gangChoosers.length > 0) return { kind: 'gang', seat: sortSeatsAsc(gangChoosers)[0]! };

  // 3) 碰：同上。
  if (!allDecided(p.pengEligible, p.pengDecision)) return { kind: 'wait' };
  const pengChoosers = [...p.pengEligible].filter((s) => p.pengDecision.get(s) === 'peng');
  if (pengChoosers.length > 0) return { kind: 'peng', seat: sortSeatsAsc(pengChoosers)[0]! };

  // 4) 吃：只有 chiSeat 一家。
  if (p.chiEligible) {
    if (p.chiDecision === null) return { kind: 'wait' };
    if (p.chiDecision === 'chi') return { kind: 'chi', seat: p.chiSeat };
  }

  // 5) 所有人都过。
  return { kind: 'all_pass' };
}
