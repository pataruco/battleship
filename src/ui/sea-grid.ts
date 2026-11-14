import type { Cell, CellState, Ship } from '../game/types';
import { cellLabel } from '../game/types';

export type GridMode = 'target' | 'own' | 'place';

const WORDS: Record<CellState, string> = {
  unknown: 'water',
  miss: 'miss',
  hit: 'hit',
  sunk: 'sunk',
  ship: 'ship',
};
const GLYPH: Record<CellState, string> = {
  unknown: '',
  miss: '•',
  hit: '✕',
  sunk: '✕',
  ship: '',
};
const EMPTY: CellState[] = Array.from({ length: 100 }, () => 'unknown');

export function shipCells(ship: Ship, length: number): Cell[] {
  const step = ship.dir === 'h' ? 1 : 10;
  return Array.from({ length }, (_, i) => ship.bow + i * step);
}

/** `<sea-grid>`: a 10x10 board. Properties re-render; `aim` events carry `{cell}`. */
export class SeaGrid extends HTMLElement {
  #cells: CellState[] = EMPTY;
  #mode: GridMode = 'target';
  #disabled = false;
  #aim: Cell | null = null;
  #fleet: Ship[] | null = null;
  #focus = 0;
  #preview: { cells: Cell[]; valid: boolean } | null = null;
  #buttons: HTMLButtonElement[] = [];
  #built = false;

  get cells(): CellState[] {
    return this.#cells;
  }
  set cells(v: CellState[]) {
    this.#cells = v;
    this.#update();
  }
  get mode(): GridMode {
    return this.#mode;
  }
  set mode(v: GridMode) {
    this.#mode = v;
    this.#update();
  }
  get disabled(): boolean {
    return this.#disabled;
  }
  set disabled(v: boolean) {
    this.#disabled = v;
    this.#update();
  }
  get aim(): Cell | null {
    return this.#aim;
  }
  set aim(v: Cell | null) {
    this.#aim = v;
    this.#update();
  }
  get fleet(): Ship[] | null {
    return this.#fleet;
  }
  set fleet(v: Ship[] | null) {
    this.#fleet = v;
    this.#update();
  }

  /** Highlights would-be cells while dragging a ship (place mode). */
  setPreview(preview: { cells: Cell[]; valid: boolean } | null): void {
    this.#preview = preview;
    this.#update();
  }

  /** Cell index under a point, or null. */
  cellFromElement(el: Element | null): Cell | null {
    const btn = el?.closest<HTMLElement>('[data-cell]');
    if (!btn || !this.contains(btn)) return null;
    return Number(btn.dataset.cell);
  }

  connectedCallback(): void {
    if (!this.#built) this.#build();
    this.#update();
  }

  #build(): void {
    this.#built = true;
    const cols = document.createElement('div');
    cols.className = 'cols';
    cols.setAttribute('aria-hidden', 'true');
    cols.append(document.createElement('span'));
    for (let c = 0; c < 10; c++) {
      const s = document.createElement('span');
      s.textContent = String.fromCharCode(65 + c);
      cols.append(s);
    }
    const grid = document.createElement('div');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Sea');
    for (let r = 0; r < 10; r++) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      const head = document.createElement('span');
      head.setAttribute('role', 'rowheader');
      head.className = 'rowhead';
      head.textContent = String(r + 1);
      row.append(head);
      for (let c = 0; c < 10; c++) {
        const cell = r * 10 + c;
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'gridcell');
        b.dataset.cell = String(cell);
        b.className = 'cell';
        this.#buttons.push(b);
        row.append(b);
      }
      grid.append(row);
    }
    grid.addEventListener('keydown', (e) => this.#onKey(e));
    grid.addEventListener('click', (e) => {
      const cell = this.cellFromElement(e.target as Element);
      if (cell !== null) this.#press(cell);
    });
    this.replaceChildren(cols, grid);
  }

  #stateOf(cell: Cell): CellState {
    if (this.#mode === 'place') {
      const fleet = this.#fleet ?? [];
      const lens = [5, 4, 3, 3, 2];
      return fleet.some((s, i) => shipCells(s, lens[i] ?? 0).includes(cell))
        ? 'ship'
        : 'unknown';
    }
    return this.#cells[cell] ?? 'unknown';
  }

  #update(): void {
    if (!this.#built) return;
    const grid = this.querySelector('[role="grid"]');
    grid?.setAttribute('aria-disabled', String(this.#disabled));
    this.dataset.mode = this.#mode;
    this.#buttons.forEach((b, cell) => {
      const state = this.#stateOf(cell);
      const aimed = this.#aim === cell;
      const label = `${cellLabel(cell)}, ${WORDS[state]}${aimed ? ', aimed' : ''}`;
      b.setAttribute('aria-label', label);
      b.dataset.state = state;
      b.textContent = GLYPH[state];
      b.tabIndex = cell === this.#focus ? 0 : -1;
      b.classList.toggle('aimed', aimed);
      const inert =
        this.#mode === 'target' && state !== 'unknown' ? 'true' : null;
      if (inert) b.setAttribute('aria-disabled', inert);
      else b.removeAttribute('aria-disabled');
      const p = this.#preview?.cells.includes(cell) ?? false;
      b.classList.toggle('preview', p);
      b.classList.toggle('invalid', p && !this.#preview?.valid);
    });
  }

  #press(cell: Cell): void {
    this.#focus = cell;
    this.#update();
    if (this.#disabled || this.#mode !== 'target') return;
    if (this.#stateOf(cell) !== 'unknown') return;
    this.dispatchEvent(
      new CustomEvent('aim', { detail: { cell }, bubbles: true }),
    );
  }

  #onKey(e: KeyboardEvent): void {
    const cell = this.cellFromElement(e.target as Element);
    if (cell === null) return;
    const col = cell % 10;
    const row = Math.floor(cell / 10);
    let next: Cell | null = null;
    switch (e.key) {
      case 'ArrowRight':
        next = col < 9 ? cell + 1 : cell;
        break;
      case 'ArrowLeft':
        next = col > 0 ? cell - 1 : cell;
        break;
      case 'ArrowDown':
        next = row < 9 ? cell + 10 : cell;
        break;
      case 'ArrowUp':
        next = row > 0 ? cell - 10 : cell;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this.#mode === 'place') this.#buttons[cell]?.click();
        else this.#press(cell);
        return;
      default:
        return;
    }
    e.preventDefault();
    this.#focus = next;
    this.#update();
    this.#buttons[next]?.focus();
  }
}

if (!customElements.get('sea-grid')) customElements.define('sea-grid', SeaGrid);
