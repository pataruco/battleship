import { AuthorizationError, ConnectionError, type NatsConnection, type Status, type wsconnect } from '@nats-io/nats-core';
import type { KV } from '@nats-io/kv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NatsConfig } from './config';
import { Connection, type ConnStatus } from './nats';

/** Just enough NatsConnection for the lifecycle: status stream, reconnect, close. */
class FakeNc {
  closedFlag = false;
  reconnects = 0;
  /** When set, `reconnect()` only disconnects; the test pushes the `reconnect` status. */
  holdReconnect = false;
  private queue: Status[] = [];
  private wake: (() => void) | null = null;
  private resolveClosed!: (err?: Error) => void;
  private readonly closedP = new Promise<void | Error>((r) => (this.resolveClosed = r));

  push(s: Status): void {
    this.queue.push(s);
    this.wake?.();
  }
  async *status(): AsyncGenerator<Status> {
    for (;;) {
      const s = this.queue.shift();
      if (s) yield s;
      else if (this.closedFlag) return;
      else await new Promise<void>((r) => (this.wake = r));
    }
  }
  async reconnect(): Promise<void> {
    this.reconnects++;
    this.push({ type: 'disconnect', server: 'x' });
    if (!this.holdReconnect) this.push({ type: 'reconnect', server: 'x' });
  }
  isClosed(): boolean {
    return this.closedFlag;
  }
  closed(): Promise<void | Error> {
    return this.closedP;
  }
  async close(): Promise<void> {
    this.closeWith();
  }
  /** The client closing itself, as nats.js does after fatal errors. */
  closeWith(err?: Error): void {
    this.closedFlag = true;
    this.resolveClosed(err);
    this.wake?.();
  }
}

class FakeDoc extends EventTarget {
  hidden = false;
  set(hidden: boolean): void {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

const cfg: NatsConfig = {
  url: 'ws://nats.test:9222',
  auth: { kind: 'userpass', user: 'u', pass: 'p' },
  bucket: 'bship_games',
};

type Outcome = Error | FakeNc;

let outcomes: Outcome[];
let calls: { at: number; opts: Parameters<typeof wsconnect>[0] }[];
let ncs: FakeNc[];
let doc: FakeDoc;
let conn: Connection;
let statuses: ConnStatus[];
let resumes: number;
let opened: unknown[];

const fakeConnect = (async (opts) => {
  calls.push({ at: Date.now(), opts });
  const next = outcomes.shift() ?? new FakeNc();
  if (next instanceof Error) throw next;
  ncs.push(next);
  return next as unknown as NatsConnection;
}) as typeof wsconnect;

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
  outcomes = [];
  calls = [];
  ncs = [];
  doc = new FakeDoc();
  opened = [];
  conn = new Connection(cfg, {
    connect: fakeConnect,
    openKv: async (nc) => {
      opened.push(nc);
      return { nc } as unknown as KV;
    },
    doc: doc as unknown as Document,
  });
  statuses = [];
  resumes = 0;
  conn.addEventListener('status', (e) => statuses.push((e as CustomEvent<ConnStatus>).detail));
  conn.addEventListener('resume', () => resumes++);
});

afterEach(async () => {
  await conn.close();
  vi.useRealTimers();
});

const offline = () => new ConnectionError('');

describe('Connection.start', () => {
  it('connects with the spec options and goes online', async () => {
    await conn.start();
    expect(statuses).toEqual(['connecting', 'online']);
    expect(conn.nc()).toBe(ncs[0]);
    const opts = calls[0]!.opts!;
    expect(opts).toMatchObject({
      servers: cfg.url,
      name: 'bship-web',
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
      pingInterval: 30_000,
      ignoreClusterUpdates: true,
      noEcho: true,
    });
    expect(typeof opts.authenticator).toBe('function');
  });

  it('no authenticator for auth kind none', async () => {
    conn = new Connection({ ...cfg, auth: { kind: 'none' } }, { connect: fakeConnect, doc: null });
    await conn.start();
    expect(calls[0]!.opts!.authenticator).toBeUndefined();
  });

  it('retries the first connect with backoff 2 s doubling to 30 s', async () => {
    outcomes = [offline(), offline(), offline(), offline(), offline(), offline(), offline()];
    const started = conn.start();
    await vi.advanceTimersByTimeAsync(200_000);
    await started;
    expect(calls.map((c) => c.at)).toEqual([0, 2_000, 6_000, 14_000, 30_000, 60_000, 90_000, 120_000]);
    expect(statuses.at(-1)).toBe('online');
    expect(statuses.slice(0, 4)).toEqual(['connecting', 'offline', 'connecting', 'offline']);
  });

  it('a full account shows busy and keeps retrying', async () => {
    outcomes = [new Error('maximum account active connections exceeded'), offline()];
    const started = conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses).toEqual(['connecting', 'busy']);
    await vi.advanceTimersByTimeAsync(10_000);
    await started;
    expect(statuses).toEqual(['connecting', 'busy', 'connecting', 'offline', 'connecting', 'online']);
  });

  it('two consecutive auth errors → auth-failed, and it stops retrying', async () => {
    outcomes = [new AuthorizationError('Authorization Violation'), new AuthorizationError('Authorization Violation')];
    const started = conn.start();
    await vi.advanceTimersByTimeAsync(120_000);
    await started;
    expect(calls).toHaveLength(2);
    expect(statuses.at(-1)).toBe('auth-failed');
    await expect(conn.whenOnline()).rejects.toThrow();
  });

  it('a single auth error between other failures is not fatal', async () => {
    outcomes = [new AuthorizationError('Authorization Violation'), offline(), new AuthorizationError('Authorization Violation')];
    const started = conn.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await started;
    expect(calls).toHaveLength(4);
    expect(statuses.at(-1)).toBe('online');
  });

  it('follows the client status stream: disconnect → offline, reconnect → online', async () => {
    await conn.start();
    ncs[0]!.push({ type: 'disconnect', server: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    expect(conn.status).toBe('offline');
    const online = conn.whenOnline();
    ncs[0]!.push({ type: 'reconnect', server: 'x' });
    await expect(online).resolves.toBe(ncs[0]);
  });
});

describe('Connection visibility lifecycle', () => {
  it('closes after 2 minutes hidden', async () => {
    await conn.start();
    doc.set(true);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(ncs[0]!.closedFlag).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ncs[0]!.closedFlag).toBe(true);
    expect(conn.nc()).toBeNull();
    expect(conn.status).toBe('offline');
  });

  it('does not close if visible again before the timer fires', async () => {
    await conn.start();
    doc.set(true);
    await vi.advanceTimersByTimeAsync(60_000);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(ncs[0]!.closedFlag).toBe(false);
  });

  it('the close timer re-checks hidden (iOS runs overdue timers on resume)', async () => {
    await conn.start();
    doc.set(true);
    doc.hidden = false; // visible, but the visibilitychange event hasn't run yet
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ncs[0]!.closedFlag).toBe(false);
  });

  it('visible after more than 5 s hidden → reconnect, then resume', async () => {
    await conn.start();
    doc.set(true);
    await vi.advanceTimersByTimeAsync(5_001);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(ncs[0]!.reconnects).toBe(1);
    expect(resumes).toBe(1);
    expect(conn.status).toBe('online');
  });

  it('a short hide (≤ 5 s) does not reconnect', async () => {
    await conn.start();
    doc.set(true);
    await vi.advanceTimersByTimeAsync(5_000);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(ncs[0]!.reconnects).toBe(0);
    expect(resumes).toBe(0);
  });

  it('visible after the close → connects again, then resume', async () => {
    await conn.start();
    doc.set(true);
    await vi.advanceTimersByTimeAsync(130_000);
    expect(conn.nc()).toBeNull();
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(conn.nc()).toBe(ncs[1]);
    expect(resumes).toBe(1);
    expect(conn.status).toBe('online');
  });
});

describe('Connection fix round 1', () => {
  it('hidden while offline: after 2 min the retry loop stops, nothing attaches until visible', async () => {
    outcomes = Array.from({ length: 10 }, offline);
    void conn.start();
    doc.set(true);
    await vi.advanceTimersByTimeAsync(600_000);
    const dialled = calls.length;
    expect(dialled).toBeLessThanOrEqual(8); // last dial at 120 s at the latest
    expect(ncs).toHaveLength(0);
    expect(conn.nc()).toBeNull();
    expect(conn.status).toBe('offline');
    outcomes = [];
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.length).toBe(dialled + 1);
    expect(conn.status).toBe('online');
    expect(resumes).toBe(1);
  });

  it('a dial that succeeds after the hidden close is closed, not attached', async () => {
    let finish!: (nc: NatsConnection) => void;
    const late = new FakeNc();
    conn = new Connection(cfg, {
      connect: (async () => new Promise<NatsConnection>((r) => (finish = r))) as typeof wsconnect,
      doc: doc as unknown as Document,
    });
    void conn.start();
    doc.set(true);
    await vi.advanceTimersByTimeAsync(120_000);
    finish(late as unknown as NatsConnection);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.closedFlag).toBe(true);
    expect(conn.nc()).toBeNull();
  });

  it('close() while offline rejects pending whenOnline and kv waiters', async () => {
    outcomes = [offline()];
    void conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(conn.status).toBe('offline');
    const online = conn.whenOnline();
    const kv = conn.kv();
    await conn.close();
    await expect(online).rejects.toThrow(/closed/);
    await expect(kv).rejects.toThrow(/closed/);
  });

  it('close() mid-backoff stops the loop', async () => {
    outcomes = [offline()];
    const started = conn.start();
    await vi.advanceTimersByTimeAsync(0);
    await conn.close();
    await vi.advanceTimersByTimeAsync(100_000);
    await started;
    expect(calls).toHaveLength(1);
    expect(conn.status).toBe('offline');
  });

  it('client closes itself with an auth error → auth-failed', async () => {
    await conn.start();
    ncs[0]!.closeWith(new AuthorizationError('Authorization Violation'));
    await vi.advanceTimersByTimeAsync(0);
    expect(conn.status).toBe('auth-failed');
    expect(calls).toHaveLength(1);
  });

  it('client closes itself for another reason → connects again', async () => {
    await conn.start();
    ncs[0]!.closeWith(new Error('stale connection'));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(conn.nc()).toBe(ncs[1]);
    expect(conn.status).toBe('online');
  });

  it('two long hides in quick succession → one reconnect, one resume', async () => {
    await conn.start();
    ncs[0]!.holdReconnect = true;
    doc.set(true);
    await vi.advanceTimersByTimeAsync(6_000);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    doc.set(true);
    await vi.advanceTimersByTimeAsync(6_000);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    ncs[0]!.push({ type: 'reconnect', server: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    expect(ncs[0]!.reconnects).toBe(1);
    expect(resumes).toBe(1);
  });

  it('start() while already hidden arms the 2-minute close', async () => {
    doc.hidden = true;
    await conn.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ncs[0]!.closedFlag).toBe(true);
    expect(conn.nc()).toBeNull();
  });

  it('kv() is memoised per connection and reopened on a new one', async () => {
    await conn.start();
    const k1 = conn.kv();
    expect(conn.kv()).toBe(k1);
    await k1;
    doc.set(true);
    await vi.advanceTimersByTimeAsync(120_000);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    const k2 = conn.kv();
    expect(k2).not.toBe(k1);
    await k2;
    expect(opened).toEqual([ncs[0], ncs[1]]);
  });
});
