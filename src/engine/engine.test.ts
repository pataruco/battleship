import { beforeAll, describe, expect, it } from 'vitest';
import type { Ship } from '../game/types';
import type { Engine } from './engine';
import { loadEngineForTests } from './load-node';

const h = (bow: number): Ship => ({ bow, dir: 'h' });
// ship lengths 5,4,3,3,2 at rows 0..4, col 0: cells 0-4, 10-13, 20-22, 30-32, 40-41
const FLEET: Ship[] = [h(0), h(10), h(20), h(30), h(40)];
const URL_TEXT =
  'https://pataruco.github.io/battleship/#/g/0b9e4a52-6c1e-4d7a-9f3b-2a4c5d6e7f80/AbCdEfGhIjKlMnOpQrStUv';

let engine: Engine;
beforeAll(async () => {
  engine = await loadEngineForTests();
});

function seed(i: number): Uint8Array {
  const s = new Uint8Array(16);
  new DataView(s.buffer).setUint32(0, i, true);
  return s;
}

describe('engine', () => {
  it('reports rules version 1', () => {
    expect(engine.version).toBe(1);
  });

  it('keeps data readable through a fresh view after memory growth', () => {
    const ptr = engine.alloc(8);
    engine.bytes().set([1, 2, 3, 4, 5, 6, 7, 8], ptr);
    const before = engine.bytes().buffer.byteLength;
    const big = engine.alloc(8 * 1024 * 1024);
    expect(engine.bytes().buffer.byteLength).toBeGreaterThan(before);
    expect(Array.from(engine.bytes().slice(ptr, ptr + 8))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    engine.dealloc(big, 8 * 1024 * 1024);
    engine.dealloc(ptr, 8);
  });

  describe('checkFleet', () => {
    it('accepts a valid fleet and touching ships', () => {
      expect(engine.checkFleet(FLEET)).toBeNull();
      expect(engine.checkFleet([h(0), h(5), h(10), h(15), h(20)])).toBeNull();
    });
    it('flags out of bounds, including row wrap and vertical overflow', () => {
      expect(engine.checkFleet([h(8), ...FLEET.slice(1)])).toBe(
        'out_of_bounds',
      );
      expect(
        engine.checkFleet([{ bow: 95, dir: 'v' }, ...FLEET.slice(1)]),
      ).toBe('out_of_bounds');
    });
    it('flags overlap', () => {
      expect(engine.checkFleet([FLEET[0]!, h(4), ...FLEET.slice(2)])).toBe(
        'overlap',
      );
    });
    it('flags wrong ships', () => {
      expect(engine.checkFleet([h(100), ...FLEET.slice(1)])).toBe(
        'wrong_ships',
      );
      expect(
        engine.checkFleet([{ bow: 0, dir: 'x' as 'h' }, ...FLEET.slice(1)]),
      ).toBe('wrong_ships');
      expect(engine.checkFleet(FLEET.slice(1))).toBe('wrong_ships');
    });
  });

  describe('randomFleet', () => {
    it('is stable per seed and always valid', () => {
      for (let i = 0; i < 200; i++) {
        const a = engine.randomFleet(seed(i));
        expect(engine.checkFleet(a)).toBeNull();
        expect(engine.randomFleet(seed(i))).toEqual(a);
      }
      expect(engine.randomFleet(seed(1))).not.toEqual(
        engine.randomFleet(seed(2)),
      );
    });
  });

  describe('shotOutcome', () => {
    it('reports miss, hit and sunk', () => {
      expect(engine.shotOutcome(FLEET, [99])).toEqual({ kind: 'miss' });
      expect(engine.shotOutcome(FLEET, [0])).toEqual({ kind: 'hit' });
      expect(engine.shotOutcome(FLEET, [99, 0])).toEqual({ kind: 'hit' });
      expect(engine.shotOutcome(FLEET, [40, 41])).toEqual({
        kind: 'sunk',
        ship: 4,
      });
    });
    it('reports a win on the last cell', () => {
      const shots = [
        0, 1, 2, 3, 4, 10, 11, 12, 13, 20, 21, 22, 30, 31, 32, 40, 41,
      ];
      expect(engine.shotOutcome(FLEET, shots)).toEqual({
        kind: 'win',
        ship: 4,
      });
    });
    it('throws RangeError for bad input', () => {
      expect(() => engine.shotOutcome(FLEET, [5, 5])).toThrow(
        new RangeError('repeat'),
      );
      expect(() => engine.shotOutcome(FLEET, [100])).toThrow(
        new RangeError('out_of_range'),
      );
      expect(() => engine.shotOutcome(FLEET, [-1])).toThrow(
        new RangeError('out_of_range'),
      );
      expect(() => engine.shotOutcome(FLEET, [300])).toThrow(
        new RangeError('out_of_range'),
      );
      expect(() => engine.shotOutcome(FLEET, [])).toThrow(
        new RangeError('invalid'),
      );
      expect(() =>
        engine.shotOutcome([h(100), ...FLEET.slice(1)], [0]),
      ).toThrow(new RangeError('invalid'));
    });
  });

  describe('malformed fleets', () => {
    const bow300 = [h(300), ...FLEET.slice(1)];
    const four = FLEET.slice(1);
    it('reports wrong_ships for bow 300 and for 4 ships', () => {
      expect(engine.checkFleet(bow300)).toBe('wrong_ships');
      expect(engine.checkFleet(four)).toBe('wrong_ships');
      expect(engine.checkFleet([h(-1), ...FLEET.slice(1)])).toBe('wrong_ships');
      expect(engine.checkFleet([h(1.5), ...FLEET.slice(1)])).toBe(
        'wrong_ships',
      );
    });
    it('throws invalid from shotOutcome and boardCells', () => {
      for (const f of [bow300, four]) {
        expect(() => engine.shotOutcome(f, [0])).toThrow(
          new RangeError('invalid'),
        );
        expect(() => engine.boardCells(f, [0], true)).toThrow(
          new RangeError('invalid'),
        );
      }
    });
  });

  describe('boardCells', () => {
    const shots = [99, 0, 40, 41];
    it('hides intact ships', () => {
      const cells = engine.boardCells(FLEET, shots, false);
      expect(cells).toHaveLength(100);
      expect(cells[99]).toBe('miss');
      expect(cells[0]).toBe('hit');
      expect(cells[40]).toBe('sunk');
      expect(cells[41]).toBe('sunk');
      expect(cells[1]).toBe('unknown');
      expect(cells[55]).toBe('unknown');
    });
    it('reveals intact ships', () => {
      const cells = engine.boardCells(FLEET, shots, true);
      expect(cells[1]).toBe('ship');
      expect(cells[55]).toBe('unknown');
      expect(cells[0]).toBe('hit');
    });
    it('does not leak: memory stays flat over 1000 calls', () => {
      engine.boardCells(FLEET, shots, true);
      const size = engine.bytes().buffer.byteLength;
      for (let i = 0; i < 1000; i++)
        engine.boardCells(FLEET, shots, i % 2 === 0);
      expect(engine.bytes().buffer.byteLength).toBe(size);
    });
  });

  describe('qrEncode', () => {
    it('encodes the game URL in at most 41 modules', () => {
      const { size, modules } = engine.qrEncode(URL_TEXT);
      expect(size).toBeLessThanOrEqual(41);
      expect(size).toBeGreaterThan(0);
      expect(modules).toHaveLength(size * size);
      expect(modules.some((m) => m === 1)).toBe(true);
    });
    it('throws for text that is too long', () => {
      expect(() => engine.qrEncode('x'.repeat(5000))).toThrow('qr_unencodable');
    });
  });
});
