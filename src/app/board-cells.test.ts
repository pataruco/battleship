import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setEngine } from '../engine/engine';
import { loadEngineForTests } from '../engine/load-node';
import { FLEET_A } from '../game/fixtures';
import type { Ship } from '../game/types';
import { safeBoardCells, shipIndexAt } from './board-cells';
import { recentErrors } from './errors';

beforeAll(async () => {
  setEngine(await loadEngineForTests());
});
afterEach(() => vi.restoreAllMocks());

describe('safeBoardCells', () => {
  it('renders a valid fleet', () => {
    const cells = safeBoardCells(FLEET_A, [0, 99], true);
    expect(cells[0]).toBe('hit');
    expect(cells[1]).toBe('ship');
    expect(cells[99]).toBe('miss');
  });

  it('renders all-unknown and logs for an invalid peer fleet, never throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const overlapping: Ship[] = FLEET_A.map(() => ({ bow: 0, dir: 'h' }));
    const before = recentErrors().length;
    const cells = safeBoardCells(overlapping, [], true);
    expect(cells).toHaveLength(100);
    expect(cells.every((c) => c === 'unknown')).toBe(true);
    expect(recentErrors().length).toBe(before + 1);
    expect(recentErrors().at(-1)?.message).toContain('RangeError');
  });

  it('renders all-unknown for a missing fleet without logging', () => {
    const before = recentErrors().length;
    expect(safeBoardCells(null, [], false).every((c) => c === 'unknown')).toBe(true);
    expect(recentErrors().length).toBe(before);
  });

  it('finds the ship at a cell', () => {
    expect(shipIndexAt(FLEET_A, 30)).toBe(1);
    expect(shipIndexAt(FLEET_A, 99)).toBe(-1);
    expect(shipIndexAt(null, 0)).toBe(-1);
  });
});
