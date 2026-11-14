import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSession } from '../crypto/link';
import { createSealer, type Sealer } from '../crypto/seal';
import type { SeatIndex } from '../game/types';
import { FakeBus, type FakeBusClient } from './fake-bus';
import { Presence, type PresenceMsg } from './presence';

/** Manual clock for `now` / `setInterval`; `advance` runs due callbacks in time order. */
class FakeClock {
  t = 0;
  private nextId = 1;
  private timers = new Map<number, { fn: () => void; every: number; due: number }>();
  now = () => this.t;
  setInterval = (fn: () => void, every: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { fn, every, due: this.t + every });
    return id;
  };
  clearInterval = (id: number): void => {
    this.timers.delete(id);
  };
  async advance(ms: number): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      let next: { fn: () => void; every: number; due: number } | undefined;
      for (const timer of this.timers.values()) if (!next || timer.due < next.due) next = timer;
      if (!next || next.due > end) break;
      this.t = next.due;
      next.due += next.every;
      next.fn();
      await settle();
    }
    this.t = end;
    await settle();
  }
}

/** Let async sealing/unsealing (Web Crypto) and bus delivery finish. */
const settle = () => new Promise((r) => setTimeout(r, 15));

let id: string;
let sealer: Sealer;
let bus: FakeBus;
let clock: FakeClock;
let seqs: [number, number];
const running: Presence[] = [];

beforeEach(async () => {
  const s = newSession();
  id = s.id;
  sealer = await createSealer(s.id, s.secret);
  bus = new FakeBus();
  clock = new FakeClock();
  seqs = [1, 1];
});

afterEach(async () => {
  for (const p of running.splice(0)) await p.stop();
});

type Seen = { opponent: boolean[]; seq: number[] };

function make(seat: SeatIndex, nc: FakeBusClient = bus.client()): { p: Presence; seen: Seen; nc: FakeBusClient } {
  const p = new Presence({
    nc,
    sealer,
    id,
    me: { seat, playerId: `p${seat}` },
    getSeq: () => seqs[seat],
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  });
  const seen: Seen = { opponent: [], seq: [] };
  p.addEventListener('opponent', (e) => seen.opponent.push((e as CustomEvent<{ here: boolean }>).detail.here));
  p.addEventListener('seq', (e) => seen.seq.push((e as CustomEvent<{ seq: number }>).detail.seq));
  running.push(p);
  return { p, seen, nc };
}

const subject = () => `bship.${id}.here`;

async function sent(): Promise<(PresenceMsg & { from: FakeBusClient })[]> {
  const out: (PresenceMsg & { from: FakeBusClient })[] = [];
  for (const m of bus.log) {
    const msg = await sealer.openJson<PresenceMsg>('here', m.data);
    if (msg) out.push({ ...msg, from: m.from });
  }
  return out;
}

describe('Presence', () => {
  it('sends a sealed hb on start and every 15 s, carrying the current seq', async () => {
    const { p } = make(0);
    await p.start();
    await settle();
    seqs[0] = 4;
    await clock.advance(15_000);
    await clock.advance(15_000);
    const msgs = await sent();
    expect(bus.log.every((m) => m.subject === subject())).toBe(true);
    expect(msgs.map((m) => [m.t, m.seat, m.playerId, m.seq])).toEqual([
      ['hb', 0, 'p0', 1],
      ['hb', 0, 'p0', 4],
      ['hb', 0, 'p0', 4],
    ]);
  });

  it('first hb from the opponent → here, answered by exactly one reply; replies are never answered', async () => {
    const a = make(0);
    const b = make(1);
    await a.p.start();
    await settle();
    await b.p.start();
    await settle();
    expect(a.seen.opponent).toEqual([true]);
    expect(b.seen.opponent).toEqual([true]);
    expect((await sent()).map((m) => `${m.t}${m.seat}`)).toEqual(['hb0', 'hb1', 'reply0']);

    await clock.advance(30_000);
    const msgs = (await sent()).map((m) => `${m.t}${m.seat}`);
    expect(msgs.slice(3).sort()).toEqual(['hb0', 'hb0', 'hb1', 'hb1']);
    expect(msgs.filter((m) => m.startsWith('reply'))).toEqual(['reply0']);
    expect(a.seen.opponent).toEqual([true]);
    expect(b.seen.opponent).toEqual([true]);
  });

  it('opponent away after 45 s of silence, and a reply again when they come back', async () => {
    const a = make(0);
    const silent = bus.client();
    await a.p.start();
    await settle();
    const hb = async (t: PresenceMsg['t']) => {
      silent.publish(subject(), await sealer.sealJson('here', { t, seat: 1, playerId: 'p1', seq: 1 }));
      await settle();
    };
    await hb('hb');
    expect(a.seen.opponent).toEqual([true]);
    await clock.advance(44_000);
    expect(a.seen.opponent).toEqual([true]);
    await clock.advance(1_000);
    expect(a.seen.opponent).toEqual([true, false]);

    await hb('hb');
    expect(a.seen.opponent).toEqual([true, false, true]);
    expect((await sent()).filter((m) => m.t === 'reply')).toHaveLength(2);
  });

  it('bye → away immediately', async () => {
    const a = make(0);
    const b = make(1);
    await a.p.start();
    await b.p.start();
    await settle();
    expect(a.seen.opponent).toEqual([true]);
    await b.p.stop();
    await settle();
    expect(a.seen.opponent).toEqual([true, false]);
    expect((await sent()).at(-1)).toMatchObject({ t: 'bye', seat: 1, playerId: 'p1' });
  });

  it('moved with a higher seq fires seq; equal or lower does not', async () => {
    const a = make(0);
    const b = make(1);
    await a.p.start();
    await b.p.start();
    await settle();
    seqs[0] = 5;
    b.p.announceMoved(5);
    await settle();
    expect(a.seen.seq).toEqual([]);
    b.p.announceMoved(6);
    await settle();
    expect(a.seen.seq).toEqual([6]);
    expect((await sent()).at(-1)).toMatchObject({ t: 'moved', seat: 1, playerId: 'p1', seq: 6 });
  });

  it('a heartbeat with a higher seq also fires seq', async () => {
    const a = make(0);
    const b = make(1);
    await a.p.start();
    await settle();
    seqs[1] = 3;
    await b.p.start();
    await settle();
    expect(a.seen.seq).toEqual([3]);
  });

  it('ignores garbage, foreign-key and malformed messages', async () => {
    const a = make(0);
    const other = bus.client();
    await a.p.start();
    await settle();
    const foreign = await createSealer(id, newSession().secret);
    other.publish(subject(), new Uint8Array([1, 2, 3]));
    other.publish(subject(), 'not sealed');
    other.publish(subject(), await foreign.sealJson('here', { t: 'hb', seat: 1, playerId: 'x', seq: 99 }));
    other.publish(subject(), await sealer.sealJson('doc', { t: 'hb', seat: 1, playerId: 'x', seq: 99 }));
    other.publish(subject(), await sealer.sealJson('here', { t: 'hb', seat: 7, playerId: 'x', seq: 99 }));
    other.publish(subject(), await sealer.sealJson('here', { t: 'nope', seat: 1, playerId: 'x', seq: 99 }));
    other.publish(subject(), await sealer.sealJson('here', ['hb']));
    await settle();
    expect(a.seen).toEqual({ opponent: [], seq: [] });
    expect((await sent()).filter((m) => m.t === 'reply')).toHaveLength(0);
  });

  it('another tab of my own seat is not the opponent, but its seq still counts', async () => {
    const a = make(0);
    const tab = make(0);
    await a.p.start();
    await settle();
    seqs[0] = 2;
    tab.p.announceMoved(9);
    await settle();
    expect(a.seen).toEqual({ opponent: [], seq: [9] });
  });

  it('stop publishes bye, ends the heartbeat and the subscription', async () => {
    const a = make(0);
    const b = make(1);
    await a.p.start();
    await b.p.start();
    await settle();
    await a.p.stop();
    const before = bus.log.length;
    await clock.advance(60_000);
    const after = (await sent()).slice(before);
    expect(after.every((m) => m.seat === 1)).toBe(true);
    // a no longer listens: b's heartbeats don't reach it
    expect(a.seen.opponent).toEqual([true]);
  });
});
