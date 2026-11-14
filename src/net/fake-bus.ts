// Test helper: an in-memory pub/sub shared by several fake clients, shaped like NatsConnection's
// publish/subscribe. Delivery is asynchronous, like the real server; `noEcho` clients don't
// receive their own messages.
import type { Payload, Subscription } from '@nats-io/nats-core';
import type { BusLike } from './presence';

export type BusMsg = { subject: string; data: Uint8Array };

const enc = new TextEncoder();

type Sub = { client: FakeBusClient; subject: string; queue: BusMsg[]; wake: (() => void) | null; done: boolean };

/** NATS subject match with `*` (one token) and `>` (one or more trailing tokens). */
function matches(pattern: string, subject: string): boolean {
  const p = pattern.split('.');
  const s = subject.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '>') return s.length > i;
    if (i >= s.length || (p[i] !== '*' && p[i] !== s[i])) return false;
  }
  return p.length === s.length;
}

export class FakeBus {
  /** Every message published on the bus, in order, with the publishing client. */
  readonly log: (BusMsg & { from: FakeBusClient })[] = [];
  private subs: Sub[] = [];

  client(opts: { noEcho?: boolean } = { noEcho: true }): FakeBusClient {
    return new FakeBusClient(this, opts.noEcho ?? true);
  }

  /** @internal */
  deliver(from: FakeBusClient, subject: string, data: Uint8Array): void {
    this.log.push({ subject, data, from });
    const targets = this.subs.filter(
      (s) => !s.done && matches(s.subject, subject) && !(from.noEcho && s.client === from),
    );
    queueMicrotask(() => {
      for (const s of targets) {
        if (s.done) continue;
        s.queue.push({ subject, data: data.slice() });
        s.wake?.();
      }
    });
  }

  /** @internal */
  add(sub: Sub): void {
    this.subs.push(sub);
  }

  /** @internal */
  remove(sub: Sub): void {
    sub.done = true;
    this.subs = this.subs.filter((s) => s !== sub);
    sub.wake?.();
  }
}

export class FakeBusClient implements BusLike {
  constructor(
    private readonly bus: FakeBus,
    readonly noEcho: boolean,
  ) {}

  publish(subject: string, payload?: Payload): void {
    const data = typeof payload === 'string' ? enc.encode(payload) : (payload ?? new Uint8Array());
    this.bus.deliver(this, subject, data);
  }

  subscribe(subject: string): Subscription {
    const bus = this.bus;
    const sub: Sub = { client: this, subject, queue: [], wake: null, done: false };
    bus.add(sub);
    async function* iterate(): AsyncGenerator<BusMsg> {
      while (true) {
        const next = sub.queue.shift();
        if (next) {
          yield next;
          continue;
        }
        if (sub.done) return;
        await new Promise<void>((resolve) => (sub.wake = resolve));
        sub.wake = null;
      }
    }
    const it = iterate();
    // Only the parts Presence uses; the cast keeps the fake small.
    return {
      [Symbol.asyncIterator]: () => it,
      unsubscribe: () => bus.remove(sub),
      getSubject: () => subject,
      isClosed: () => sub.done,
    } as unknown as Subscription;
  }
}
