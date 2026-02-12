/**
 * 行动仲裁（核心规则）：用于在【claim 阶段】多人同时拥有操作权时，决定接下来该结算什么。
 *
 * ⚠️ 说明
 * 这个文件现在是一个“门面/兼容层”。
 * 为了降低单文件体积、让逻辑更清晰可测试，我们已将 claim 逻辑拆分到：
 * - ./claim/types.ts    ：类型与数据结构（PendingClaim / ClaimResolution）
 * - ./claim/utils.ts    ：小工具（排序、判断是否都已表态）
 * - ./claim/decision.ts ：纯函数决策（胡>杠>碰>吃 的仲裁）
 *
 * 你可以继续从这里 import（保持对外 API 不变）。
 */

export type { PendingClaim, ClaimResolution } from './claim/types';
export { decidePendingClaim } from './claim/decision';
