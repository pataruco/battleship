// Test helper: an in-memory KvLike that models NATS KV revisions and errors.
import { JetStreamApiError } from '@nats-io/jetstream';
import { ClosedConnectionError, TimeoutError } from '@nats-io/nats-core';
import type { KvEntryLike, KvLike } from './game-store';

export type FailKind =
  | 'conflict10071'
  | 'conflict10164'
  | 'timeout-after-write'
  | 'timeout-before-write'
  | 'closed';

type Op = KvEntryLike['operation'];
type Hook = () => unknown;

const conflict = (code: number, last: number) =>
  new JetStreamApiError({ code: 400, err_code: code, description: `wrong last sequence: ${last}` });

/** One sequence shared by every key, like a JetStream stream; `update` needs the key's latest revision. */
export class FakeKv implements KvLike {
  /** Successful `create`/`update` calls. */
  writes = 0;
  /** Every stored entry, in order: store writes plus `setRaw`/`del`/`purge`. */
  readonly log: { op: 'create' | 'update' | 'raw' | 'del' | 'purge'; key: string; revision: number }[] = [];
  private seq = 0;
  private readonly latest = new Map<string, KvEntryLike>();
  private readonly failures: FailKind[] = [];
  private writeHooks: Hook[] = [];
  private getHooks: Hook[] = [];

  failNextUpdate(kind: FailKind): void {
    this.failures.push(kind);
  }
  /** Run `fn` (e.g. a racing write) just before the next create/update is checked. */
  beforeNextWrite(fn: Hook): void {
    this.writeHooks.push(fn);
  }
  /** Run `fn` just before the next get reads. */
  beforeNextGet(fn: Hook): void {
    this.getHooks.push(fn);
  }

  setRaw(key: string, value: Uint8Array): number {
    return this.store(key, value, 'PUT', 'raw');
  }
  del(key: string): number {
    return this.store(key, new Uint8Array(), 'DEL', 'del');
  }
  purge(key: string): number {
    return this.store(key, new Uint8Array(), 'PURGE', 'purge');
  }

  async get(key: string): Promise<KvEntryLike | null> {
    await this.runHooks('get');
    const e = this.latest.get(key);
    return e ? { ...e, value: e.value.slice() } : null;
  }

  /** Like nats.js 3.x: succeeds when the key is absent or its latest entry is a DEL/PURGE marker. */
  async create(key: string, value: Uint8Array): Promise<number> {
    await this.runHooks('write');
    const e = this.latest.get(key);
    if (e && e.operation === 'PUT') throw conflict(10071, e.revision);
    this.writes++;
    return this.store(key, value, 'PUT', 'create');
  }

  async update(key: string, value: Uint8Array, revision: number): Promise<number> {
    await this.runHooks('write');
    const fail = this.failures.shift();
    if (fail === 'conflict10071' || fail === 'conflict10164') {
      throw conflict(fail === 'conflict10071' ? 10071 : 10164, this.latest.get(key)?.revision ?? 0);
    }
    if (fail === 'timeout-before-write') throw new TimeoutError();
    if (fail === 'closed') throw new ClosedConnectionError();
    const last = this.latest.get(key)?.revision ?? 0;
    if (revision !== last) throw conflict(10071, last);
    this.writes++;
    const rev = this.store(key, value, 'PUT', 'update');
    if (fail === 'timeout-after-write') throw new TimeoutError();
    return rev;
  }

  private store(key: string, value: Uint8Array, operation: Op, op: FakeKv['log'][number]['op']): number {
    const revision = ++this.seq;
    this.latest.set(key, { value: value.slice(), revision, operation, created: new Date() });
    this.log.push({ op, key, revision });
    return revision;
  }

  private async runHooks(kind: 'get' | 'write'): Promise<void> {
    const hooks = kind === 'get' ? this.getHooks : this.writeHooks;
    if (kind === 'get') this.getHooks = [];
    else this.writeHooks = [];
    for (const fn of hooks) await fn();
  }
}
