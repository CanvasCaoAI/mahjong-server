import type { RuleStrategy } from './RuleStrategy';
import { ShanghaiRule } from './ShanghaiRule';

const RULES: RuleStrategy[] = [new ShanghaiRule()];

export function getRule(id: string | undefined | null): RuleStrategy {
  const key = String(id ?? '').trim().toLowerCase();
  return RULES.find(r => r.id === key) ?? RULES[0]!;
}

export function defaultRuleId(): string {
  return RULES[0]!.id;
}
