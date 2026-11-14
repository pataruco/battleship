import { compareDocs } from '../game/compare';
import type { GameDoc, Profile, SeatIndex, Ship } from '../game/types';
import { reqP, withDb } from './idb';

export type GameRecord = {
  id: string;
  secret: string;
  seat: SeatIndex | null;
  doc: GameDoc | null;
  revision: number;
  seq: number;
  opponent: { name: string; avatar: string } | null;
  shared: boolean;
  /** The one-time "keep this game safe" card was shown on this device (spec §13 nudge 3). */
  nudgeShown?: boolean;
  addedAt: number;
  lastMoveAt: number | null;
};

/** One request in its own transaction, retried once on a reopened connection. */
function one<T>(name: string, mode: IDBTransactionMode, req: (os: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return withDb((db) => reqP(req(db.transaction(name, mode).objectStore(name))));
}

export const gamesRepo = {
  async list(): Promise<GameRecord[]> {
    const all = await one('games', 'readonly', (os) => os.getAll() as IDBRequest<GameRecord[]>);
    const key = (r: GameRecord) => r.lastMoveAt ?? r.addedAt;
    return all.sort((a, b) => key(b) - key(a));
  },

  async get(id: string): Promise<GameRecord | null> {
    return (await one('games', 'readonly', (os) => os.get(id) as IDBRequest<GameRecord | undefined>)) ?? null;
  },

  async put(rec: GameRecord): Promise<void> {
    await one('games', 'readwrite', (os) => os.put(rec));
  },

  async remove(id: string): Promise<void> {
    await one('games', 'readwrite', (os) => os.delete(id));
  },

  /** Sets device-only flags in one transaction (never touches the cached doc). False if unknown. */
  patch(id: string, flags: Partial<Pick<GameRecord, 'shared' | 'nudgeShown'>>): Promise<boolean> {
    return withDb(async (db) => {
      const os = db.transaction('games', 'readwrite').objectStore('games');
      const rec = await reqP(os.get(id) as IDBRequest<GameRecord | undefined>);
      if (!rec) return false;
      await reqP(os.put({ ...rec, ...flags }));
      return true;
    });
  },

  /** Stores only a doc at least as new as the stored one. Returns whether it stored. */
  saveAck(id: string, doc: GameDoc, revision: number, lastMoveAt: number | null): Promise<boolean> {
    return withDb(async (db) => {
      const os = db.transaction('games', 'readwrite').objectStore('games');
      const rec = await reqP(os.get(id) as IDBRequest<GameRecord | undefined>);
      if (!rec) throw new Error('unknown_game');
      if (rec.doc && compareDocs(doc, rec.doc) < 0) return false;
      const other = rec.seat === null ? null : doc.seats[rec.seat === 0 ? 1 : 0];
      await reqP(
        os.put({
          ...rec,
          doc,
          revision,
          seq: doc.seq,
          lastMoveAt,
          opponent: rec.seat === null ? rec.opponent : other && { name: other.name, avatar: other.avatar },
        }),
      );
      return true;
    });
  },
};

export const profileRepo = {
  async get(): Promise<Profile | null> {
    return (await one('profile', 'readonly', (os) => os.get('me') as IDBRequest<Profile | undefined>)) ?? null;
  },
  async put(p: Profile): Promise<void> {
    await one('profile', 'readwrite', (os) => os.put(p, 'me'));
  },
};

export const fleetRepo = {
  async getLast(): Promise<Ship[] | null> {
    return (await one('fleets', 'readonly', (os) => os.get('last') as IDBRequest<Ship[] | undefined>)) ?? null;
  },
  async putLast(f: Ship[]): Promise<void> {
    await one('fleets', 'readwrite', (os) => os.put(f, 'last'));
  },
};
