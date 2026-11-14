import type { Cell, CellState, FleetError, Outcome, Ship } from '../game/types';
import wasmUrl from './engine.wasm?url';

interface EngineExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  engine_version(): number;
  fleet_check(fleet: number): number;
  fleet_random(seed: number, out: number): number;
  shot_outcome(fleet: number, shots: number, n: number): number;
  board_cells(
    fleet: number,
    shots: number,
    n: number,
    reveal: number,
    out: number,
  ): void;
  qr_encode(text: number, len: number, out: number, cap: number): number;
}

export interface Engine {
  readonly version: number;
  /** Fresh view of WASM memory. Never cache: memory growth detaches old views. */
  bytes(): Uint8Array;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  checkFleet(fleet: Ship[]): FleetError | null;
  randomFleet(seed: Uint8Array): Ship[];
  /** Outcome of the last shot. Throws RangeError('repeat' | 'out_of_range' | 'invalid'). */
  shotOutcome(fleet: Ship[], shots: Cell[]): Outcome;
  boardCells(fleet: Ship[], shots: Cell[], reveal: boolean): CellState[];
  qrEncode(text: string): { size: number; modules: Uint8Array };
}

const FLEET_ERRORS: Record<number, FleetError | undefined> = {
  1: 'out_of_bounds',
  2: 'overlap',
  3: 'wrong_ships',
};
const CELL_STATES: readonly CellState[] = [
  'unknown',
  'miss',
  'hit',
  'sunk',
  'ship',
];
const QR_CAP = 177 * 177;

function encodeFleet(fleet: Ship[]): Uint8Array {
  if (fleet.length !== 5) throw new RangeError('invalid');
  const out = new Uint8Array(10);
  fleet.forEach((ship, i) => {
    // 255 is never a valid cell: Rust rejects it, instead of Uint8Array wrapping 300 to 44.
    out[i * 2] =
      Number.isInteger(ship.bow) && ship.bow >= 0 && ship.bow <= 99
        ? ship.bow
        : 255;
    out[i * 2 + 1] = ship.dir === 'h' ? 0 : ship.dir === 'v' ? 1 : 2;
  });
  return out;
}

function decodeFleet(bytes: Uint8Array): Ship[] {
  return Array.from({ length: 5 }, (_, i) => ({
    bow: bytes[i * 2] as number,
    dir: bytes[i * 2 + 1] === 1 ? 'v' : 'h',
  }));
}

function checkShots(shots: Cell[]): Uint8Array {
  for (const cell of shots) {
    if (!Number.isInteger(cell) || cell < 0 || cell > 99)
      throw new RangeError('out_of_range');
  }
  return Uint8Array.from(shots);
}

function wrap(x: EngineExports): Engine {
  const bytes = () => new Uint8Array(x.memory.buffer);

  /** Copy `data` into WASM memory, run `fn` with its pointer, always free. */
  function withBuf<T>(data: Uint8Array, fn: (ptr: number) => T): T {
    const len = Math.max(data.length, 1);
    const ptr = x.alloc(len);
    try {
      bytes().set(data, ptr);
      return fn(ptr);
    } finally {
      x.dealloc(ptr, len);
    }
  }

  /** Run `fn` with a zeroed output buffer; returns a copy of it. */
  function withOut<T>(len: number, fn: (ptr: number) => T): [T, Uint8Array] {
    const ptr = x.alloc(len);
    try {
      const result = fn(ptr);
      return [result, bytes().slice(ptr, ptr + len)];
    } finally {
      x.dealloc(ptr, len);
    }
  }

  function checkFleet(fleet: Ship[]): FleetError | null {
    if (fleet.length !== 5) return 'wrong_ships';
    return (
      FLEET_ERRORS[withBuf(encodeFleet(fleet), (p) => x.fleet_check(p))] ?? null
    );
  }

  return {
    version: x.engine_version(),
    bytes,
    alloc: (len) => x.alloc(len),
    dealloc: (ptr, len) => x.dealloc(ptr, len),

    checkFleet,

    randomFleet(seed) {
      if (seed.length !== 16) throw new RangeError('invalid');
      const [, out] = withBuf(seed, (sp) =>
        withOut(10, (op) => x.fleet_random(sp, op)),
      );
      return decodeFleet(out);
    },

    shotOutcome(fleet, shots) {
      if (shots.length === 0) throw new RangeError('invalid');
      const shotBytes = checkShots(shots);
      const r = withBuf(encodeFleet(fleet), (fp) =>
        withBuf(shotBytes, (sp) => x.shot_outcome(fp, sp, shotBytes.length)),
      );
      if (r === -1) throw new RangeError('repeat');
      if (r === -2) throw new RangeError('out_of_range');
      if (r < 0) throw new RangeError('invalid');
      if (r === 0) return { kind: 'miss' };
      if (r === 1) return { kind: 'hit' };
      if (r >= 10) return { kind: 'win', ship: r - 10 };
      return { kind: 'sunk', ship: r - 2 };
    },

    boardCells(fleet, shots, reveal) {
      if (checkFleet(fleet) !== null) throw new RangeError('invalid');
      const shotBytes = checkShots(shots);
      const [, out] = withBuf(encodeFleet(fleet), (fp) =>
        withBuf(shotBytes, (sp) =>
          withOut(100, (op) =>
            x.board_cells(fp, sp, shotBytes.length, reveal ? 1 : 0, op),
          ),
        ),
      );
      return Array.from(out, (v) => CELL_STATES[v] ?? 'unknown');
    },

    qrEncode(text) {
      const data = new TextEncoder().encode(text);
      const [size, out] = withBuf(data, (tp) =>
        withOut(QR_CAP, (op) => x.qr_encode(tp, data.length, op, QR_CAP)),
      );
      if (size < 0) throw new Error('qr_unencodable');
      return { size, modules: out.slice(0, size * size) };
    },
  };
}

export async function loadEngine(source?: BufferSource): Promise<Engine> {
  let instance: WebAssembly.Instance;
  if (source) {
    ({ instance } = await WebAssembly.instantiate(source, {}));
  } else {
    const response = await fetch(wasmUrl);
    try {
      ({ instance } = await WebAssembly.instantiateStreaming(
        response.clone(),
        {},
      ));
    } catch {
      // Wrong MIME type or no streaming support: fall back to buffered compile.
      ({ instance } = await WebAssembly.instantiate(
        await response.arrayBuffer(),
        {},
      ));
    }
  }
  return wrap(instance.exports as unknown as EngineExports);
}

let current: Engine | undefined;

export function setEngine(engine: Engine): void {
  current = engine;
}

export function getEngine(): Engine {
  if (!current) throw new Error('engine not loaded');
  return current;
}
