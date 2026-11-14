import type { NatsConnection, Subscription } from '@nats-io/nats-core';
import type { Sealer } from '../crypto/seal';
import type { SeatIndex } from '../game/types';

/** The two NatsConnection methods presence needs (the in-memory fake bus fits too). */
export type BusLike = Pick<NatsConnection, 'publish' | 'subscribe'>;

export type PresenceMsg = { t: 'hb' | 'reply' | 'bye' | 'moved'; seat: SeatIndex; playerId: string; seq: number };

export const HEARTBEAT_MS = 15_000;
export const AWAY_MS = 45_000;
const CHECK_MS = 1_000;
const KINDS = new Set(['hb', 'reply', 'bye', 'moved']);

type IntervalFns = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: never) => void;
};

function isPresenceMsg(x: unknown): x is PresenceMsg {
  const m = x as Partial<PresenceMsg> | null;
  return (
    typeof m === 'object' &&
    m !== null &&
    typeof m.t === 'string' &&
    KINDS.has(m.t) &&
    (m.seat === 0 || m.seat === 1) &&
    typeof m.playerId === 'string' &&
    Number.isSafeInteger(m.seq)
  );
}

/**
 * Sealed heartbeats and "moved" notes on `bship.<id>.here` (spec §7 Presence, R1, R11).
 * Events: `opponent` ({ here }) when the other seat appears or goes away, and `seq` ({ seq })
 * when any message carries a seq higher than ours, meaning the doc moved on: `kv.get` it.
 */
export class Presence extends EventTarget {
  private readonly nc: BusLike;
  private readonly sealer: Sealer;
  private readonly subject: string;
  private readonly me: { seat: SeatIndex; playerId: string };
  private readonly getSeq: () => number;
  private readonly now: () => number;
  private readonly timers: IntervalFns;
  private sub: Subscription | null = null;
  private beat: unknown = null;
  private check: unknown = null;
  /** When the opponent was last heard from; null while they are away. */
  private lastSeen: number | null = null;

  constructor(o: {
    nc: BusLike;
    sealer: Sealer;
    id: string;
    me: { seat: SeatIndex; playerId: string };
    getSeq: () => number;
    now?: () => number;
    setInterval?: IntervalFns['setInterval'];
    clearInterval?: IntervalFns['clearInterval'];
  }) {
    super();
    this.nc = o.nc;
    this.sealer = o.sealer;
    this.subject = `bship.${o.id}.here`;
    this.me = o.me;
    this.getSeq = o.getSeq;
    this.now = o.now ?? Date.now;
    this.timers = {
      setInterval: o.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms)),
      clearInterval: o.clearInterval ?? ((h) => globalThis.clearInterval(h)),
    };
  }

  /** Subscribes, sends the first heartbeat and keeps beating every 15 s until `stop`. */
  async start(): Promise<void> {
    if (this.sub) return;
    const sub = this.nc.subscribe(this.subject);
    this.sub = sub;
    void this.listen(sub);
    this.beat = this.timers.setInterval(() => void this.send('hb'), HEARTBEAT_MS);
    this.check = this.timers.setInterval(() => this.checkAway(), CHECK_MS);
    await this.send('hb');
  }

  /** Says `bye`, then stops beating and listening. Safe to call twice. */
  async stop(): Promise<void> {
    const sub = this.sub;
    if (!sub) return;
    this.sub = null;
    this.timers.clearInterval(this.beat as never);
    this.timers.clearInterval(this.check as never);
    sub.unsubscribe();
    this.lastSeen = null;
    await this.send('bye');
  }

  /** After an acknowledged write: tell the other device to `kv.get` (R1). */
  announceMoved(seq: number): Promise<void> {
    return this.send('moved', seq);
  }

  private async send(t: PresenceMsg['t'], seq = this.getSeq()): Promise<void> {
    const msg: PresenceMsg = { t, seat: this.me.seat, playerId: this.me.playerId, seq };
    const data = await this.sealer.sealJson('here', msg);
    try {
      this.nc.publish(this.subject, data);
    } catch {
      // Closed or draining connection: presence is best-effort.
    }
  }

  private async listen(sub: Subscription): Promise<void> {
    try {
      for await (const m of sub) {
        const msg = await this.sealer.openJson<unknown>('here', m.data);
        if (this.sub === sub && isPresenceMsg(msg)) this.receive(msg);
      }
    } catch {
      // Subscription closed with the connection; whoever reconnects starts a new Presence.
    }
  }

  private receive(msg: PresenceMsg): void {
    if (msg.seq > this.getSeq()) this.emit('seq', { seq: msg.seq });
    if (msg.seat === this.me.seat) return; // another tab of mine
    if (msg.t === 'bye') {
      if (this.lastSeen !== null) this.setAway();
      return;
    }
    const wasAway = this.lastSeen === null;
    this.lastSeen = this.now();
    if (!wasAway) return;
    this.emit('opponent', { here: true });
    // R11: a fresh heartbeat from someone who was away earns one reply; a reply is never answered.
    if (msg.t === 'hb') void this.send('reply');
  }

  private checkAway(): void {
    if (this.lastSeen !== null && this.now() - this.lastSeen >= AWAY_MS) this.setAway();
  }

  private setAway(): void {
    this.lastSeen = null;
    this.emit('opponent', { here: false });
  }

  private emit<T>(type: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(type, { detail }));
  }
}
