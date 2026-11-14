import { getEngine } from '../engine/engine';
import type { Cell, Ship } from '../game/types';
import { FLEET_LENGTHS } from '../game/types';
import type { SeaGrid } from './sea-grid';
import { shipCells } from './sea-grid';

/** What the keyboard move did, for the screen's aria-live region. */
export type DockAnnounce = {
  kind: 'picked' | 'moved' | 'dropped' | 'cancelled' | 'invalid' | 'turned';
  ship: number;
  cell?: Cell;
  valid?: boolean;
};

type Hold = { index: number; from: Cell; ship: Ship; valid: boolean };

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** Every cell of the ship stays on the board (no wrapping into the next row). */
function onBoard(ship: Ship, len: number): boolean {
  const row = Math.floor(ship.bow / 10);
  const col = ship.bow % 10;
  if (ship.bow < 0 || ship.bow > 99) return false;
  return ship.dir === 'h' ? col + len - 1 <= 9 : row + len - 1 <= 9;
}

type Drag = {
  index: number;
  grabOffset: number;
  startCell: Cell;
  moved: boolean;
  candidate: Ship | null;
};

/**
 * `<ship-dock>`: rotate, drag and shuffle the fleet shown in a place-mode `<sea-grid>`.
 * Keyboard: Enter/Space picks up the ship under focus, arrows move it, Enter/Space drops it,
 * Escape cancels, R turns it. `announce` events (`DockAnnounce`) describe each step.
 * Labels: `data-shuffle` and `data-hint` (defaults in English).
 */
export class ShipDock extends HTMLElement {
  #grid: SeaGrid | null = null;
  #fleet: Ship[] | null = null;
  #drag: Drag | null = null;
  #hold: Hold | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #abort: AbortController | null = null;

  get fleet(): Ship[] | null {
    return this.#fleet;
  }
  set fleet(v: Ship[] | null) {
    if (this.#hold) {
      this.#hold = null;
      this.#grid?.setPreview(null);
    }
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
    // Capture: runs before the grid's own arrow/Enter handling.
    g.addEventListener('keydown', (e) => this.#key(e as KeyboardEvent), { ...opts, capture: true });
  }

  connectedCallback(): void {
    if (this.querySelector('button')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shuffle';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🔀';
    btn.append(icon, ` ${this.dataset.shuffle ?? 'Shuffle'}`);
    btn.addEventListener('click', () => this.shuffle());
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = this.dataset.hint ?? 'Tap a ship to turn it. Drag it to move it.';
    this.append(btn, hint);
  }

  disconnectedCallback(): void {
    clearTimeout(this.#timer);
  }

  shuffle(): void {
    const seed = crypto.getRandomValues(new Uint8Array(16));
    this.#commit(getEngine().randomFleet(seed));
  }

  #say(detail: DockAnnounce): void {
    this.dispatchEvent(new CustomEvent<DockAnnounce>('announce', { detail, bubbles: true }));
  }

  #key(e: KeyboardEvent): void {
    const grid = this.#grid;
    const fleet = this.#fleet;
    if (!grid || !fleet) return;
    const cell = grid.cellFromElement(e.target as Element);
    if (cell === null) return;
    const handled = this.#hold ? this.#holdKey(e.key) : this.#freeKey(e.key, cell);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** No ship in hand: Enter/Space picks up, R turns. Returns whether the key was used. */
  #freeKey(key: string, cell: Cell): boolean {
    const index = this.#shipAt(cell);
    const ship = this.#fleet?.[index];
    if (!ship) return false;
    if (key === 'Enter' || key === ' ') {
      this.#hold = { index, from: cell, ship: { ...ship }, valid: true };
      this.#grid?.setPreview({ cells: shipCells(ship, FLEET_LENGTHS[index]!), valid: true });
      this.#say({ kind: 'picked', ship: index, cell: ship.bow });
      return true;
    }
    if (key === 'r' || key === 'R') {
      if (this.#rotate(index)) this.#say({ kind: 'turned', ship: index, cell: ship.bow });
      else this.#say({ kind: 'invalid', ship: index });
      return true;
    }
    return false;
  }

  /** A ship in hand: arrows and R move the preview, Enter/Space drops, Escape cancels. */
  #holdKey(key: string): boolean {
    const hold = this.#hold!;
    const grid = this.#grid!;
    const len = FLEET_LENGTHS[hold.index]!;
    let next: Ship | null = null;
    const arrow = ARROWS[key];
    if (arrow) {
      next = { bow: hold.ship.bow + arrow[0] * 10 + arrow[1], dir: hold.ship.dir };
      const col = hold.ship.bow % 10;
      if (col + arrow[1] < 0 || col + arrow[1] > 9) next = null;
    } else if (key === 'r' || key === 'R') {
      next = { bow: hold.ship.bow, dir: hold.ship.dir === 'h' ? 'v' : 'h' };
    } else if (key === 'Enter' || key === ' ') {
      if (!hold.valid) {
        this.#flagInvalid();
        this.#say({ kind: 'invalid', ship: hold.index });
        return true;
      }
      this.#hold = null;
      grid.setPreview(null);
      this.#commit(this.#fleet!.map((s, i) => (i === hold.index ? hold.ship : s)));
      this.#say({ kind: 'dropped', ship: hold.index, cell: hold.ship.bow });
      return true;
    } else if (key === 'Escape' || key === 'Tab') {
      // Tab leaves the grid: put the ship back, and let focus move on.
      this.#hold = null;
      grid.setPreview(null);
      if (key === 'Escape') grid.focusCell(hold.from);
      this.#say({ kind: 'cancelled', ship: hold.index });
      return key === 'Escape';
    } else {
      return false;
    }
    // Off the board: stay put (the key is still ours, so focus doesn't wander).
    if (!next || !onBoard(next, len)) return true;
    const candidate = next;
    const valid = getEngine().checkFleet(this.#fleet!.map((s, i) => (i === hold.index ? candidate : s))) === null;
    this.#hold = { ...hold, ship: candidate, valid };
    grid.setPreview({ cells: shipCells(candidate, len), valid });
    grid.focusCell(candidate.bow);
    this.#say({ kind: 'moved', ship: hold.index, cell: candidate.bow, valid });
    return true;
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

  /** Turns a ship in place when it fits. Returns whether it turned. */
  #rotate(index: number): boolean {
    const fleet = this.#fleet;
    const ship = fleet?.[index];
    if (!fleet || !ship) return false;
    const next = fleet.map((s, i) =>
      i === index ? { bow: s.bow, dir: s.dir === 'h' ? 'v' : 'h' } : s,
    ) as Ship[];
    if (getEngine().checkFleet(next) === null) {
      this.#commit(next);
      return true;
    }
    this.#flagInvalid();
    return false;
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

declare global {
  interface HTMLElementTagNameMap {
    'ship-dock': ShipDock;
  }
}
