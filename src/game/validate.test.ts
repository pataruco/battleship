import { describe, expect, it } from 'vitest';
import { FLEET_A, FLEET_B } from './fixtures';
import { createDoc } from './reducer';
import type { GameDoc } from './types';
import { isGameDoc } from './validate';

const P0 = { playerId: 'p0', name: 'Mum', avatar: 'whale' };
const P1 = { playerId: 'p1', name: 'Kid', avatar: 'crab' };

const setup = (): GameDoc => createDoc('g1', P0, 1);
const battle = (): GameDoc => ({
  ...setup(),
  seq: 7,
  seats: [P0, P1],
  phase: 'battle',
  fleets: [FLEET_A, FLEET_B],
  ready: [true, true],
  shots: [[1, 2], [99]],
  turn: 1,
  firstTurn: 1,
  reactions: [{ emoji: '🎉', seq: 5 }, null],
});
/** Round-trip through JSON, as the store does, so the shape is what a peer would send. */
const json = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
const with_ = (patch: Record<string, unknown>) => json({ ...battle(), ...patch });

describe('isGameDoc', () => {
  it('accepts a fresh setup doc and a battle doc', () => {
    expect(isGameDoc(json(setup()))).toBe(true);
    expect(isGameDoc(json(battle()))).toBe(true);
    expect(isGameDoc(with_({ phase: 'over', winner: 0 }))).toBe(true);
  });

  it('rejects non-objects', () => {
    for (const x of [null, undefined, 1, 'doc', [], true]) expect(isGameDoc(x)).toBe(false);
  });

  it('rejects missing or mistyped top-level fields', () => {
    for (const key of Object.keys(battle())) {
      const doc = json(battle()) as Record<string, unknown>;
      delete doc[key];
      expect(isGameDoc(doc), `missing ${key}`).toBe(false);
    }
    expect(isGameDoc(with_({ v: 2 }))).toBe(false);
    expect(isGameDoc(with_({ id: 7 }))).toBe(false);
    expect(isGameDoc(with_({ seq: 1.5 }))).toBe(false);
    expect(isGameDoc(with_({ engine: '1' }))).toBe(false);
    expect(isGameDoc(with_({ round: 0 }))).toBe(false);
    expect(isGameDoc(with_({ score: [0] }))).toBe(false);
    expect(isGameDoc(with_({ ready: [true, 'yes'] }))).toBe(false);
    expect(isGameDoc(with_({ rematch: [false] }))).toBe(false);
  });

  it('checks seat indexes and the phase set', () => {
    expect(isGameDoc(with_({ turn: 2 }))).toBe(false);
    expect(isGameDoc(with_({ firstTurn: -1 }))).toBe(false);
    expect(isGameDoc(with_({ winner: 1 }))).toBe(true);
    expect(isGameDoc(with_({ winner: 2 }))).toBe(false);
    expect(isGameDoc(with_({ phase: 'paused' }))).toBe(false);
  });

  it('checks seats', () => {
    expect(isGameDoc(with_({ seats: [null, P1] }))).toBe(false);
    expect(isGameDoc(with_({ seats: [P0] }))).toBe(false);
    expect(isGameDoc(with_({ seats: [P0, { name: 'x' }] }))).toBe(false);
  });

  it('checks fleets: null or 5 ships with bows 0..99 and dir h|v', () => {
    const ok = (fleet: unknown) => isGameDoc(with_({ phase: 'setup', fleets: [fleet, null] }));
    expect(ok(null)).toBe(true);
    expect(ok(FLEET_A)).toBe(true);
    expect(ok(FLEET_A.slice(0, 4))).toBe(false);
    expect(ok([...FLEET_A.slice(0, 4), { bow: 100, dir: 'h' }])).toBe(false);
    expect(ok([...FLEET_A.slice(0, 4), { bow: 1.5, dir: 'h' }])).toBe(false);
    expect(ok([...FLEET_A.slice(0, 4), { bow: 3, dir: 'd' }])).toBe(false);
    expect(ok([...FLEET_A.slice(0, 4), null])).toBe(false);
  });

  it('checks shots are integer cells', () => {
    expect(isGameDoc(with_({ shots: [[0, 99], []] }))).toBe(true);
    expect(isGameDoc(with_({ shots: [[100], []] }))).toBe(false);
    expect(isGameDoc(with_({ shots: [['1'], []] }))).toBe(false);
    expect(isGameDoc(with_({ shots: [[]] }))).toBe(false);
  });

  it('checks reactions', () => {
    expect(isGameDoc(with_({ reactions: [null, { emoji: '💩', seq: 1 }] }))).toBe(false);
    expect(isGameDoc(with_({ reactions: [null, { emoji: '🔥' }] }))).toBe(false);
  });

  it('a battle doc needs both fleets and both seats', () => {
    expect(isGameDoc(with_({ fleets: [FLEET_A, null] }))).toBe(false);
    expect(isGameDoc(with_({ seats: [P0, null] }))).toBe(false);
    expect(isGameDoc(with_({ phase: 'setup', seats: [P0, null], fleets: [FLEET_A, null] }))).toBe(true);
  });
});
