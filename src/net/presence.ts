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
  /** The `bye` sealed ahead of time for `leave`. */
  private bye: { seq: number; data: Uint8Array } | null = null;

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
    this.beat = this.timers.setInterval(() => {
      void this.send('hb');
      void this.prepareBye();
    }, HEARTBEAT_MS);
    this.check = this.timers.setInterval(() => this.checkAway(), CHECK_MS);
    await Promise.all([this.send('hb'), this.prepareBye()]);
  }

  /** Says `bye`, then stops beating and listening. Safe to call twice. */
  async stop(): Promise<void> {
    if (!this.halt()) return;
    await this.send('bye');
  }

  /**
   * For `pagehide`: stops and publishes the bye sealed ahead of time, synchronously, because
   * the page may be frozen before any await resumes. Safe to call twice.
   */
  leave(): void {
    if (!this.halt() || !this.bye) return;
    this.publish(this.bye.data);
  }

  /** Stops without saying bye (a rebuild on the same connection: we are still here). */
  abandon(): void {
    this.halt();
  }

  /** Seals the `bye` for the current seq ahead of time (call when seq changes). */
  async prepareBye(): Promise<void> {
    const seq = this.getSeq();
    if (this.bye?.seq === seq) return;
    const msg: PresenceMsg = { t: 'bye', seat: this.me.seat, playerId: this.me.playerId, seq };
    const data = await this.sealer.sealJson('here', msg);
    if (this.getSeq() === seq) this.bye = { seq, data };
  }

  /** After an acknowledged write: tell the other device to `kv.get` (R1). */
  announceMoved(seq: number): Promise<void> {
    void this.prepareBye();
    return this.send('moved', seq);
  }

  /** Stops beating and listening; false when already stopped. */
  private halt(): boolean {
    const sub = this.sub;
    if (!sub) return false;
    this.sub = null;
    this.timers.clearInterval(this.beat as never);
    this.timers.clearInterval(this.check as never);
    sub.unsubscribe();
    this.lastSeen = null;
    return true;
  }

  private async send(t: PresenceMsg['t'], seq = this.getSeq()): Promise<void> {
    const msg: PresenceMsg = { t, seat: this.me.seat, playerId: this.me.playerId, seq };
    this.publish(await this.sealer.sealJson('here', msg));
  }

  private publish(data: Uint8Array): void {
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

/**
 * Listen-only presence for a device that has no seat yet (the Who-are-you screen): which seats
 * were heard from in the last 45 s. Sends nothing. Events: `change` on every message, and `seq`
 * ({ seq }) when a message carries a seq higher than `getSeq()` (the doc moved on).
 */
export class SeatWatch extends EventTarget {
  private readonly nc: BusLike;
  private readonly sealer: Sealer;
  private readonly subject: string;
  private readonly now: () => number;
  private readonly getSeq: () => number;
  private sub: Subscription | null = null;
  private readonly seen: [number | null, number | null] = [null, null];

  constructor(o: { nc: BusLike; sealer: Sealer; id: string; now?: () => number; getSeq?: () => number }) {
    super();
    this.nc = o.nc;
    this.sealer = o.sealer;
    this.subject = `bship.${o.id}.here`;
    this.now = o.now ?? Date.now;
    this.getSeq = o.getSeq ?? (() => Number.MAX_SAFE_INTEGER);
  }

  start(): void {
    if (this.sub) return;
    const sub = this.nc.subscribe(this.subject);
    this.sub = sub;
    void this.listen(sub);
  }

  stop(): void {
    this.sub?.unsubscribe();
    this.sub = null;
  }

  isHere(seat: SeatIndex): boolean {
    const t = this.seen[seat];
    return t !== null && this.now() - t < AWAY_MS;
  }

  private async listen(sub: Subscription): Promise<void> {
    try {
      for await (const m of sub) {
        const msg = await this.sealer.openJson<unknown>('here', m.data);
        if (this.sub !== sub || !isPresenceMsg(msg)) continue;
        this.seen[msg.seat] = msg.t === 'bye' ? null : this.now();
        this.dispatchEvent(new Event('change'));
        if (msg.seq > this.getSeq()) this.dispatchEvent(new CustomEvent('seq', { detail: { seq: msg.seq } }));
      }
    } catch {
      // Subscription closed with the connection.
    }
  }
}
