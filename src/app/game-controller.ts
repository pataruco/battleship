import { newSession } from '../crypto/link';
import { createSealer, type Sealer } from '../crypto/seal';
import { compareDocs } from '../game/compare';
import { createDoc, type RulesEngine } from '../game/reducer';
import type { Action, GameDoc, Outcome, Profile, SeatIndex } from '../game/types';
import { GameStore, type ApplyResult, type KvLike } from '../net/game-store';
import type { ConnStatus } from '../net/nats';
import { Presence, SeatWatch, type BusLike } from '../net/presence';
import { gamesRepo, type GameRecord } from '../storage/games-repo';

export type BannerKind = 'offline' | 'busy' | 'retry' | 'rejected' | 'update-needed';
export type ControllerStatus = 'loading' | 'ready' | 'unavailable' | 'update-needed';

export type ControllerState = {
  doc: GameDoc | null;
  revision: number;
  seat: SeatIndex | null;
  status: ControllerStatus;
  pending: boolean;
  opponentHere: boolean;
  banner: BannerKind | null;
  /** Ready, no seat of mine, seat 1 empty: show Join. */
  needsJoin: boolean;
  /** Ready, no seat of mine, both seats taken: show Who-are-you. */
  needsWho: boolean;
};

export type MovedDetail = { prev: GameDoc | null; next: GameDoc; outcome?: Outcome };

/** The slice of `Connection` the controller uses (a fake in tests). */
export type ConnLike = EventTarget & {
  readonly status: ConnStatus;
  kv(): Promise<KvLike>;
  nc(): BusLike | null;
};

type PageDoc = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
type PageWin = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export type ControllerDeps = {
  id: string;
  secret: string;
  profile: Profile;
  engine: RulesEngine;
  conn: ConnLike;
  /** Page visibility; null means always visible (tests). */
  doc?: PageDoc | null;
  /** For `pagehide` / `pageshow`; null in tests. */
  win?: PageWin | null;
  presenceTimers?: {
    setInterval: (fn: () => void, ms: number) => unknown;
    clearInterval: (handle: never) => void;
  };
};

const CONNECTION_BANNERS: ReadonlySet<BannerKind | null> = new Set(['offline', 'busy']);

/** Host path: a brand-new game on the server, then the local record (seat 0). */
export async function createGame(o: { kv: KvLike; profile: Profile; engine: RulesEngine }): Promise<{ id: string; secret: string }> {
  const { id, secret } = newSession();
  const doc = createDoc(id, o.profile, o.engine.version);
  const store = new GameStore({ kv: o.kv, sealer: await createSealer(id, secret), id, engine: o.engine });
  const revision = await store.create(doc);
  await gamesRepo.put({
    id,
    secret,
    seat: 0,
    doc,
    revision,
    seq: doc.seq,
    opponent: null,
    shared: false,
    addedAt: Date.now(),
    lastMoveAt: null,
  });
  return { id, secret };
}

/** Did `action` already take effect in `doc`? (A lost reply whose write landed, then a retry.) */
function alreadyApplied(action: Action, doc: GameDoc, before: GameDoc): boolean {
  switch (action.type) {
    case 'join':
      return doc.seats[1]?.playerId === action.profile.playerId;
    case 'place':
      return JSON.stringify(doc.fleets[action.seat]) === JSON.stringify(action.fleet.map((s) => ({ bow: s.bow, dir: s.dir })));
    case 'ready':
      return doc.ready[action.seat];
    case 'fire':
      return doc.round === before.round && doc.shots[action.seat].includes(action.cell);
    case 'react':
      return doc.reactions[action.seat]?.emoji === action.emoji;
    case 'rematch':
      return doc.rematch[action.seat] || doc.round > before.round;
  }
}

/**
 * One open game: cached doc first, then the server (R3 reconcile), writes by CAS, presence and
 * moved notes (R1), seat binding (spec §8). Events: `change` after every state change, and
 * `moved` (CustomEvent<MovedDetail>) whenever the shown doc moves on.
 */
export class GameController extends EventTarget {
  readonly id: string;
  readonly secret: string;
  private s: ControllerState = {
    doc: null,
    revision: 0,
    seat: null,
    status: 'loading',
    pending: false,
    opponentHere: false,
    banner: null,
    needsJoin: false,
    needsWho: false,
  };
  private readonly profile: Profile;
  private readonly engine: RulesEngine;
  private readonly conn: ConnLike;
  private readonly page: PageDoc | null;
  private readonly win: PageWin | null;
  private readonly presenceTimers: ControllerDeps['presenceTimers'];
  private sealer!: Sealer;
  private store: GameStore | null = null;
  /** The connection the store and presence were built on. */
  private boundNc: BusLike | null = null;
  private rebuilding: Promise<boolean> | null = null;
  /** Bumped on every resume: a rebuild started before it is stale. */
  private generation = 0;
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;
  private presence: Presence | null = null;
  private watch: SeatWatch | null = null;
  private presenceKey = '';
  private hasRecord = false;
  private disposed = false;

  private constructor(o: ControllerDeps) {
    super();
    this.id = o.id;
    this.secret = o.secret;
    this.profile = o.profile;
    this.engine = o.engine;
    this.conn = o.conn;
    this.page = o.doc === undefined ? (globalThis.document ?? null) : o.doc;
    this.win = o.win === undefined ? (globalThis.window ?? null) : o.win;
    this.presenceTimers = o.presenceTimers;
  }

  /** Shows the cached doc at once and starts reconciling with the server in the background. */
  static async open(o: ControllerDeps): Promise<GameController> {
    const c = new GameController(o);
    await c.init();
    return c;
  }

  get state(): ControllerState {
    return this.s;
  }

  private async init(): Promise<void> {
    this.sealer = await createSealer(this.id, this.secret);
    const rec = await gamesRepo.get(this.id).catch(() => null);
    if (rec) {
      this.hasRecord = true;
      this.set(rec.doc ? { doc: rec.doc, revision: rec.revision, seat: rec.seat, status: 'ready' } : { seat: rec.seat });
    }
    this.conn.addEventListener('status', this.onStatus);
    this.conn.addEventListener('resume', this.onResume);
    this.page?.addEventListener('visibilitychange', this.onVisibility);
    this.win?.addEventListener('pagehide', this.onPageHide);
    this.win?.addEventListener('pageshow', this.onVisibility);
    this.applyStatus();
    await this.resolveSeat();
    void this.refresh();
  }

  /** Re-reads the server and reconciles with the shown doc. Concurrent calls share one run. */
  refresh(): Promise<void> {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        await this.loadOnce();
      } while (this.refreshAgain && !this.disposed);
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Takes the guest seat with this device's profile. */
  join(): Promise<ApplyResult> {
    return this.act({ type: 'join', profile: this.profile });
  }

  /** Binds this device to a seat. Local only: the shared doc never changes (spec §8). */
  async claimSeat(seat: SeatIndex): Promise<void> {
    await this.bind(seat);
  }

  /** The Who-are-you screen's "are you sure?" check: was that seat heard from just now? */
  seatHere(seat: SeatIndex): boolean {
    return this.watch?.isHere(seat) ?? false;
  }

  /** The link was shared or copied from this device (spec §13 nudge 3). */
  async markShared(): Promise<void> {
    // One transaction: never puts back a cached doc older than one saved meanwhile.
    await gamesRepo.patch(this.id, { shared: true }).catch(() => {});
  }

  async act(action: Action): Promise<ApplyResult> {
    if (this.s.status === 'update-needed') return { kind: 'failed', reason: 'update-needed' };
    // A double tap: the first action is still in flight.
    if (this.s.pending) return { kind: 'failed', reason: 'conflict' };
    if (this.s.status !== 'ready' || !this.s.doc) return { kind: 'failed', reason: 'offline' };
    if (this.conn.status !== 'online') {
      this.applyStatus();
      return { kind: 'failed', reason: 'offline' };
    }
    this.set({ pending: true });
    try {
      await this.ensureNet();
      const store = this.store;
      if (!store || this.disposed) {
        this.set({ banner: 'offline' });
        return { kind: 'failed', reason: 'offline' };
      }
      // Doc and revision together, after the await: a load may have adopted a newer doc meanwhile.
      const current = this.s.doc;
      const res = await store.apply(action, { doc: current, revision: this.s.revision });
      // A reaction is a nicety: when it doesn't go through, it is dropped without a banner.
      const quiet = action.type === 'react';
      if (this.disposed) return res;
      if (res.kind === 'ok') {
        this.clearBanner(['retry', 'rejected']);
        await this.adopt(res.doc, res.revision, Date.now(), res.outcome);
        void this.presence?.announceMoved(res.doc.seq);
      } else if (res.kind === 'rejected') {
        const landed = alreadyApplied(action, res.doc, current);
        // Never step back behind a doc a load showed while the action was in flight.
        if (!this.s.doc || compareDocs(res.doc, this.s.doc) >= 0) await this.adopt(res.doc, res.revision, null);
        if (!quiet) this.set({ banner: landed ? null : 'rejected' });
      } else if (res.reason === 'update-needed') {
        this.set({ status: 'update-needed', banner: 'update-needed' });
      } else if (!quiet) {
        this.set({ banner: 'retry' });
      }
      return res;
    } finally {
      if (!this.disposed) this.set({ pending: false });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.conn.removeEventListener('status', this.onStatus);
    this.conn.removeEventListener('resume', this.onResume);
    this.page?.removeEventListener('visibilitychange', this.onVisibility);
    this.win?.removeEventListener('pagehide', this.onPageHide);
    this.win?.removeEventListener('pageshow', this.onVisibility);
    void this.presence?.stop().catch(() => {});
    this.presence = null;
    this.watch?.stop();
    this.watch = null;
  }

  // --- state ---

  private set(patch: Partial<ControllerState>): void {
    const next = { ...this.s, ...patch };
    const unseated = next.status === 'ready' && next.seat === null && next.doc !== null;
    next.needsJoin = unseated && next.doc!.seats[1] === null;
    next.needsWho = unseated && next.doc!.seats[1] !== null;
    this.s = next;
    this.dispatchEvent(new Event('change'));
  }

  private clearBanner(kinds: (BannerKind | null)[]): void {
    if (kinds.includes(this.s.banner)) this.set({ banner: null });
  }

  /** Shows a server-acknowledged or server-returned doc and caches it. */
  private async adopt(next: GameDoc, revision: number, lastMoveAt: number | null, outcome?: Outcome): Promise<void> {
    const prev = this.s.doc;
    const changed = !prev || prev.seq !== next.seq || JSON.stringify(prev) !== JSON.stringify(next);
    this.set({ doc: next, revision, status: 'ready' });
    await this.resolveSeat();
    if (this.hasRecord) await gamesRepo.saveAck(this.id, next, revision, lastMoveAt).catch(() => {});
    if (changed) {
      this.clearBanner(['retry', 'rejected']);
      void this.presence?.prepareBye();
      this.dispatchEvent(new CustomEvent<MovedDetail>('moved', { detail: { prev, next, ...(outcome ? { outcome } : {}) } }));
    }
  }

  // --- seats ---

  /** Spec §8: local binding, else the seat with my playerId; otherwise Join or Who stays open. */
  private async resolveSeat(): Promise<void> {
    const doc = this.s.doc;
    if (this.s.seat === null && doc && this.s.status === 'ready') {
      const mine = doc.seats.findIndex((p) => p?.playerId === this.profile.playerId);
      if (mine === 0 || mine === 1) return this.bind(mine);
    }
    this.syncPresence();
  }

  private async bind(seat: SeatIndex): Promise<void> {
    const doc = this.s.doc;
    if (!doc || this.s.status !== 'ready') return;
    this.set({ seat });
    this.syncPresence();
    const other = doc.seats[seat === 0 ? 1 : 0];
    const opponent = other ? { name: other.name, avatar: other.avatar } : null;
    try {
      const rec = await gamesRepo.get(this.id);
      const next: GameRecord = rec
        ? { ...rec, seat, opponent }
        : {
            id: this.id,
            secret: this.secret,
            seat,
            doc,
            revision: this.s.revision,
            seq: doc.seq,
            opponent,
            shared: false,
            addedAt: Date.now(),
            lastMoveAt: null,
          };
      await gamesRepo.put(next);
      this.hasRecord = true;
      if (this.s.doc && this.s.doc !== doc) {
        await gamesRepo.saveAck(this.id, this.s.doc, this.s.revision, null);
      }
    } catch {
      // Storage blocked: the seat still holds for this page.
    }
  }

  // --- network ---

  private async loadOnce(): Promise<void> {
    await this.ensureNet();
    const store = this.store;
    if (!store || this.disposed || this.conn.status !== 'online') return;
    const doc = this.s.doc;
    let res;
    try {
      res = await store.load(doc ? { doc, revision: this.s.revision } : null);
    } catch {
      if (!this.disposed) this.set({ banner: 'offline' });
      return;
    }
    if (this.disposed) return;
    if (res.kind === 'update-needed') {
      // Opaque: never read names or fleets from a doc this build doesn't understand.
      this.set({ status: 'update-needed', banner: 'update-needed' });
      return;
    }
    this.clearBanner(['offline']);
    if (res.kind === 'unavailable') {
      if (!this.s.doc) this.set({ status: 'unavailable' });
      return;
    }
    // An action landed while we read: never step back behind it.
    const shown = this.s.doc;
    if (shown && shown !== doc && compareDocs(res.doc, shown) < 0) return;
    await this.adopt(res.doc, res.revision, res.lastMoveAt);
    if (res.wroteBack) void this.presence?.announceMoved(res.doc.seq);
  }

  /** Builds the store and presence on the current connection when online and not yet bound. */
  private async ensureNet(): Promise<void> {
    // A resume during a rebuild makes that rebuild stale: go again (bounded).
    for (let i = 0; i < 3; i++) {
      if (this.disposed || this.conn.status !== 'online') return;
      if (this.store && this.boundNc !== null && this.conn.nc() === this.boundNc) return;
      if (!this.rebuilding) {
        const p = this.rebuild().finally(() => {
          if (this.rebuilding === p) this.rebuilding = null;
        });
        this.rebuilding = p;
      }
      if (!(await this.rebuilding)) return;
    }
  }

  /** False when the bucket couldn't be opened. */
  private async rebuild(): Promise<boolean> {
    const generation = this.generation;
    const nc = this.conn.nc();
    let kv: KvLike;
    try {
      kv = await this.conn.kv();
    } catch {
      if (!this.disposed) this.set({ banner: 'offline' });
      return false;
    }
    if (this.disposed || generation !== this.generation) return true;
    this.store = new GameStore({ kv, sealer: this.sealer, id: this.id, engine: this.engine });
    this.boundNc = nc;
    this.presenceKey = ''; // new connection or resume: new presence
    this.syncPresence();
    return true;
  }

  /** Presence when seated, a listen-only watch on Who-are-you, nothing otherwise. */
  private syncPresence(): void {
    const nc = this.boundNc;
    const unseated = this.s.needsJoin || this.s.needsWho;
    const key = !nc || this.disposed ? '' : this.s.seat !== null ? `seat${this.s.seat}` : unseated ? 'watch' : '';
    if (key === this.presenceKey && (key === '' || this.presence || this.watch)) return;
    this.presenceKey = key;
    // Silently: on the same connection we are still here, so no bye (no here → away → here).
    this.presence?.abandon();
    this.presence = null;
    this.watch?.stop();
    this.watch = null;
    if (this.s.opponentHere) this.set({ opponentHere: false });
    if (!nc || key === '') return;

    if (key === 'watch') {
      // Join and Who: no seat to announce, but notice seats arriving and the doc moving on.
      const watch = new SeatWatch({ nc, sealer: this.sealer, id: this.id, getSeq: () => this.s.doc?.seq ?? 0 });
      watch.addEventListener('change', () => this.dispatchEvent(new Event('change')));
      watch.addEventListener('seq', () => {
        if (this.watch === watch) void this.refresh();
      });
      try {
        watch.start();
        this.watch = watch;
      } catch {
        // closed connection: the next online rebuilds
      }
      return;
    }
    const p = new Presence({
      nc,
      sealer: this.sealer,
      id: this.id,
      me: { seat: this.s.seat!, playerId: this.profile.playerId },
      getSeq: () => this.s.doc?.seq ?? 0,
      ...(this.presenceTimers ?? {}),
    });
    p.addEventListener('opponent', (e) => {
      if (this.presence === p) this.set({ opponentHere: (e as CustomEvent<{ here: boolean }>).detail.here });
    });
    p.addEventListener('seq', () => {
      if (this.presence === p) void this.refresh();
    });
    this.presence = p;
    if (!this.page?.hidden) void p.start().catch(() => {});
  }

  private readonly onStatus = (): void => {
    if (this.disposed) return;
    this.applyStatus();
    if (this.conn.status === 'online') void this.refresh();
  };

  /** Connection status → banner (R17: busy; repeated auth errors → update needed). */
  private applyStatus(): void {
    switch (this.conn.status) {
      case 'online':
        this.clearBanner([...CONNECTION_BANNERS]);
        break;
      case 'offline':
        if (this.s.banner !== 'update-needed') this.set({ banner: 'offline' });
        break;
      case 'busy':
        if (this.s.banner !== 'update-needed') this.set({ banner: 'busy' });
        break;
      case 'auth-failed':
        this.set({ banner: 'update-needed' });
        break;
      case 'connecting':
        break;
    }
  }

  /** Back from a long hide (R1): fresh kv, fresh presence, then re-read. */
  private readonly onResume = (): void => {
    if (this.disposed) return;
    this.generation++;
    this.boundNc = null;
    this.rebuilding = null;
    void this.refresh();
  };

  /**
   * Heartbeats only while visible (spec §7 Presence). Back to visible always re-reads: a moved
   * note may have been missed, and `resume` only comes after more than 5 s hidden.
   */
  private readonly onVisibility = (): void => {
    if (this.disposed) return;
    const p = this.presence;
    if (this.page?.hidden) {
      void p?.stop().catch(() => {});
      if (this.s.opponentHere) this.set({ opponentHere: false });
      return;
    }
    void p?.start().catch(() => {});
    void this.refresh();
  };

  /** The page may be frozen before any await resumes: the bye was sealed ahead of time. */
  private readonly onPageHide = (): void => {
    this.presence?.leave();
  };
}
