import { beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../engine/engine';
import { loadEngineForTests } from '../engine/load-node';
import { FLEET_A, FLEET_B, fleetCells } from './fixtures';
import { createDoc, reduce, type ReduceResult } from './reducer';
import type { Action, GameDoc, Profile } from './types';

const P0: Profile = { playerId: 'p0', name: 'Mum', avatar: 'whale' };
const P1: Profile = { playerId: 'p1', name: 'Kid', avatar: 'crab' };

let engine: Engine;
beforeAll(async () => {
  engine = await loadEngineForTests();
});

function ok(r: ReduceResult): GameDoc {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.doc;
}
function run(doc: GameDoc, ...actions: Action[]): GameDoc {
  return actions.reduce((d, a) => ok(reduce(d, a, engine)), doc);
}
const err = (doc: GameDoc, a: Action) => {
  const r = reduce(doc, a, engine);
  return r.ok ? 'ok' : r.error;
};

const fresh = () => createDoc('g1', P0, engine.version);
const joined = () => run(fresh(), { type: 'join', profile: P1 });
const placed = () =>
  run(
    joined(),
    { type: 'place', seat: 0, fleet: FLEET_A },
    { type: 'place', seat: 1, fleet: FLEET_B },
  );
/** Battle, seat 1 to fire first (coin 1). */
const battle = () =>
  run(
    placed(),
    { type: 'ready', seat: 0, coin: 0 },
    { type: 'ready', seat: 1, coin: 1 },
  );
const missCell = (fleet: typeof FLEET_A) => {
  const used = new Set(fleetCells(fleet));
  return Array.from({ length: 100 }, (_, i) => i).filter((c) => !used.has(c));
};

describe('createDoc', () => {
  it('starts in setup, round 1', () => {
    const d = fresh();
    expect(d).toMatchObject({
      v: 1,
      id: 'g1',
      seq: 1,
      round: 1,
      score: [0, 0],
      phase: 'setup',
      turn: 0,
      firstTurn: 0,
      winner: null,
      seats: [P0, null],
      fleets: [null, null],
      ready: [false, false],
      shots: [[], []],
      rematch: [false, false],
      reactions: [null, null],
    });
  });
});

describe('join', () => {
  it('fills seat 1', () => {
    const d = joined();
    expect(d.seats[1]).toEqual(P1);
    expect(d.seq).toBe(2);
  });
  it('rejects a second join', () => {
    expect(err(joined(), { type: 'join', profile: P1 })).toBe('seat_taken');
  });
  it('rejects join outside setup', () => {
    expect(err(battle(), { type: 'join', profile: P1 })).toBe('wrong_phase');
  });
  it('does not mutate its input', () => {
    const d = fresh();
    const snapshot = structuredClone(d);
    reduce(d, { type: 'join', profile: P1 }, engine);
    expect(d).toEqual(snapshot);
  });
});

describe('place', () => {
  it('rejects in battle', () => {
    expect(err(battle(), { type: 'place', seat: 0, fleet: FLEET_A })).toBe(
      'wrong_phase',
    );
  });
  it('rejects an overlapping fleet', () => {
    const bad = [
      FLEET_A[0]!,
      { bow: 2, dir: 'h' as const },
      ...FLEET_A.slice(2),
    ];
    expect(err(joined(), { type: 'place', seat: 0, fleet: bad })).toBe(
      'bad_fleet',
    );
  });
  it('resets ready for that seat', () => {
    const d = run(placed(), { type: 'ready', seat: 0, coin: 0 });
    expect(d.ready[0]).toBe(true);
    expect(run(d, { type: 'place', seat: 0, fleet: FLEET_B }).ready).toEqual([
      false,
      false,
    ]);
  });
  it('rejects seat 1 while empty', () => {
    expect(err(fresh(), { type: 'place', seat: 1, fleet: FLEET_B })).toBe(
      'no_opponent',
    );
  });
});

describe('ready', () => {
  it('needs a fleet', () => {
    expect(err(joined(), { type: 'ready', seat: 0, coin: 0 })).toBe('no_fleet');
  });
  it('stays in setup while seat 1 is empty', () => {
    const d = run(
      fresh(),
      { type: 'place', seat: 0, fleet: FLEET_A },
      { type: 'ready', seat: 0, coin: 0 },
    );
    expect(d.phase).toBe('setup');
    expect(d.ready[0]).toBe(true);
  });
  it('rejects outside setup', () => {
    expect(err(battle(), { type: 'ready', seat: 0, coin: 0 })).toBe(
      'wrong_phase',
    );
  });
  it('starts battle with the coin in round 1', () => {
    const d = battle();
    expect(d).toMatchObject({ phase: 'battle', turn: 1, firstTurn: 1 });
  });
  it('stays in setup until both are ready', () => {
    expect(run(placed(), { type: 'ready', seat: 0, coin: 1 }).phase).toBe(
      'setup',
    );
  });
});

describe('fire', () => {
  it('rejects in setup', () => {
    expect(err(placed(), { type: 'fire', seat: 0, cell: 0 })).toBe(
      'wrong_phase',
    );
  });
  it('rejects out of turn', () => {
    expect(err(battle(), { type: 'fire', seat: 0, cell: 0 })).toBe(
      'not_your_turn',
    );
  });
  it('rejects bad cells', () => {
    expect(err(battle(), { type: 'fire', seat: 1, cell: 100 })).toBe(
      'bad_cell',
    );
    expect(err(battle(), { type: 'fire', seat: 1, cell: -1 })).toBe('bad_cell');
    expect(err(battle(), { type: 'fire', seat: 1, cell: 1.5 })).toBe(
      'bad_cell',
    );
  });
  it('rejects the same cell twice', () => {
    const d = run(
      battle(),
      { type: 'fire', seat: 1, cell: 99 },
      { type: 'fire', seat: 0, cell: 99 },
    );
    expect(err(d, { type: 'fire', seat: 1, cell: 99 })).toBe('already_fired');
  });
  it('a miss flips the turn', () => {
    const cell = missCell(FLEET_A)[0]!;
    const r = reduce(battle(), { type: 'fire', seat: 1, cell }, engine);
    expect(r).toMatchObject({ ok: true, outcome: { kind: 'miss' } });
    expect(ok(r).turn).toBe(0);
    expect(ok(r).shots[1]).toEqual([cell]);
  });
  it('a hit also flips the turn', () => {
    const r = reduce(
      battle(),
      { type: 'fire', seat: 1, cell: FLEET_A[0]!.bow },
      engine,
    );
    expect(r).toMatchObject({ ok: true, outcome: { kind: 'hit' } });
    expect(ok(r).turn).toBe(0);
  });
  it('sinking returns a sunk outcome', () => {
    const d = run(
      battle(),
      { type: 'fire', seat: 1, cell: FLEET_A[4]!.bow },
      { type: 'fire', seat: 0, cell: 99 },
    );
    const r = reduce(
      d,
      { type: 'fire', seat: 1, cell: FLEET_A[4]!.bow + 10 },
      engine,
    );
    expect(r).toMatchObject({ ok: true, outcome: { kind: 'sunk', ship: 4 } });
  });
  it('rejects fire in over', () => {
    const d = scriptedGame().doc;
    expect(err(d, { type: 'fire', seat: 0, cell: 0 })).toBe('wrong_phase');
  });
});

/** Seat 1 sinks all of FLEET_A; seat 0 wastes shots on misses. Returns the final doc and seqs. */
function scriptedGame() {
  let d = fresh();
  const seqs = [d.seq];
  const step = (a: Action) => {
    d = ok(reduce(d, a, engine));
    seqs.push(d.seq);
    return d;
  };
  step({ type: 'join', profile: P1 });
  step({ type: 'place', seat: 0, fleet: FLEET_A });
  step({ type: 'place', seat: 1, fleet: FLEET_B });
  step({ type: 'ready', seat: 0, coin: 1 });
  step({ type: 'ready', seat: 1, coin: 1 });
  const targets = fleetCells(FLEET_A);
  const wasted = missCell(FLEET_B);
  let last: ReduceResult | undefined;
  targets.forEach((cell, i) => {
    last = reduce(d, { type: 'fire', seat: 1, cell }, engine);
    d = ok(last);
    seqs.push(d.seq);
    if (i < targets.length - 1)
      step({ type: 'fire', seat: 0, cell: wasted[i]! });
  });
  return { doc: d, seqs, last: last as ReduceResult };
}

describe('winning', () => {
  it('ends the round with the winner and score', () => {
    const { doc, last } = scriptedGame();
    expect(last).toMatchObject({ ok: true, outcome: { kind: 'win' } });
    expect(doc).toMatchObject({ phase: 'over', winner: 1, score: [0, 1] });
  });
  it('plays a full game with strictly increasing seq', () => {
    const { seqs } = scriptedGame();
    for (let i = 1; i < seqs.length; i++)
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
  });
});

describe('react', () => {
  it('rejects unknown emoji', () => {
    expect(err(fresh(), { type: 'react', seat: 0, emoji: '💩' as never })).toBe(
      'bad_emoji',
    );
  });
  it('stores emoji with the new seq', () => {
    const d = run(joined(), { type: 'react', seat: 1, emoji: '🔥' });
    expect(d.reactions[1]).toEqual({ emoji: '🔥', seq: d.seq });
  });
  it('is allowed in any phase', () => {
    expect(err(battle(), { type: 'react', seat: 0, emoji: '🎉' })).toBe('ok');
  });
  it('rejects seat 1 while empty', () => {
    expect(err(fresh(), { type: 'react', seat: 1, emoji: '🎉' })).toBe(
      'no_opponent',
    );
  });
});

describe('rematch', () => {
  it('rejects outside over', () => {
    expect(err(battle(), { type: 'rematch', seat: 0 })).toBe('wrong_phase');
  });
  it('one rematch sets the flag only', () => {
    const d = run(scriptedGame().doc, { type: 'rematch', seat: 0 });
    expect(d).toMatchObject({
      phase: 'over',
      round: 1,
      rematch: [true, false],
    });
  });
  it('both agreeing starts round 2 in setup', () => {
    const over = scriptedGame().doc;
    const d = run(
      over,
      { type: 'rematch', seat: 0 },
      { type: 'rematch', seat: 1 },
    );
    expect(d).toMatchObject({
      round: 2,
      phase: 'setup',
      fleets: [null, null],
      ready: [false, false],
      shots: [[], []],
      rematch: [false, false],
      firstTurn: 0,
      winner: null,
      score: [0, 1],
    });
  });
  it('next ready uses firstTurn and ignores coin', () => {
    const over = scriptedGame().doc;
    const d = run(
      over,
      { type: 'rematch', seat: 0 },
      { type: 'rematch', seat: 1 },
      { type: 'place', seat: 0, fleet: FLEET_A },
      { type: 'place', seat: 1, fleet: FLEET_B },
      { type: 'ready', seat: 0, coin: 1 },
      { type: 'ready', seat: 1, coin: 1 },
    );
    expect(d).toMatchObject({ phase: 'battle', turn: 0, firstTurn: 0 });
  });
});

describe('engine version', () => {
  it('takes the max and bumps seq', () => {
    const d = ok(
      reduce({ ...fresh(), engine: 0 }, { type: 'join', profile: P1 }, engine),
    );
    expect(d.engine).toBe(engine.version);
    const newer = ok(
      reduce({ ...fresh(), engine: 99 }, { type: 'join', profile: P1 }, engine),
    );
    expect(newer.engine).toBe(99);
  });
});
