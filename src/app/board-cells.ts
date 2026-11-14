import { getEngine } from '../engine/engine';
import type { Cell, CellState, Ship } from '../game/types';
import { FLEET_LENGTHS } from '../game/types';
import { logError } from './errors';

const UNKNOWN: readonly CellState[] = Array.from({ length: 100 }, () => 'unknown');

/**
 * `boardCells` for a doc that came from a peer: an invalid fleet or shot list never throws
 * into a screen. It renders all-unknown and is logged for `#/debug`.
 */
export function safeBoardCells(fleet: Ship[] | null, shots: Cell[], reveal: boolean): CellState[] {
  if (!fleet) return UNKNOWN.slice();
  try {
    return getEngine().boardCells(fleet, shots, reveal);
  } catch (e) {
    logError(e);
    return UNKNOWN.slice();
  }
}

/** Index of the ship covering `cell`, or -1. */
export function shipIndexAt(fleet: Ship[] | null, cell: Cell): number {
  return (fleet ?? []).findIndex((s, i) => {
    const step = s.dir === 'h' ? 1 : 10;
    const len = FLEET_LENGTHS[i] ?? 0;
    return cell >= s.bow && (cell - s.bow) % step === 0 && (cell - s.bow) / step < len;
  });
}
