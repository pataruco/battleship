import { getEngine } from '../engine/engine';
import type { Cell, Ship } from '../game/types';
import { FLEET_LENGTHS } from '../game/types';
import type { SeaGrid } from './sea-grid';
import { shipCells } from './sea-grid';

type Drag = {
  index: number;
  grabOffset: number;
  startCell: Cell;
  moved: boolean;
  candidate: Ship | null;
};

/** `<ship-dock>`: rotate, drag and shuffle the fleet shown in a place-mode `<sea-grid>`. */
export class ShipDock extends HTMLElement {
  #grid: SeaGrid | null = null;
  #fleet: Ship[] | null = null;
  #drag: Drag | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #abort: AbortController | null = null;

  get fleet(): Ship[] | null {
    return this.#fleet;
  }
  set fleet(v: Ship[] | null) {
    this.#fleet = v;
    if (this.#grid) this.#grid.fleet = v;
  }

  get grid(): SeaGrid | null {
    return this.#grid;
  }
  set grid(g: SeaGrid | null) {
    this.#abort?.abort();
    this.#grid = g;
    if (!g) return;
    g.mode = 'place';
    g.fleet = this.#fleet;
    this.#abort = new AbortController();
    const opts = { signal: this.#abort.signal };
    g.addEventListener('pointerdown', (e) => this.#down(e as PointerEvent), opts);
    g.addEventListener('click', (e) => this.#click(e as MouseEvent), opts);
  }

  connectedCallback(): void {
    if (this.querySelector('button')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shuffle';
    btn.textContent = 'Shuffle';
    btn.addEventListener('click', () => this.shuffle());
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Tap a ship to turn it. Drag it to move it.';
    this.append(btn, hint);
  }

  disconnectedCallback(): void {
    clearTimeout(this.#timer);
  }

  shuffle(): void {
    const seed = crypto.getRandomValues(new Uint8Array(16));
    this.#commit(getEngine().randomFleet(seed));
  }

  #commit(fleet: Ship[]): void {
    this.fleet = fleet;
    this.dispatchEvent(
      new CustomEvent('place', { detail: { fleet }, bubbles: true }),
    );
  }

  #flagInvalid(): void {
    this.classList.add('invalid');
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.classList.remove('invalid'), 600);
  }

  #shipAt(cell: Cell): number {
    return (this.#fleet ?? []).findIndex((s, i) =>
      shipCells(s, FLEET_LENGTHS[i] ?? 0).includes(cell),
    );
  }

  #rotate(index: number): void {
    const fleet = this.#fleet;
    const ship = fleet?.[index];
    if (!fleet || !ship) return;
    const next = fleet.map((s, i) =>
      i === index ? { bow: s.bow, dir: s.dir === 'h' ? 'v' : 'h' } : s,
    ) as Ship[];
    if (getEngine().checkFleet(next) === null) this.#commit(next);
    else this.#flagInvalid();
  }

  /** Keyboard activation (click with detail 0); pointer taps rotate on pointerup. */
  #click(e: MouseEvent): void {
    if (e.detail !== 0 || !this.#grid) return;
    const cell = this.#grid.cellFromElement(e.target as Element);
    if (cell === null) return;
    const index = this.#shipAt(cell);
    if (index >= 0) this.#rotate(index);
  }

  #down(e: PointerEvent): void {
    const grid = this.#grid;
    if (!grid || e.button > 0) return;
    const cell = grid.cellFromElement(e.target as Element);
    if (cell === null) return;
    const index = this.#shipAt(cell);
    const ship = this.#fleet?.[index];
    if (!ship) return;
    const grabOffset = ship.dir === 'h' ? cell - ship.bow : (cell - ship.bow) / 10;
    this.#drag = { index, grabOffset, startCell: cell, moved: false, candidate: null };
    const move = (ev: PointerEvent) => this.#move(ev);
    const up = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      this.#up(ev.type === 'pointercancel');
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  #move(e: PointerEvent): void {
    const drag = this.#drag;
    const grid = this.#grid;
    if (!drag || !grid || !this.#fleet) return;
    const under = document.elementFromPoint?.(e.clientX, e.clientY) ?? null;
    const cell = grid.cellFromElement(under);
    if (cell === null) {
      drag.candidate = null;
      grid.setPreview(null);
      return;
    }
    if (cell !== drag.startCell) drag.moved = true;
    if (!drag.moved) return;
    const old = this.#fleet[drag.index]!;
    const row = Math.floor(cell / 10) - (old.dir === 'v' ? drag.grabOffset : 0);
    const col = (cell % 10) - (old.dir === 'h' ? drag.grabOffset : 0);
    const len = FLEET_LENGTHS[drag.index]!;
    const inside = row >= 0 && col >= 0 && row <= 9 && col <= 9;
    const bow = row * 10 + col;
    const candidate: Ship = { bow, dir: old.dir };
    const next = this.#fleet.map((s, i) => (i === drag.index ? candidate : s));
    const valid = inside && getEngine().checkFleet(next) === null;
    drag.candidate = valid ? candidate : null;
    const cells = shipCells(candidate, len).filter(
      (c) => c >= 0 && c < 100 && (old.dir === 'v' || Math.floor(c / 10) === row),
    );
    grid.setPreview({ cells, valid });
  }

  #up(cancelled: boolean): void {
    const drag = this.#drag;
    this.#drag = null;
    this.#grid?.setPreview(null);
    if (!drag || cancelled) return;
    if (!drag.moved) {
      this.#rotate(drag.index);
      return;
    }
    if (drag.candidate && this.#fleet) {
      const next = this.#fleet.map((s, i) => (i === drag.index ? drag.candidate! : s));
      this.#commit(next);
    } else {
      this.#flagInvalid();
    }
  }
}

if (!customElements.get('ship-dock')) customElements.define('ship-dock', ShipDock);
