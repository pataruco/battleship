import { createSealer } from '../crypto/seal';
import { getEngine } from '../engine/engine';
import { GameStore } from '../net/game-store';
import { Connection, type ConnStatus } from '../net/nats';
import { natsConfig } from '../net/config';
import type { Profile } from '../game/types';
import { gamesRepo, type GameRecord } from '../storage/games-repo';
import { Store } from './store';

export type Badge = 'your-turn' | 'their-turn' | 'setup' | 'over' | 'update-needed' | 'unavailable';

/** Task 15 fills this in (placement, battle, presence). */
export interface GameController {
  readonly id: string;
}

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

export class AppSession {
  readonly state = new Store<AppState>({ status: 'offline', profile: null, games: null, badges: {} });
  private conn: Connection | null = null;

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

  openGame(_id: string, _secret: string): Promise<GameController> {
    return Promise.reject(new Error('not_implemented'));
  }

  /**
   * Cached games right away; when online, re-reads each from the server so the badges are
   * fresh. A failed read keeps that game's cached record.
   */
  async refreshHome(): Promise<GameRecord[]> {
    const cached = await gamesRepo.list();
    const badges: Record<string, Badge> = {};
    const blocked: Record<string, Badge> = {};
    for (const rec of cached) badges[rec.id] = badgeFromRecord(rec);
    this.state.set({ games: cached, badges });
    const conn = this.connection();
    if (conn.status !== 'online') return cached;

    const kv = await conn.kv().catch(() => null);
    if (!kv) return cached;
    const engine = getEngine();
    await Promise.all(
      cached.map(async (rec) => {
        try {
          const store = new GameStore({ kv, sealer: await createSealer(rec.id, rec.secret), id: rec.id, engine });
          const local = rec.doc ? { doc: rec.doc, revision: rec.revision } : null;
          const res = await store.load(local);
          if (res.kind === 'ok') {
            await gamesRepo.saveAck(rec.id, res.doc, res.revision, res.lastMoveAt);
          } else {
            blocked[rec.id] = res.kind === 'unavailable' ? 'unavailable' : 'update-needed';
          }
        } catch {
          // Offline blip or a removed game: keep the cached record.
        }
      }),
    );
    const fresh = await gamesRepo.list();
    for (const rec of fresh) {
      if (blocked[rec.id]) badges[rec.id] = blocked[rec.id];
      else badges[rec.id] = badgeFromRecord(rec);
    }
    this.state.set({ games: fresh, badges });
    return fresh;
  }
}

export const session = new AppSession();
