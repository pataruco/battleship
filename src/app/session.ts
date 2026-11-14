import { createSealer } from '../crypto/seal';
import { getEngine } from '../engine/engine';
import { GameStore } from '../net/game-store';
import { Connection, type ConnStatus } from '../net/nats';
import { natsConfig } from '../net/config';
import type { Profile } from '../game/types';
import { gamesRepo, profileRepo, type GameRecord } from '../storage/games-repo';
import { createGame, GameController } from './game-controller';
import { Store } from './store';

export type Badge = 'your-turn' | 'their-turn' | 'setup' | 'over' | 'update-needed' | 'unavailable';

export type AppState = {
  status: ConnStatus;
  profile: Profile | null;
  games: GameRecord[] | null;
  badges: Record<string, Badge>;
};

/** Badge from the cached doc alone. */
export function badgeFromRecord(rec: GameRecord): Badge {
  const doc = rec.doc;
  if (!doc || doc.phase === 'setup') return 'setup';
  if (doc.phase === 'over') return 'over';
  return rec.seat !== null && doc.turn === rec.seat ? 'your-turn' : 'their-turn';
}

const BLOCKED: ReadonlySet<Badge> = new Set(['update-needed', 'unavailable']);

/** Runs once the device has created its first game. Task 19 asks for persistent storage here. */
export function afterFirstGameCreated(): void {}

export class AppSession {
  readonly state = new Store<AppState>({ status: 'offline', profile: null, games: null, badges: {} });
  /** The game opened last on this page, for `#/debug`. */
  lastGameId: string | null = null;
  private conn: Connection | null = null;
  private homeRefresh: Promise<GameRecord[]> | null = null;

  connection(): Connection {
    if (!this.conn) {
      this.conn = new Connection(natsConfig());
      this.conn.addEventListener('status', (e) => {
        this.state.set({ status: (e as CustomEvent<ConnStatus>).detail });
      });
    }
    return this.conn;
  }

  /** Starts connecting in the background; the app works from its cache meanwhile. */
  start(): void {
    void this.connection().start().catch(() => {});
  }

  async openGame(id: string, secret: string): Promise<GameController> {
    const profile = this.state.get().profile ?? (await profileRepo.get());
    if (!profile) throw new Error('no_profile');
    return GameController.open({ id, secret, profile, engine: getEngine(), conn: this.connection() });
  }

  /** Host path (spec §8): the doc on the server first, then the local record. Rejects when offline. */
  async newGame(): Promise<{ id: string; secret: string }> {
    const profile = this.state.get().profile ?? (await profileRepo.get());
    if (!profile) throw new Error('no_profile');
    const conn = this.connection();
    if (conn.status !== 'online') throw new Error('offline');
    const firstGame = (await gamesRepo.list()).length === 0;
    const game = await createGame({ kv: await conn.kv(), profile, engine: getEngine() });
    if (firstGame) afterFirstGameCreated();
    return game;
  }

  /**
   * Cached games right away; when online, re-reads each from the server so the badges are
   * fresh. A failed read keeps that game's cached record (and a blocked badge stays until a read
   * says otherwise). Concurrent calls share one run.
   */
  refreshHome(): Promise<GameRecord[]> {
    this.homeRefresh ??= this.doRefreshHome().finally(() => (this.homeRefresh = null));
    return this.homeRefresh;
  }

  private async doRefreshHome(): Promise<GameRecord[]> {
    const cached = await gamesRepo.list();
    const previous = this.state.get().badges;
    const keepBlocked = (rec: GameRecord): Badge => {
      const old = previous[rec.id];
      return old && BLOCKED.has(old) ? old : badgeFromRecord(rec);
    };
    const badges: Record<string, Badge> = {};
    for (const rec of cached) badges[rec.id] = keepBlocked(rec);
    this.state.set({ games: cached, badges });
    const conn = this.connection();
    if (conn.status !== 'online') return cached;

    const kv = await conn.kv().catch(() => null);
    if (!kv) return cached;
    const engine = getEngine();
    const blocked: Record<string, Badge> = {};
    const fresh = new Set<string>();
    await Promise.all(
      cached.map(async (rec) => {
        try {
          const store = new GameStore({ kv, sealer: await createSealer(rec.id, rec.secret), id: rec.id, engine });
          const local = rec.doc ? { doc: rec.doc, revision: rec.revision } : null;
          const res = await store.load(local);
          if (res.kind === 'ok') {
            await gamesRepo.saveAck(rec.id, res.doc, res.revision, res.lastMoveAt);
            fresh.add(rec.id);
          } else {
            blocked[rec.id] = res.kind === 'unavailable' ? 'unavailable' : 'update-needed';
          }
        } catch {
          // Offline blip or a removed game: keep the cached record.
        }
      }),
    );
    const games = await gamesRepo.list();
    const next: Record<string, Badge> = {};
    for (const rec of games) {
      next[rec.id] = blocked[rec.id] ?? (fresh.has(rec.id) ? badgeFromRecord(rec) : keepBlocked(rec));
    }
    this.state.set({ games, badges: next });
    return games;
  }
}

export const session = new AppSession();
