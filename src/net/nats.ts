import { Kvm, type KV } from '@nats-io/kv';
import {
  credsAuthenticator,
  usernamePasswordAuthenticator,
  wsconnect,
  type Authenticator,
  type NatsConnection,
} from '@nats-io/nats-core';
import type { NatsAuth, NatsConfig } from './config';

export type ConnStatus = 'connecting' | 'online' | 'offline' | 'busy' | 'auth-failed';

type DocLike = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: never) => void;
  now: () => number;
};

const FIRST_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
const HIDDEN_CLOSE_MS = 120_000;
const COLD_RESUME_MS = 5_000;
const AUTH_FAILS_TO_GIVE_UP = 2;

function authenticator(auth: NatsAuth): Authenticator | undefined {
  switch (auth.kind) {
    case 'userpass':
      return usernamePasswordAuthenticator(auth.user, auth.pass);
    case 'creds':
      return credsAuthenticator(new TextEncoder().encode(auth.creds));
    case 'none':
      return undefined;
  }
}

/** Every message in an error's cause chain, lower-cased. */
function errorText(e: unknown): string {
  const parts: string[] = [];
  for (let x: unknown = e, depth = 0; x instanceof Error && depth < 5; x = x.cause, depth++) {
    parts.push(`${x.name} ${x.message}`);
  }
  return parts.join(' ').toLowerCase();
}
const isBusy = (e: unknown) => errorText(e).includes('maximum account active connections exceeded');
const isAuth = (e: unknown) => /authorizationerror|authorization violation/.test(errorText(e));

/**
 * The app's one NATS connection (spec §7 Connect / Connection etiquette, R1, R17).
 * Events: `status` (CustomEvent<ConnStatus>) on every change, and `resume` once the connection
 * is back after the page was hidden for more than 5 s (the caller re-reads with `kv.get`).
 */
export class Connection extends EventTarget {
  status: ConnStatus = 'offline';
  private readonly cfg: NatsConfig;
  private readonly connectFn: typeof wsconnect;
  private readonly doc: DocLike | null;
  private readonly timers: Timers;
  private current: NatsConnection | null = null;
  private kvP: Promise<KV> | null = null;
  private loop: Promise<void> | null = null;
  private stopped = false;
  private hiddenAt: number | null = null;
  private closeTimer: unknown = null;
  private wakeSleep: (() => void) | null = null;

  constructor(
    cfg: NatsConfig,
    deps: { connect?: typeof wsconnect; doc?: DocLike | null; timers?: Partial<Timers> } = {},
  ) {
    super();
    this.cfg = cfg;
    this.connectFn = deps.connect ?? wsconnect;
    this.doc = deps.doc === undefined ? (globalThis.document ?? null) : deps.doc;
    this.timers = {
      setTimeout: deps.timers?.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
      clearTimeout: deps.timers?.clearTimeout ?? ((h) => globalThis.clearTimeout(h)),
      now: deps.timers?.now ?? (() => Date.now()),
    };
  }

  /** Connects (retrying with backoff) and starts following page visibility. Resolves once online or auth-failed. */
  start(): Promise<void> {
    this.stopped = false;
    this.doc?.addEventListener('visibilitychange', this.onVisibility);
    return this.connect();
  }

  nc(): NatsConnection | null {
    return this.current;
  }

  /** The game bucket, opened once per underlying connection. */
  kv(): Promise<KV> {
    if (!this.kvP) {
      const p = this.whenOnline().then((nc) => new Kvm(nc).open(this.cfg.bucket, { allow_direct: true }));
      p.catch(() => {
        if (this.kvP === p) this.kvP = null;
      });
      this.kvP = p;
    }
    return this.kvP;
  }

  /** Resolves with the connection when online; rejects on auth-failed or `close`. */
  whenOnline(): Promise<NatsConnection> {
    const ready = this.ready();
    if (ready !== undefined) return ready;
    return new Promise((resolve, reject) => {
      const onStatus = () => {
        const r = this.ready();
        if (r === undefined) return;
        this.removeEventListener('status', onStatus);
        r.then(resolve, reject);
      };
      this.addEventListener('status', onStatus);
    });
  }

  /** Stops everything: no retries, no visibility handling, connection closed. */
  async close(): Promise<void> {
    this.stopped = true;
    this.doc?.removeEventListener('visibilitychange', this.onVisibility);
    this.cancelCloseTimer();
    this.wakeSleep?.();
    const nc = this.detach();
    this.setStatus('offline');
    await nc?.close();
  }

  private ready(): Promise<NatsConnection> | undefined {
    if (this.status === 'online' && this.current) return Promise.resolve(this.current);
    if (this.status === 'auth-failed') return Promise.reject(new Error('NATS authorization failed'));
    if (this.stopped) return Promise.reject(new Error('NATS connection closed'));
    return undefined;
  }

  /** One first-connect loop at a time (R17: `wsconnect` rejects instead of retrying). */
  private connect(): Promise<void> {
    this.loop ??= this.connectLoop().finally(() => (this.loop = null));
    return this.loop;
  }

  private async connectLoop(): Promise<void> {
    let delay = FIRST_BACKOFF_MS;
    let authFails = 0;
    while (!this.stopped) {
      this.setStatus('connecting');
      try {
        const nc = await this.connectFn(this.options());
        if (this.stopped) {
          await nc.close();
          return;
        }
        this.attach(nc);
        return;
      } catch (e) {
        if (isAuth(e)) {
          if (++authFails >= AUTH_FAILS_TO_GIVE_UP) {
            this.setStatus('auth-failed');
            return;
          }
        } else {
          authFails = 0;
        }
        this.setStatus(isBusy(e) ? 'busy' : 'offline');
      }
      await this.sleep(delay);
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
    }
  }

  private options(): Parameters<typeof wsconnect>[0] {
    const auth = authenticator(this.cfg.auth);
    return {
      servers: this.cfg.url,
      ...(auth ? { authenticator: auth } : {}),
      name: 'bship-web',
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
      pingInterval: 30_000,
      ignoreClusterUpdates: true,
      noEcho: true,
    };
  }

  private attach(nc: NatsConnection): void {
    this.current = nc;
    this.kvP = null;
    this.setStatus('online');
    void (async () => {
      try {
        for await (const s of nc.status()) {
          if (this.current !== nc) return;
          if (s.type === 'disconnect') this.setStatus('offline');
          else if (s.type === 'reconnect') this.setStatus('online');
        }
      } catch {
        // status stream ends with the connection
      }
    })();
    void nc.closed().then(() => {
      if (this.current !== nc) return;
      this.detach();
      if (!this.stopped) this.setStatus('offline');
    });
  }

  private detach(): NatsConnection | null {
    const nc = this.current;
    this.current = null;
    this.kvP = null;
    return nc;
  }

  private setStatus(s: ConnStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.dispatchEvent(new CustomEvent<ConnStatus>('status', { detail: s }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.wakeSleep = null;
        this.timers.clearTimeout(handle as never);
        resolve();
      };
      const handle = this.timers.setTimeout(done, ms);
      this.wakeSleep = done;
    });
  }

  private readonly onVisibility = (): void => {
    if (!this.doc || this.stopped) return;
    if (this.doc.hidden) {
      this.hiddenAt ??= this.timers.now();
      this.cancelCloseTimer();
      this.closeTimer = this.timers.setTimeout(() => {
        this.closeTimer = null;
        // iOS runs overdue timers on resume: only close if the page is still hidden.
        if (this.doc?.hidden) void this.closeForHidden();
      }, HIDDEN_CLOSE_MS);
      return;
    }
    this.cancelCloseTimer();
    const hiddenFor = this.hiddenAt === null ? 0 : this.timers.now() - this.hiddenAt;
    this.hiddenAt = null;
    if (hiddenFor > COLD_RESUME_MS || !this.current) void this.resume();
  };

  /** A forgotten tab mustn't hold one of the plan's connection slots. */
  private async closeForHidden(): Promise<void> {
    const nc = this.detach();
    this.setStatus('offline');
    await nc?.close();
  }

  /** R1: every return from a long hide is a cold start — force a reconnect, then let the app re-read. */
  private async resume(): Promise<void> {
    const nc = this.current;
    if (nc && !nc.isClosed()) {
      const back = this.nextOnline();
      try {
        await nc.reconnect();
      } catch {
        // closed or draining meanwhile: fall through to a fresh connect
      }
      await back;
    }
    if (!this.current && !this.stopped) await this.connect();
    if (this.status === 'online' && !this.stopped) this.dispatchEvent(new Event('resume'));
  }

  /** Resolves on the next transition to online, or when the connection goes away. */
  private nextOnline(): Promise<void> {
    return new Promise((resolve) => {
      const onStatus = () => {
        if (this.status !== 'online' && this.current && !this.stopped) return;
        this.removeEventListener('status', onStatus);
        resolve();
      };
      this.addEventListener('status', onStatus);
    });
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer === null) return;
    this.timers.clearTimeout(this.closeTimer as never);
    this.closeTimer = null;
  }
}
