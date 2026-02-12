import type { Seat } from '../Player';

/**
 * claim 阶段的数据结构定义。
 *
 * 说明：
 * - claim 阶段指“某人打出一张牌后，其它玩家可能同时拥有 胡/杠/碰/吃 的窗口期”。
 * - PendingClaim 保存：本次争议牌、谁有资格(eligible)、谁做了什么决定(decision)。
 */

export type PendingClaim = {
  /** 本次争议牌（由 fromSeat 打出） */
  tile: any;
  /** 打出争议牌的人（点炮来源） */
  fromSeat: Seat;

  /** 吃只允许下一家（chiSeat） */
  chiSeat: Seat;

  // === 资格集合（Eligible）===
  // 只有在集合内的人，才需要对该动作做出“决定”
  huEligible: Set<Seat>;
  gangEligible: Set<Seat>;
  pengEligible: Set<Seat>;
  /** 吃是否可能（只有 chiSeat 有意义） */
  chiEligible: boolean;

  // === 决策记录（Decision）===
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
