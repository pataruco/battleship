import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Kvm } from '@nats-io/kv';
import type { NatsConnection } from '@nats-io/nats-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSession } from '../../src/crypto/link';
import { createSealer, type Sealer } from '../../src/crypto/seal';
import type { Engine } from '../../src/engine/engine';
import { loadEngineForTests } from '../../src/engine/load-node';
import { FLEET_A, FLEET_B, fleetCells } from '../../src/game/fixtures';
import { createDoc } from '../../src/game/reducer';
import type { Action, GameDoc, SeatIndex } from '../../src/game/types';
import type { NatsConfig } from '../../src/net/config';
import { GameStore, type ApplyResult, type Versioned } from '../../src/net/game-store';
import { Connection } from '../../src/net/nats';
import { Presence } from '../../src/net/presence';
import { adminConnection } from './helpers';

const cfg: NatsConfig = {
  url: 'ws://localhost:9222',
  auth: { kind: 'userpass', user: 'browser', pass: 'browser-dev' },
  bucket: 'bship_games',
};
const P0 = { playerId: 'p0', name: 'Mum', avatar: 'whale' };
const P1 = { playerId: 'p1', name: 'Kid', avatar: 'crab' };

/** One device: its connection, store, presence and the last doc the server acknowledged. */
type Device = {
  conn: Connection;
  store: GameStore;
  presence: Presence | null;
  local: Versioned | null;
  seqEvents: number[];
};

let engine: Engine;
let id: string;
let sealer: Sealer;
let devices: Device[];
let admin: NatsConnection | null;

beforeAll(async () => {
  engine = await loadEngineForTests();
});

beforeEach(async () => {
  const s = newSession();
  id = s.id;
  sealer = await createSealer(s.id, s.secret);
  devices = [];
  admin = null;
});

afterEach(async () => {
  for (const d of devices) {
    await d.presence?.stop();
    await d.conn.close();
  }
  await admin?.close();
});

async function device(): Promise<Device> {
  const conn = new Connection(cfg, { doc: null });
  await conn.start();
  const store = new GameStore({ kv: await conn.kv(), sealer, id, engine });
  const d: Device = { conn, store, presence: null, local: null, seqEvents: [] };
  devices.push(d);
  return d;
}

async function listen(d: Device, seat: SeatIndex): Promise<void> {
  const nc = await d.conn.whenOnline();
  const presence = new Presence({
    nc,
    sealer,
    id,
    me: { seat, playerId: seat === 0 ? P0.playerId : P1.playerId },
    getSeq: () => d.local?.doc.seq ?? 0,
  });
  presence.addEventListener('seq', (e) => d.seqEvents.push((e as CustomEvent<{ seq: number }>).detail.seq));
  d.presence = presence;
  await presence.start();
  await nc.flush();
}

async function load(d: Device): Promise<GameDoc> {
  const r = await d.store.load(d.local);
  if (r.kind !== 'ok') throw new Error(`load: ${r.kind}`);
  d.local = { doc: r.doc, revision: r.revision };
  return r.doc;
}

/** Apply, keep the acknowledged doc, and announce it (R1). */
async function act(d: Device, action: Action): Promise<ApplyResult> {
  const r = await d.store.apply(action, d.local!);
  if (r.kind === 'ok' || r.kind === 'rejected') d.local = { doc: r.doc, revision: r.revision };
  if (r.kind === 'ok') await d.presence?.announceMoved(r.doc.seq);
  return r;
}

async function okAct(d: Device, action: Action): Promise<GameDoc> {
  const r = await act(d, action);
  if (r.kind !== 'ok') throw new Error(`${action.type}: ${JSON.stringify(r)}`);
  return r.doc;
}

/** A created the game and B joined. */
async function seated(): Promise<[Device, Device]> {
  const a = await device();
  const b = await device();
  const doc = createDoc(id, P0, engine.version);
  a.local = { doc, revision: await a.store.create(doc) };
  await load(b);
  await okAct(b, { type: 'join', profile: P1 });
  return [a, b];
}

/** In battle with seat 1 (B) to fire first. */
async function battle(): Promise<[Device, Device]> {
  const [a, b] = await seated();
  await load(a);
  await okAct(a, { type: 'place', seat: 0, fleet: FLEET_A });
  await okAct(a, { type: 'ready', seat: 0, coin: 1 });
  await load(b);
  await okAct(b, { type: 'place', seat: 1, fleet: FLEET_B });
  const doc = await okAct(b, { type: 'ready', seat: 1, coin: 1 });
  expect(doc.phase).toBe('battle');
  expect(doc.turn).toBe(1);
  return [a, b];
}

/** A cell of A's board with no ship on it. */
const missOnA = (n: number) => Array.from({ length: 100 }, (_, i) => i).filter((c) => !fleetCells(FLEET_A).includes(c))[n]!;

async function adminKv() {
  admin = await adminConnection();
  return new Kvm(admin).open('bship_games');
}

describe('sync between two devices over local NATS', () => {
  it('A creates, B joins, and both see both seats filled', async () => {
    const [a, b] = await seated();
    for (const d of [a, b]) {
      const doc = await load(d);
      expect(doc.seats).toEqual([P0, P1]);
    }
  });

  it('simultaneous place + ready from both converge to battle with exactly one coin result', async () => {
    const [a, b] = await seated();
    await load(a);
    const play = async (d: Device, seat: SeatIndex, fleet: typeof FLEET_A, coin: SeatIndex) => {
      await okAct(d, { type: 'place', seat, fleet });
      await okAct(d, { type: 'ready', seat, coin });
    };
    await Promise.all([play(a, 0, FLEET_A, 0), play(b, 1, FLEET_B, 1)]);
    const [da, db] = [await load(a), await load(b)];
    expect(da).toEqual(db);
    expect(da.phase).toBe('battle');
    expect(da.ready).toEqual([true, true]);
    expect(da.fleets).toEqual([FLEET_A, FLEET_B]);
    expect([0, 1]).toContain(da.turn);
    expect(da.firstTurn).toBe(da.turn);
  });

  it('B fires: A gets a seq event within 2 s and load shows the shot', async () => {
    const [a, b] = await battle();
    await load(a);
    await listen(a, 0);
    await listen(b, 1);
    const cell = missOnA(0);
    const fired = await okAct(b, { type: 'fire', seat: 1, cell });
    await vi.waitFor(() => expect(a.seqEvents).toContain(fired.seq), { timeout: 2000, interval: 25 });
    expect((await load(a)).shots[1]).toEqual([cell]);
  });

  it(
    'both clients come back within 15 s of a server restart and a move still propagates',
    async () => {
      const [a, b] = await battle();
      await load(a);
      await listen(a, 0);
      await listen(b, 1);
      const sawOffline = [false, false];
      [a, b].forEach((d, i) =>
        d.conn.addEventListener('status', (e) => {
          if ((e as CustomEvent<string>).detail === 'offline') sawOffline[i] = true;
        }),
      );

      execFileSync('docker', ['compose', '-f', resolve('infra/nats/docker-compose.yml'), 'restart', 'nats'], {
        stdio: 'ignore',
      });

      await vi.waitFor(
        () => {
          expect(sawOffline).toEqual([true, true]);
          expect([a.conn.status, b.conn.status]).toEqual(['online', 'online']);
        },
        { timeout: 15_000, interval: 100 },
      );

      // JetStream may need a moment after the restart before KV requests succeed.
      await vi.waitFor(() => load(b), { timeout: 10_000, interval: 250 });
      const cell = missOnA(1);
      const fired = await okAct(b, { type: 'fire', seat: 1, cell });
      await vi.waitFor(() => expect(a.seqEvents).toContain(fired.seq), { timeout: 2000, interval: 25 });
      expect((await load(a)).shots[1]).toEqual([cell]);
    },
    60_000,
  );

  it('admin deletes the key → A writes its copy back on the next load', async () => {
    const [a, b] = await seated();
    const doc = await load(a);
    await (await adminKv()).delete(`g.${id}`);
    const r = await a.store.load(a.local);
    expect(r).toMatchObject({ kind: 'ok', wroteBack: true, doc });
    expect(await load(b)).toEqual(doc);
  });

  it('admin overwrites the key with garbage → A writes its copy back', async () => {
    const [a, b] = await seated();
    const doc = await load(a);
    await (await adminKv()).put(`g.${id}`, crypto.getRandomValues(new Uint8Array(64)));
    const r = await a.store.load(a.local);
    expect(r).toMatchObject({ kind: 'ok', wroteBack: true, doc });
    expect(await load(b)).toEqual(doc);
  });

  it('key absent and no local copy → unavailable', async () => {
    const a = await device();
    expect(await a.store.load(null)).toEqual({ kind: 'unavailable' });
  });
});
