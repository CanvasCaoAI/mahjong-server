import type { Tile } from './Tile';
import type { RuleStrategy, WinResult } from '../rules/RuleStrategy';
import { getRule } from '../rules/RuleRegistry';

/**
 * WinChecker is now a thin wrapper around a pluggable rule strategy.
 *
 * Default rule: Shanghai (simplified).
 */
export class WinChecker {
  static check(tiles: Tile[], rule?: RuleStrategy | string | null): WinResult {
    const strat = typeof rule === 'string' || rule == null ? getRule(rule) : rule;
    return strat.checkWin(tiles);
  }
}
