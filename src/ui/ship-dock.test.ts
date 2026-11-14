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

const cellEl = (i: number) => grid.querySelector<HTMLElement>(`[data-cell="${i}"]`)!;
const key = (k: string) => {
  const target = (document.activeElement as HTMLElement | null) ?? cellEl(0);
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};
type Said = { kind: string; ship: number; cell?: number; valid?: boolean };


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

  it('shuffle button hides its emoji from assistive tech', () => {
    const b = dock.querySelector<HTMLButtonElement>('button.shuffle')!;
    expect(b.querySelector('[aria-hidden="true"]')?.textContent).toBe('🔀');
  });

  describe('keyboard move', () => {
    let said: Said[];
    beforeEach(() => {
      said = [];
      dock.addEventListener('announce', (e) => said.push((e as CustomEvent<Said>).detail));
    });

    it('Enter picks up, arrows move the preview, Enter drops', () => {
      grid.focusCell(81);
      key('Enter');
      expect(said.at(-1)).toMatchObject({ kind: 'picked', ship: 4 });
      expect(placed).toHaveLength(0); // no rotation on Enter
      key('ArrowUp'); // bow 70: free
      expect(said.at(-1)).toMatchObject({ kind: 'moved', ship: 4, cell: 70, valid: true });
      expect(grid.querySelectorAll('.preview')).toHaveLength(2);
      expect(document.activeElement).toBe(cellEl(70));
      key('Enter');
      expect(placed).toHaveLength(1);
      expect(placed[0]![4]).toEqual({ bow: 70, dir: 'h' });
      expect(said.at(-1)).toMatchObject({ kind: 'dropped', ship: 4, cell: 70 });
      expect(grid.querySelectorAll('.preview')).toHaveLength(0);
    });

    it('an overlapping spot is shown red and cannot be dropped', () => {
      grid.focusCell(80);
      key('Enter');
      key('ArrowUp'); // bow 70: free
      key('ArrowUp'); // bow 60: overlaps the sloop
      expect(said.at(-1)).toMatchObject({ kind: 'moved', cell: 60, valid: false });
      expect(grid.querySelectorAll('.preview.invalid')).toHaveLength(2);
      key('Enter');
      expect(placed).toHaveLength(0);
      expect(said.at(-1)).toMatchObject({ kind: 'invalid', ship: 4 });
    });

    it('arrows never push a ship off the board', () => {
      grid.focusCell(0);
      key('Enter');
      key('ArrowLeft');
      key('ArrowUp');
      expect(said.filter((s) => s.kind === 'moved')).toHaveLength(0);
    });

    it('Escape cancels and puts the ship back', () => {
      grid.focusCell(80);
      key('Enter');
      key('ArrowUp');
      key('Escape');
      expect(placed).toHaveLength(0);
      expect(dock.fleet).toEqual(FLEET);
      expect(said.at(-1)).toMatchObject({ kind: 'cancelled', ship: 4 });
      expect(grid.querySelectorAll('.preview')).toHaveLength(0);
    });

    it('R turns the ship under focus', () => {
      grid.focusCell(81);
      key('r');
      expect(placed).toHaveLength(1);
      expect(placed[0]![4]).toEqual({ bow: 80, dir: 'v' });
      expect(said.at(-1)).toMatchObject({ kind: 'turned', ship: 4 });
    });

    it('Enter on water does nothing', () => {
      grid.focusCell(9);
      key('Enter');
      expect(said).toHaveLength(0);
      expect(placed).toHaveLength(0);
    });
  });
});
