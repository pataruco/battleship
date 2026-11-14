// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEngine, setEngine } from '../engine/engine';
import { loadEngineForTests } from '../engine/load-node';
import type { Ship } from '../game/types';
import type { SeaGrid } from './sea-grid';
import './sea-grid';
import './ship-dock';
import type { ShipDock } from './ship-dock';

const FLEET: Ship[] = [
  { bow: 0, dir: 'h' },
  { bow: 20, dir: 'h' },
  { bow: 40, dir: 'h' },
  { bow: 60, dir: 'h' },
  { bow: 80, dir: 'h' },
];

let grid: SeaGrid;
let dock: ShipDock;
let placed: Ship[][];

const press = (cell: number) =>
  grid
    .querySelector<HTMLElement>(`[data-cell="${cell}"]`)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));

beforeAll(async () => {
  setEngine(await loadEngineForTests());
});
beforeEach(() => {
  document.body.replaceChildren();
  grid = document.createElement('sea-grid') as SeaGrid;
  dock = document.createElement('ship-dock') as ShipDock;
  document.body.append(grid, dock);
  dock.grid = grid;
  dock.fleet = FLEET;
  placed = [];
  dock.addEventListener('place', (e) =>
    placed.push((e as CustomEvent<{ fleet: Ship[] }>).detail.fleet),
  );
});
afterEach(() => vi.useRealTimers());

describe('<ship-dock>', () => {
  it('rotates a ship when it fits and dispatches place', () => {
    press(81);
    expect(placed).toHaveLength(1);
    expect(placed[0]![4]).toEqual({ bow: 80, dir: 'v' });
    expect(getEngine().checkFleet(placed[0]!)).toBeNull();
    expect(dock.fleet).toEqual(placed[0]);
    expect(grid.querySelector('[data-cell="90"]')?.getAttribute('aria-label')).toBe(
      'A10, ship',
    );
  });

  it('flags an invalid rotation for 600 ms and dispatches nothing', () => {
    vi.useFakeTimers();
    press(0);
    expect(placed).toHaveLength(0);
    expect(dock.fleet).toEqual(FLEET);
    expect(dock.classList.contains('invalid')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(dock.classList.contains('invalid')).toBe(false);
  });

  it('shuffle dispatches a valid fleet', () => {
    dock.querySelector<HTMLButtonElement>('button.shuffle')!.click();
    expect(placed).toHaveLength(1);
    expect(placed[0]).toHaveLength(5);
    expect(getEngine().checkFleet(placed[0]!)).toBeNull();
    expect(grid.querySelectorAll('[data-state="ship"]')).toHaveLength(17);
  });
});
