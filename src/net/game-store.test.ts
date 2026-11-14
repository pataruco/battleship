import type { KV } from '@nats-io/kv';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newSession } from '../crypto/link';
import { createSealer, type Sealer } from '../crypto/seal';
import type { Engine } from '../engine/engine';
import { loadEngineForTests } from '../engine/load-node';
import { compareDocs } from '../game/compare';
import { FLEET_A, FLEET_B, fleetCells } from '../game/fixtures';
import { createDoc, reduce } from '../game/reducer';
import type { Action, GameDoc } from '../game/types';
import { FakeKv } from './fake-kv';
import { GameStore, type KvLike } from './game-store';

// Compile-time: the real nats.js KV satisfies KvLike.
const _kvCompat: (kv: KV) => KvLike = (kv) => kv;
void _kvCompat;

const P0 = { playerId: 'p0', name: 'Mum', avatar: 'whale' };
const P1 = { playerId: 'p1', name: 'Kid', avatar: 'crab' };

let engine: Engine;
beforeAll(async () => {
  engine = await loadEngineForTests();
});

let id: string;
let key: string;
let sealer: Sealer;
let kv: FakeKv;
let store: GameStore;

beforeEach(async () => {
  const s = newSession();
  id = s.id;
  key = `g.${id}`;
  sealer = await createSealer(s.id, s.secret);
  kv = new FakeKv();
  store = new GameStore({ kv, sealer, id, engine });
});

function run(doc: GameDoc, ...actions: Action[]): GameDoc {
  return actions.reduce((d, a) => {
    const r = reduce(d, a, engine);
    if (!r.ok) throw new Error(r.error);
    return r.doc;
  }, doc);
}
const fresh = () => createDoc(id, P0, engine.version);
/** Battle, seat 0 to fire first. */
const battle = () =>
  run(
    fresh(),
    { type: 'join', profile: P1 },
    { type: 'place', seat: 0, fleet: FLEET_A },
    { type: 'place', seat: 1, fleet: FLEET_B },
    { type: 'ready', seat: 0, coin: 0 },
    { type: 'ready', seat: 1, coin: 0 },
  );
const misses = (fleet: typeof FLEET_A) => {
  const used = new Set(fleetCells(fleet));
  return Array.from({ length: 100 }, (_, i) => i).filter((c) => !used.has(c));
};
const [M0, M1] = misses(FLEET_B);
const fire = (seat: 0 | 1, cell: number): Action => ({ type: 'fire', seat, cell });

async function serverDoc(): Promise<GameDoc | null> {
  const e = await kv.get(key);
  return e && e.operation === 'PUT' ? sealer.openJson<GameDoc>('doc', e.value) : null;
}
async function put(doc: unknown): Promise<number> {
  const bytes = await sealer.sealJson('doc', doc);
  const e = await kv.get(key);
  return e ? kv.update(key, bytes, e.revision) : kv.create(key, bytes);
}

describe('GameStore.create / load', () => {
  it('create then load: ok, adopted, not written back', async () => {
    const doc = fresh();
    const rev = await store.create(doc);
    const writes = kv.writes;
    const r = await store.load({ doc, revision: rev });
    expect(r).toMatchObject({ kind: 'ok', doc, revision: rev, wroteBack: false });
    if (r.kind !== 'ok') throw new Error();
    expect(r.lastMoveAt).toBe((await kv.get(key))!.created.getTime());
    expect(kv.writes).toBe(writes);
  });

  it('create fails when the key exists', async () => {
    await store.create(fresh());
    await expect(store.create(fresh())).rejects.toThrow();
  });

  it('server newer than local: adopted', async () => {
    const old = battle();
    const rev1 = await store.create(old);
    const newer = run(old, fire(0, M0!));
    const rev2 = await put(newer);
    const r = await store.load({ doc: old, revision: rev1 });
    expect(r).toMatchObject({ kind: 'ok', doc: newer, revision: rev2, wroteBack: false });
  });

  it('load with no local copy adopts the server doc', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    expect(await store.load(null)).toMatchObject({ kind: 'ok', doc, revision: rev, wroteBack: false });
  });

  it('local newer than server: written back, server now holds it', async () => {
    const old = battle();
    const rev1 = await store.create(old);
    const local = run(old, fire(0, M0!), fire(1, M1!));
    const r = await store.load({ doc: local, revision: 999 });
    expect(r).toMatchObject({ kind: 'ok', doc: local, wroteBack: true, lastMoveAt: null });
    if (r.kind !== 'ok') throw new Error();
    expect(r.revision).toBeGreaterThan(rev1);
    expect(await serverDoc()).toEqual(local);
    expect((await kv.get(key))!.revision).toBe(r.revision);
  });

  it('key missing with local: created back', async () => {
    const local = battle();
    const r = await store.load({ doc: local, revision: 3 });
    expect(r).toMatchObject({ kind: 'ok', doc: local, wroteBack: true });
    expect(await serverDoc()).toEqual(local);
    expect(kv.log.map((w) => w.op)).toEqual(['create']);
  });

  for (const how of ['del', 'purge'] as const) {
    it(`${how.toUpperCase()} marker with local: written back`, async () => {
      const local = battle();
      await store.create(local);
      kv[how](key);
      const r = await store.load({ doc: local, revision: 1 });
      expect(r).toMatchObject({ kind: 'ok', doc: local, wroteBack: true });
      expect(await serverDoc()).toEqual(local);
    });
  }

  it('garbage value with local: written back', async () => {
    const local = battle();
    kv.setRaw(key, new Uint8Array([1, 2, 3, 4, 5]));
    const r = await store.load({ doc: local, revision: 1 });
    expect(r).toMatchObject({ kind: 'ok', doc: local, wroteBack: true });
    expect(await serverDoc()).toEqual(local);
  });

  it("another game's doc (sealed with its own key) with local: written back", async () => {
    const other = newSession();
    const otherSealer = await createSealer(other.id, other.secret);
    kv.setRaw(key, await otherSealer.sealJson('doc', createDoc(other.id, P0, engine.version)));
    const local = battle();
    const r = await store.load({ doc: local, revision: 1 });
    expect(r).toMatchObject({ kind: 'ok', doc: local, wroteBack: true });
    expect(await serverDoc()).toEqual(local);
  });

  it('a here payload replayed under the key: written back', async () => {
    kv.setRaw(key, await sealer.sealJson('here', battle()));
    const local = battle();
    expect(await store.load({ doc: local, revision: 1 })).toMatchObject({ kind: 'ok', wroteBack: true });
    expect(await serverDoc()).toEqual(local);
  });

  it('decryptable doc with the wrong id or a bad shape: written back', async () => {
    const local = battle();
    await put({ ...battle(), id: 'someone-else' });
    expect(await store.load({ doc: local, revision: 1 })).toMatchObject({ kind: 'ok', wroteBack: true });
    expect(await serverDoc()).toEqual(local);
    await put({ ...battle(), seq: 999, fleets: [null, null] });
    expect(await store.load({ doc: local, revision: 1 })).toMatchObject({ kind: 'ok', wroteBack: true });
    expect(await serverDoc()).toEqual(local);
  });

  it('nothing readable and no local: unavailable', async () => {
    expect(await store.load(null)).toEqual({ kind: 'unavailable' });
    kv.setRaw(key, new Uint8Array(40));
    expect(await store.load(null)).toEqual({ kind: 'unavailable' });
    kv.del(key);
    expect(await store.load(null)).toEqual({ kind: 'unavailable' });
    expect(kv.writes).toBe(0);
  });

  it('write-back conflict re-runs load once and adopts the racing newer doc', async () => {
    const old = battle();
    await store.create(old);
    const local = run(old, fire(0, M0!));
    const racing = run(local, fire(1, M1!));
    kv.beforeNextWrite(() => put(racing));
    const r = await store.load({ doc: local, revision: 1 });
    expect(r).toMatchObject({ kind: 'ok', doc: racing, wroteBack: false });
    expect(await serverDoc()).toEqual(racing);
  });
});

describe('version skew', () => {
  it('doc with v: 2 → update-needed, zero writes', async () => {
    const newer = { ...battle(), v: 2, shape: 'different' };
    await put(newer);
    const before = kv.writes;
    const r = await store.load({ doc: battle(), revision: 1 });
    expect(r).toEqual({ kind: 'update-needed', doc: newer });
    expect(kv.writes).toBe(before);
  });

  it('doc with a newer engine → update-needed, zero writes', async () => {
    const newer = { ...battle(), engine: engine.version + 1 };
    await put(newer);
    const before = kv.writes;
    expect(await store.load(null)).toMatchObject({ kind: 'update-needed' });
    expect(kv.writes).toBe(before);
  });

  it('knownDocVersion overrides DOC_VERSION', async () => {
    const s = new GameStore({ kv, sealer, id, engine, knownDocVersion: 0 });
    await store.create(battle());
    expect(await s.load(null)).toMatchObject({ kind: 'update-needed' });
  });

  it('apply never writes a newer doc', async () => {
    const newer = { ...battle(), engine: engine.version + 1 } as GameDoc;
    const rev = await put(newer);
    const before = kv.writes;
    expect(await store.apply(fire(0, M0!), { doc: newer, revision: rev })).toEqual({
      kind: 'failed',
      reason: 'update-needed',
    });
    expect(kv.writes).toBe(before);
  });

  it('apply that re-reads a newer doc after a conflict → update-needed', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    await put({ ...run(doc, fire(0, M0!)), v: 2 });
    const before = kv.writes;
    expect(await store.apply(fire(0, M0!), { doc, revision: rev })).toEqual({
      kind: 'failed',
      reason: 'update-needed',
    });
    expect(kv.writes).toBe(before);
  });
});

describe('GameStore.apply', () => {
  it('writes the reduced doc and returns the outcome', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    const r = await store.apply(fire(0, M0!), { doc, revision: rev });
    expect(r).toMatchObject({ kind: 'ok', outcome: { kind: 'miss' } });
    if (r.kind !== 'ok') throw new Error();
    expect(r.doc.seq).toBe(doc.seq + 1);
    expect(await serverDoc()).toEqual(r.doc);
    expect((await kv.get(key))!.revision).toBe(r.revision);
  });

  for (const kind of ['conflict10071', 'conflict10164'] as const) {
    it(`one ${kind} then success → ok`, async () => {
      const doc = battle();
      const rev = await store.create(doc);
      kv.failNextUpdate(kind);
      const r = await store.apply(fire(0, M0!), { doc, revision: rev });
      expect(r).toMatchObject({ kind: 'ok', outcome: { kind: 'miss' } });
      expect(await serverDoc()).toEqual(run(doc, fire(0, M0!)));
    });
  }

  it('5 conflicts in a row → failed: conflict', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    for (let i = 0; i < 5; i++) kv.failNextUpdate(i % 2 ? 'conflict10164' : 'conflict10071');
    expect(await store.apply(fire(0, M0!), { doc, revision: rev })).toEqual({
      kind: 'failed',
      reason: 'conflict',
    });
    expect(await serverDoc()).toEqual(doc);
  });

  it('4 conflicts then success → ok (5 attempts)', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    for (let i = 0; i < 4; i++) kv.failNextUpdate('conflict10071');
    expect(await store.apply(fire(0, M0!), { doc, revision: rev })).toMatchObject({ kind: 'ok' });
  });

  it('conflict where the re-read doc makes it not our turn → rejected: not_your_turn', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    const theirs = run(doc, fire(0, M0!));
    const rev2 = await put(theirs);
    const r = await store.apply(fire(0, M1!), { doc, revision: rev });
    expect(r).toEqual({ kind: 'rejected', error: 'not_your_turn', doc: theirs, revision: rev2 });
    expect(await serverDoc()).toEqual(theirs);
  });

  it('conflict where the server is older: our copy plus the action is written', async () => {
    const doc = battle();
    await store.create(doc);
    const local = run(doc, fire(0, M0!), fire(1, M1!));
    const r = await store.apply(fire(0, misses(FLEET_B)[2]!), { doc: local, revision: 999 });
    expect(r).toMatchObject({ kind: 'ok' });
    if (r.kind !== 'ok') throw new Error();
    expect(r.doc.shots[0]).toHaveLength(2);
    expect(await serverDoc()).toEqual(r.doc);
  });

  it('conflict where the key is gone: created back with the action', async () => {
    const doc = battle();
    await store.create(doc);
    kv.purge(key);
    const r = await store.apply(fire(0, M0!), { doc, revision: 1 });
    expect(r).toMatchObject({ kind: 'ok' });
    expect(await serverDoc()).toEqual(run(doc, fire(0, M0!)));
  });

  it('two devices fire at the same moment: exactly one write wins', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    const other = new GameStore({ kv, sealer, id, engine });
    const [a, b] = await Promise.all([
      store.apply(fire(0, M0!), { doc, revision: rev }),
      other.apply(fire(0, M1!), { doc, revision: rev }),
    ]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['ok', 'rejected']);
    const loser = a.kind === 'rejected' ? a : b;
    expect(loser).toMatchObject({ kind: 'rejected', error: 'not_your_turn' });
    const winner = a.kind === 'ok' ? a : b;
    if (winner.kind !== 'ok') throw new Error();
    expect(await serverDoc()).toEqual(winner.doc);
    expect(winner.doc.shots[0]).toHaveLength(1);
  });

  it('rejected without writing when the action is invalid on the current doc', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    const before = kv.writes;
    expect(await store.apply(fire(1, M0!), { doc, revision: rev })).toEqual({
      kind: 'rejected',
      error: 'not_your_turn',
      doc,
      revision: rev,
    });
    expect(kv.writes).toBe(before);
  });

  it('timeout after the write landed → ok with the server doc (R5)', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    kv.failNextUpdate('timeout-after-write');
    const r = await store.apply(fire(0, M0!), { doc, revision: rev });
    expect(r).toMatchObject({ kind: 'ok', outcome: { kind: 'miss' } });
    if (r.kind !== 'ok') throw new Error();
    const server = await serverDoc();
    expect(r.doc).toEqual(server);
    expect(compareDocs(r.doc, run(doc, fire(0, M0!)))).toBe(0);
    expect(r.revision).toBe((await kv.get(key))!.revision);
  });

  it('timeout before the write → failed: offline', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    kv.failNextUpdate('timeout-before-write');
    expect(await store.apply(fire(0, M0!), { doc, revision: rev })).toEqual({
      kind: 'failed',
      reason: 'offline',
    });
    expect(await serverDoc()).toEqual(doc);
  });

  it('timeout where a different doc with the same seq and rank landed → failed: offline', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    kv.failNextUpdate('timeout-before-write');
    kv.beforeNextGet(() => put(run(doc, fire(0, M1!))));
    expect(await store.apply(fire(0, M0!), { doc, revision: rev })).toEqual({
      kind: 'failed',
      reason: 'offline',
    });
  });

  it('other errors → failed: offline', async () => {
    const doc = battle();
    const rev = await store.create(doc);
    kv.failNextUpdate('closed');
    expect(await store.apply(fire(0, M0!), { doc, revision: rev })).toEqual({
      kind: 'failed',
      reason: 'offline',
    });
  });
});
