import type { Sealer } from '../crypto/seal';
import { compareDocs } from '../game/compare';
import { reduce, type ReduceError, type RulesEngine } from '../game/reducer';
import type { Action, GameDoc, Outcome } from '../game/types';
import { DOC_VERSION } from '../game/types';
import { isGameDoc } from '../game/validate';
import { isConflict, isKeyExists, isTimeout } from './errors';

export type KvEntryLike = {
  value: Uint8Array;
  revision: number;
  operation: 'PUT' | 'DEL' | 'PURGE';
  created: Date;
};

/** The slice of nats.js `KV` the store uses; the real `KV` satisfies it. */
export type KvLike = {
  get(key: string): Promise<KvEntryLike | null>;
  create(key: string, value: Uint8Array): Promise<number>;
  update(key: string, value: Uint8Array, revision: number): Promise<number>;
};

export type Versioned = { doc: GameDoc; revision: number };

export type LoadResult =
  | { kind: 'ok'; doc: GameDoc; revision: number; lastMoveAt: number | null; wroteBack: boolean }
  | { kind: 'unavailable' }
  | { kind: 'update-needed'; doc: GameDoc };

export type ApplyResult =
  | { kind: 'ok'; doc: GameDoc; revision: number; outcome?: Outcome }
  | { kind: 'rejected'; error: ReduceError; doc: GameDoc; revision: number }
  | { kind: 'failed'; reason: 'offline' | 'conflict' | 'update-needed' };

/** What `kv.get` found under the key. `missing` covers absent and DEL/PURGE (write with `create`). */
type ServerRead =
  | { kind: 'doc'; doc: GameDoc; revision: number; created: Date }
  | { kind: 'missing' }
  | { kind: 'unreadable'; revision: number }
  | { kind: 'update-needed'; doc: GameDoc };

const MAX_ATTEMPTS = 5;

/** One sealed doc per game under `g.<id>`, written only by compare-and-set (spec §7, R3, R5). */
export class GameStore {
  private readonly kv: KvLike;
  private readonly sealer: Sealer;
  private readonly id: string;
  private readonly engine: RulesEngine;
  private readonly knownDocVersion: number;
  private readonly key: string;

  constructor(o: { kv: KvLike; sealer: Sealer; id: string; engine: RulesEngine; knownDocVersion?: number }) {
    this.kv = o.kv;
    this.sealer = o.sealer;
    this.id = o.id;
    this.engine = o.engine;
    this.knownDocVersion = o.knownDocVersion ?? DOC_VERSION;
    this.key = `g.${o.id}`;
  }

  /** Writes a brand-new game; rejects if the key already holds a value. */
  async create(doc: GameDoc): Promise<number> {
    return this.kv.create(this.key, await this.sealer.sealJson('doc', doc));
  }

  /**
   * R3 reconcile against the server. Server newer or equal → adopt. Server older, missing or
   * unreadable → write `local` back unchanged. Transport errors reject; the caller keeps its cache.
   */
  load(local: Versioned | null): Promise<LoadResult> {
    return this.reconcile(local, false);
  }

  private async reconcile(local: Versioned | null, retried: boolean): Promise<LoadResult> {
    const server = await this.read();
    if (server.kind === 'update-needed') return server;
    if (server.kind === 'doc' && (!local || compareDocs(server.doc, local.doc) >= 0)) {
      return {
        kind: 'ok',
        doc: server.doc,
        revision: server.revision,
        lastMoveAt: server.created.getTime(),
        wroteBack: false,
      };
    }
    if (!local) return { kind: 'unavailable' };
    if (this.tooNew(local.doc)) return { kind: 'update-needed', doc: local.doc };

    const revision = server.kind === 'missing' ? 0 : server.revision;
    try {
      const rev = await this.write(local.doc, revision);
      return { kind: 'ok', doc: local.doc, revision: rev, lastMoveAt: null, wroteBack: true };
    } catch (e) {
      const raced = revision === 0 ? isKeyExists(e) : isConflict(e);
      if (raced && !retried) return this.reconcile(local, true);
      throw e;
    }
  }

  /** CAS loop: reduce → update; on conflict re-read, reconcile and retry (max 5 attempts). */
  async apply(action: Action, current: Versioned): Promise<ApplyResult> {
    let cur: Versioned = current;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (this.tooNew(cur.doc)) return { kind: 'failed', reason: 'update-needed' };
      const r = reduce(cur.doc, action, this.engine);
      if (!r.ok) return { kind: 'rejected', error: r.error, doc: cur.doc, revision: cur.revision };
      const outcome = r.outcome ? { outcome: r.outcome } : {};
      try {
        const revision = await this.write(r.doc, cur.revision);
        return { kind: 'ok', doc: r.doc, revision, ...outcome };
      } catch (e) {
        if (isTimeout(e)) {
          const landed = await this.landed(r.doc);
          return landed ? { kind: 'ok', ...landed, ...outcome } : { kind: 'failed', reason: 'offline' };
        }
        const conflict = cur.revision === 0 ? isKeyExists(e) : isConflict(e);
        if (!conflict) return { kind: 'failed', reason: 'offline' };
      }
      let server: ServerRead;
      try {
        server = await this.read();
      } catch {
        return { kind: 'failed', reason: 'offline' };
      }
      if (server.kind === 'update-needed') return { kind: 'failed', reason: 'update-needed' };
      if (server.kind === 'doc' && compareDocs(server.doc, cur.doc) >= 0) {
        cur = { doc: server.doc, revision: server.revision };
      } else {
        // Server older, missing or unreadable: our copy (plus the action) goes back at its revision.
        cur = { doc: cur.doc, revision: server.kind === 'missing' ? 0 : server.revision };
      }
    }
    return { kind: 'failed', reason: 'conflict' };
  }

  /** R5: after a lost reply, did exactly our doc land? */
  private async landed(expected: GameDoc): Promise<Versioned | null> {
    try {
      const server = await this.read();
      if (
        server.kind === 'doc' &&
        server.doc.seq === expected.seq &&
        compareDocs(server.doc, expected) === 0 &&
        JSON.stringify(server.doc) === JSON.stringify(expected)
      ) {
        return { doc: server.doc, revision: server.revision };
      }
    } catch {
      // still offline
    }
    return null;
  }

  private async write(doc: GameDoc, revision: number): Promise<number> {
    const bytes = await this.sealer.sealJson('doc', doc);
    return revision === 0 ? this.kv.create(this.key, bytes) : this.kv.update(this.key, bytes, revision);
  }

  private tooNew(x: { v?: unknown; engine?: unknown }): boolean {
    return (
      (typeof x.v === 'number' && x.v > this.knownDocVersion) ||
      (typeof x.engine === 'number' && x.engine > this.engine.version)
    );
  }

  private async read(): Promise<ServerRead> {
    const entry = await this.kv.get(this.key);
    if (!entry || entry.operation !== 'PUT') return { kind: 'missing' };
    const raw = await this.sealer.openJson<unknown>('doc', entry.value);
    // Version skew first: a newer doc may have a shape this build doesn't know.
    if (raw && typeof raw === 'object' && this.tooNew(raw)) {
      return { kind: 'update-needed', doc: raw as GameDoc };
    }
    if (!isGameDoc(raw) || raw.id !== this.id) return { kind: 'unreadable', revision: entry.revision };
    return { kind: 'doc', doc: raw, revision: entry.revision, created: entry.created };
  }
}
