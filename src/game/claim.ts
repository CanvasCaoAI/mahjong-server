/**
 * 兼容层：原来的 claim.ts 命名确实容易让人困惑。
 *
 * 现在我们把它拆成更明确的模块：
 * - ./claim/common.ts ：countTile / allSeats / suitOf / rankOf / makeTile
 * - ./claim/chi.ts    ：chiOptions（吃牌组合计算）
 *
 * 但为了不一次性改动大量 import，这里保留 re-export。
 */

export * from './claim/common';
export * from './claim/chi';
