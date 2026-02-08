import type { Tile } from '../domain/Tile';

export type WinResult = { ok: boolean; reason?: string };

/**
 * Mahjong rule strategy interface.
 *
 * Notes:
 * - `tiles` should represent the *full* tiles relevant to winning check.
 *   In this project that means: (hand tiles + exposed meld tiles + winning discard if ron).
 */
export interface RuleStrategy {
  /** Stable id used for config/room selection. */
  readonly id: string;
  /** Display name (for UI / debugging). */
  readonly name: string;

  checkWin(tiles: Tile[]): WinResult;
}
