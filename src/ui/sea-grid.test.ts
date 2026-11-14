// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Cell, CellState } from '../game/types';
import './sea-grid';
import type { SeaGrid } from './sea-grid';

let grid: SeaGrid;
let aims: Cell[];

const cell = (i: number) =>
  grid.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)!;
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

beforeEach(() => {
  document.body.replaceChildren();
  grid = document.createElement('sea-grid') as SeaGrid;
  document.body.append(grid);
  aims = [];
  grid.addEventListener('aim', (e) =>
    aims.push((e as CustomEvent<{ cell: Cell }>).detail.cell),
  );
});

describe('<sea-grid>', () => {
  it('renders 10 rows and 100 gridcells with labels', () => {
    expect(grid.querySelectorAll('[role="grid"]')).toHaveLength(1);
    expect(grid.querySelectorAll('[role="row"]')).toHaveLength(10);
    expect(grid.querySelectorAll('button[role="gridcell"]')).toHaveLength(100);
    expect(cell(23).getAttribute('aria-label')).toBe('D3, water');
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('names the grid with its label', () => {
    expect(grid.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('Sea');
    grid.label = 'Their sea';
    expect(grid.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('Their sea');
  });

  it('shows state words, glyphs and the aimed cell', () => {
    const cells: CellState[] = Array.from({ length: 100 }, () => 'unknown');
    cells[1] = 'miss';
    cells[2] = 'hit';
    cells[3] = 'sunk';
    grid.cells = cells;
    grid.aim = 5;
    expect(cell(1).getAttribute('aria-label')).toBe('B1, miss');
    expect(cell(1).textContent).toBe('•');
    expect(cell(2).textContent).toBe('✕');
    expect(cell(3).getAttribute('aria-label')).toBe('D1, sunk');
    expect(cell(5).getAttribute('aria-label')).toBe('F1, water, aimed');
  });

  it('moves focus with arrow keys', () => {
    cell(0).focus();
    key(cell(0), 'ArrowRight');
    expect(document.activeElement).toBe(cell(1));
    key(cell(1), 'ArrowLeft');
    key(cell(0), 'ArrowDown');
    expect(document.activeElement).toBe(cell(10));
    expect(cell(10).tabIndex).toBe(0);
    expect(cell(0).tabIndex).toBe(-1);
  });

  it('Enter dispatches aim for the focused cell', () => {
    cell(0).focus();
    key(cell(0), 'ArrowRight');
    key(cell(1), 'Enter');
    expect(aims).toEqual([1]);
  });

  it('click dispatches aim, but not on a fired cell', () => {
    const cells: CellState[] = Array.from({ length: 100 }, () => 'unknown');
    cells[7] = 'miss';
    grid.cells = cells;
    expect(cell(7).getAttribute('aria-disabled')).toBe('true');
    cell(7).click();
    expect(aims).toEqual([]);
    cell(8).click();
    expect(aims).toEqual([8]);
  });

  it('disabled stops all dispatches', () => {
    grid.disabled = true;
    cell(4).click();
    cell(4).focus();
    key(cell(4), 'Enter');
    key(cell(4), ' ');
    expect(aims).toEqual([]);
  });

  it('Space dispatches aim in target mode', () => {
    cell(3).focus();
    key(cell(3), ' ');
    expect(aims).toEqual([3]);
  });

  it('Enter in place mode never dispatches aim', () => {
    grid.mode = 'place';
    cell(3).focus();
    key(cell(3), 'Enter');
    expect(aims).toEqual([]);
  });

  it('own mode never dispatches aim', () => {
    grid.mode = 'own';
    cell(4).click();
    key(cell(4), 'Enter');
    expect(aims).toEqual([]);
  });

  it('place mode renders the fleet as ship cells', () => {
    grid.mode = 'place';
    grid.fleet = [
      { bow: 0, dir: 'h' },
      { bow: 20, dir: 'h' },
      { bow: 40, dir: 'v' },
      { bow: 41, dir: 'v' },
      { bow: 99, dir: 'v' },
    ];
    expect(cell(4).getAttribute('aria-label')).toBe('E1, ship');
    expect(cell(5).getAttribute('aria-label')).toBe('F1, water');
    expect(cell(60).getAttribute('aria-label')).toBe('A7, ship');
  });
});
