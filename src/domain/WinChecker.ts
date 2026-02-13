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
    // Flowers are never part of a winning hand pattern; ignore them for win checking.
    const filtered = tiles.filter((t) => t[0] !== 'f');
    const strat = typeof rule === 'string' || rule == null ? getRule(rule) : rule;
    return strat.checkWin(filtered);
  }
}
