// Wrapper kept for backward compatibility.
// Actual scoring rules live under src/rules.

export type { RoundRecord, RoundSettleMeta } from '../rules/scoring/finalScoring';
export { computeRoundDelta, computeWinnerScoreAndReason } from '../rules/scoring/finalScoring';
