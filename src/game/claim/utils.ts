import type { Seat } from '../Player';

/**
 * claim 阶段的小工具函数。
 */

/** Seat 升序排序（用来确定多人冲突时的“最小 seat 优先”规则） */
export function sortSeatsAsc(seats: Seat[]): Seat[] {
  return seats.slice().sort((a, b) => (a as number) - (b as number));
}

/**
 * 判断：eligible 中每个 seat 是否都已经做出决策。
 * - 只要有一个 seat 未记录 decision => 视为未决定完成。
 */
export function allDecided<T extends string>(eligible: Set<Seat>, decision: Map<Seat, T>): boolean {
  for (const s of eligible) {
    if (!decision.has(s)) return false;
  }
  return true;
}
