import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSealer } from '../crypto/seal';
import type { Engine } from '../engine/engine';
import { loadEngineForTests } from '../engine/load-node';
import { FLEET_A, FLEET_B } from '../game/fixtures';
import type { GameDoc, Profile } from '../game/types';
import { FakeBus } from '../net/fake-bus';
import { FakeKv } from '../net/fake-kv';
import type { KvEntryLike, KvLike } from '../net/game-store';
import type { ConnStatus } from '../net/nats';
import type { BusLike } from '../net/presence';
import { closeDb } from '../storage/idb';
import { gamesRepo } from '../storage/games-repo';
import { createGame, GameController, type ConnLike } from './game-controller';

const HOST: Profile = { playerId: 'p0', name: 'Sam', avatar: 'whale' };
const GUEST: Profile = { playerId: 'p1', name: 'Kid', avatar: 'crab' };
const THIRD: Profile = { playerId: 'p2', name: 'Zed', avatar: 'seal' };

/** Let Web Crypto, IndexedDB and bus delivery finish. */
const settle = () => new Promise((r) => setTimeout(r, 30));

/** One device's view of the shared FakeKv, counting its own reads. */
class CountingKv implements KvLike {
  gets = 0;
  constructor(private readonly kv: FakeKv) {}
  get(key: string): Promise<KvEntryLike | null> {
    this.gets++;
    return this.kv.get(key);
  }
  create(key: string, value: Uint8Array): Promise<number> {
    return this.kv.create(key, value);
  }
  update(key: string, value: Uint8Array, revision: number): Promise<number> {
    return this.kv.update(key, value, revision);
  }
}

class FakeConn extends EventTarget implements ConnLike {
  status: ConnStatus = 'online';
  kvCalls = 0;
  readonly kvView: CountingKv;
  constructor(
    kv: FakeKv,
    private readonly bus: BusLike,
  ) {
    super();
    this.kvView = new CountingKv(kv);
  }
  kv(): Promise<KvLike> {
    this.kvCalls++;
    return Promise.resolve(this.kvView);
  }
  nc(): BusLike | null {
    return this.status === 'online' ? this.bus : null;
  }
}

let engine: Engine;
let kv: FakeKv;
let bus: FakeBus;
const open: GameController[] = [];
/** One IndexedDB per device. */
const devices = new Map<string, IDBFactory>();

beforeAll(async () => {
  engine = await loadEngineForTests();
});

beforeEach(() => {
  kv = new FakeKv();
  bus = new FakeBus();
  devices.clear();
});

afterEach(async () => {
  for (const c of open.splice(0)) c.dispose();
  await settle();
});

/** Switches gamesRepo to this device's own IndexedDB. */
async function onDevice(name: string): Promise<void> {
  await closeDb();
  let f = devices.get(name);
  if (!f) {
    f = new IDBFactory();
    devices.set(name, f);
  }
  globalThis.indexedDB = f;
}

const noTimers = { setInterval: () => 0, clearInterval: () => {} };

async function openAs(profile: Profile, id: string, secret: string, conn = new FakeConn(kv, bus.client())) {
  const c = await GameController.open({ id, secret, profile, engine, conn, doc: null, win: null, presenceTimers: noTimers });
  open.push(c);
  await c.refresh();
  await settle();
  return { c, conn };
}

async function hostGame() {
  await onDevice('host');
  const { id, secret } = await createGame({ kv, profile: HOST, engine });
  return { id, secret };
}

/** Host and guest both seated, fleets placed and ready; seat `coin` fires first. */
async function battle() {
  const { id, secret } = await hostGame();
  const host = await openAs(HOST, id, secret);
  await onDevice('guest');
  const guest = await openAs(GUEST, id, secret);
  expect((await guest.c.join()).kind).toBe('ok');
  await settle();
  await host.c.refresh();
  expect((await host.c.act({ type: 'place', seat: 0, fleet: FLEET_A })).kind).toBe('ok');
  await guest.c.refresh();
  expect((await guest.c.act({ type: 'place', seat: 1, fleet: FLEET_B })).kind).toBe('ok');
  await host.c.refresh();
  expect((await host.c.act({ type: 'ready', seat: 0, coin: 0 })).kind).toBe('ok');
  await guest.c.refresh();
  expect((await guest.c.act({ type: 'ready', seat: 1, coin: 0 })).kind).toBe('ok');
  await host.c.refresh();
  await settle();
  expect(host.c.state.doc?.phase).toBe('battle');
  expect(host.c.state.doc?.turn).toBe(0);
  return { id, secret, host, guest };
}

describe('GameController', () => {
  it('new game → doc created on the server, record stored with seat 0, no join needed', async () => {
    const { id, secret } = await hostGame();
    expect(kv.writes).toBe(1);
    const rec = await gamesRepo.get(id);
    expect(rec).toMatchObject({ id, secret, seat: 0, shared: false, revision: 1, seq: 1 });
    expect(rec?.doc?.seats).toEqual([HOST, null]);

    const { c } = await openAs(HOST, id, secret);
    expect(c.state).toMatchObject({ status: 'ready', seat: 0, needsJoin: false, needsWho: false, banner: null });
  });

  it('a second profile with seat 1 empty → needsJoin; join → seat 1 and a local record', async () => {
    const { id, secret } = await hostGame();
    await onDevice('guest');
    const { c } = await openAs(GUEST, id, secret);
    expect(c.state).toMatchObject({ status: 'ready', seat: null, needsJoin: true, needsWho: false });
    expect(await gamesRepo.get(id)).toBeNull();

    const r = await c.join();
    expect(r.kind).toBe('ok');
    expect(c.state).toMatchObject({ seat: 1, needsJoin: false, pending: false });
    expect(c.state.doc?.seats[1]).toEqual(GUEST);
    const rec = await gamesRepo.get(id);
    expect(rec).toMatchObject({ seat: 1, opponent: { name: 'Sam', avatar: 'whale' }, seq: 2 });
  });

  it("the host's invite sees the guest arrive through the moved note", async () => {
    const { id, secret } = await hostGame();
    const host = await openAs(HOST, id, secret);
    const moved: GameDoc[] = [];
    host.c.addEventListener('moved', (e) => moved.push((e as CustomEvent<{ next: GameDoc }>).detail.next));
    await onDevice('guest');
    const guest = await openAs(GUEST, id, secret);
    await guest.c.join();
    await settle();
    await settle();
    expect(host.c.state.doc?.seats[1]).toEqual(GUEST);
    expect(moved.at(-1)?.seq).toBe(2);
  });

  it('a third profile with both seats taken → needsWho; claiming is local only', async () => {
    const { id, secret } = await hostGame();
    await onDevice('guest');
    const guest = await openAs(GUEST, id, secret);
    await guest.c.join();
    await onDevice('third');
    const { c } = await openAs(THIRD, id, secret);
    expect(c.state).toMatchObject({ status: 'ready', seat: null, needsJoin: false, needsWho: true });

    const writes = kv.writes;
    await c.claimSeat(1);
    expect(c.state).toMatchObject({ seat: 1, needsWho: false });
    expect(kv.writes).toBe(writes);
    expect((await gamesRepo.get(id))?.seat).toBe(1);
    expect(c.state.doc?.seats[1]).toEqual(GUEST);
  });

  it('the host on another device can claim seat 0 instead of joining', async () => {
    const { id, secret } = await hostGame();
    await onDevice('laptop');
    const { c } = await openAs({ ...HOST, playerId: 'p0-laptop' }, id, secret);
    expect(c.state.needsJoin).toBe(true);
    await c.claimSeat(0);
    expect(c.state).toMatchObject({ seat: 0, needsJoin: false });
    expect(kv.writes).toBe(1);
  });

  it('act(fire) while pending → ignored: resolves failed, zero writes', async () => {
    const { host } = await battle();
    const writes = kv.writes;
    const first = host.c.act({ type: 'fire', seat: 0, cell: 55 });
    expect(host.c.state.pending).toBe(true);
    const second = await host.c.act({ type: 'fire', seat: 0, cell: 56 });
    expect(second.kind).toBe('failed');
    expect((await first).kind).toBe('ok');
    expect(kv.writes).toBe(writes + 1);
    expect(host.c.state.pending).toBe(false);
    expect(host.c.state.doc?.shots[0]).toEqual([55]);
  });

  it('a seq event triggers exactly one load', async () => {
    const { host, guest } = await battle();
    await settle();
    const before = host.conn.kvView.gets;
    expect((await guest.c.act({ type: 'react', seat: 1, emoji: '🎉' })).kind).toBe('ok');
    await settle();
    await settle();
    expect(host.conn.kvView.gets - before).toBe(1);
    expect(host.c.state.doc?.reactions[1]?.emoji).toBe('🎉');
  });

  it('update-needed doc → status update-needed; act returns failed update-needed with zero writes', async () => {
    const { id, secret } = await hostGame();
    const sealer = await createSealer(id, secret);
    const doc = (await gamesRepo.get(id))!.doc!;
    kv.setRaw(`g.${id}`, await sealer.sealJson('doc', { ...doc, v: 2, seq: 9, seats: 'opaque' }));
    const writes = kv.writes;
    const { c } = await openAs(HOST, id, secret);
    expect(c.state).toMatchObject({ status: 'update-needed', banner: 'update-needed' });
    expect(c.state.doc?.seats).toEqual([HOST, null]); // the opaque doc never replaces ours
    const r = await c.act({ type: 'place', seat: 0, fleet: FLEET_A });
    expect(r).toEqual({ kind: 'failed', reason: 'update-needed' });
    expect(kv.writes).toBe(writes);
  });

  it('no cache and no server doc → unavailable', async () => {
    await onDevice('stranger');
    const { c } = await openAs(GUEST, crypto.randomUUID(), 'AAAAAAAAAAAAAAAAAAAAAA');
    expect(c.state.status).toBe('unavailable');
    expect(kv.writes).toBe(0);
  });

  it('load throwing keeps the cached doc and shows the offline banner', async () => {
    const { id, secret } = await hostGame();
    let down = true;
    const failGet = () => {
      if (!down) return;
      kv.beforeNextGet(failGet);
      throw new Error('timeout');
    };
    kv.beforeNextGet(failGet);
    const { c } = await openAs(HOST, id, secret);
    expect(c.state).toMatchObject({ status: 'ready', seat: 0, banner: 'offline' });
    expect(c.state.doc?.seq).toBe(1);
    down = false;
    await c.refresh();
    expect(c.state.banner).toBeNull();
  });

  it('a retry rejected because our lost move already landed → adopt and save, no banner', async () => {
    const { id, host } = await battle();
    await onDevice('host');
    kv.failNextUpdate('timeout-after-write');
    kv.beforeNextGet(() => {
      throw new Error('still offline');
    });
    const lost = await host.c.act({ type: 'fire', seat: 0, cell: 55 });
    expect(lost).toEqual({ kind: 'failed', reason: 'offline' });
    expect(host.c.state.banner).toBe('retry');
    expect(host.c.state.doc?.shots[0]).toEqual([]);

    const retry = await host.c.act({ type: 'fire', seat: 0, cell: 55 });
    expect(retry.kind).toBe('rejected');
    expect(host.c.state.banner).toBeNull();
    expect(host.c.state.doc?.shots[0]).toEqual([55]);
    expect((await gamesRepo.get(id))?.doc?.shots[0]).toEqual([55]);
  });

  it('rejected because the opponent moved first → adopt with the rejected banner', async () => {
    const { id, secret, host } = await battle();
    await onDevice('host');
    // A second window of the host that hears no notes, so its copy goes stale.
    const deaf = await openAs(HOST, id, secret, new FakeConn(kv, new FakeBus().client()));
    expect(deaf.c.state).toMatchObject({ seat: 0, banner: null });
    expect((await host.c.act({ type: 'fire', seat: 0, cell: 99 })).kind).toBe('ok'); // miss → their turn
    const stale = deaf.c.state.doc!;
    expect(stale.turn).toBe(0);

    const r = await deaf.c.act({ type: 'fire', seat: 0, cell: 3 });
    expect(r).toMatchObject({ kind: 'rejected', error: 'not_your_turn' });
    expect(deaf.c.state.banner).toBe('rejected');
    expect(deaf.c.state.doc).toEqual(host.c.state.doc);
  });

  it('resume rebuilds the store from a fresh kv() and refreshes', async () => {
    const { id, secret } = await hostGame();
    const { c, conn } = await openAs(HOST, id, secret);
    const kvCalls = conn.kvCalls;
    const gets = conn.kvView.gets;
    conn.dispatchEvent(new Event('resume'));
    await settle();
    expect(conn.kvCalls).toBe(kvCalls + 1);
    expect(conn.kvView.gets).toBe(gets + 1);
    expect(c.state.status).toBe('ready');
  });

  it('connection status maps to banners and comes back with a refresh', async () => {
    const { id, secret } = await hostGame();
    const { c, conn } = await openAs(HOST, id, secret);
    const status = (s: ConnStatus) => {
      conn.status = s;
      conn.dispatchEvent(new CustomEvent('status', { detail: s }));
    };
    status('busy');
    expect(c.state.banner).toBe('busy');
    status('offline');
    expect(c.state.banner).toBe('offline');
    expect((await c.act({ type: 'place', seat: 0, fleet: FLEET_A })).kind).toBe('failed');
    const gets = conn.kvView.gets;
    status('online');
    await settle();
    expect(c.state.banner).toBeNull();
    expect(conn.kvView.gets).toBe(gets + 1);
  });
});
