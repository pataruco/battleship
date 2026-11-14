import { compareDocs } from '../game/compare';
import type { GameDoc, Profile, SeatIndex, Ship } from '../game/types';
import { openDb, reqP } from './idb';

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

async function store(name: string, mode: IDBTransactionMode) {
  return (await openDb()).transaction(name, mode).objectStore(name);
}

export const gamesRepo = {
  async list(): Promise<GameRecord[]> {
    const all = await reqP((await store('games', 'readonly')).getAll() as IDBRequest<GameRecord[]>);
    const key = (r: GameRecord) => r.lastMoveAt ?? r.addedAt;
    return all.sort((a, b) => key(b) - key(a));
  },

  async get(id: string): Promise<GameRecord | null> {
    return (await reqP((await store('games', 'readonly')).get(id) as IDBRequest<GameRecord | undefined>)) ?? null;
  },

  async put(rec: GameRecord): Promise<void> {
    await reqP((await store('games', 'readwrite')).put(rec));
  },

  async remove(id: string): Promise<void> {
    await reqP((await store('games', 'readwrite')).delete(id));
  },

  /** Sets device-only flags in one transaction (never touches the cached doc). False if unknown. */
  async patch(id: string, flags: Partial<Pick<GameRecord, 'shared' | 'nudgeShown'>>): Promise<boolean> {
    const os = await store('games', 'readwrite');
    const rec = await reqP(os.get(id) as IDBRequest<GameRecord | undefined>);
    if (!rec) return false;
    await reqP(os.put({ ...rec, ...flags }));
    return true;
  },

  /** Stores only a doc at least as new as the stored one. Returns whether it stored. */
  async saveAck(id: string, doc: GameDoc, revision: number, lastMoveAt: number | null): Promise<boolean> {
    const db = await openDb();
    const tx = db.transaction('games', 'readwrite');
    const os = tx.objectStore('games');
    const rec = (await reqP(os.get(id) as IDBRequest<GameRecord | undefined>));
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
  },
};

export const profileRepo = {
  async get(): Promise<Profile | null> {
    return (await reqP((await store('profile', 'readonly')).get('me') as IDBRequest<Profile | undefined>)) ?? null;
  },
  async put(p: Profile): Promise<void> {
    await reqP((await store('profile', 'readwrite')).put(p, 'me'));
  },
};

export const fleetRepo = {
  async getLast(): Promise<Ship[] | null> {
    return (await reqP((await store('fleets', 'readonly')).get('last') as IDBRequest<Ship[] | undefined>)) ?? null;
  },
  async putLast(f: Ship[]): Promise<void> {
    await reqP((await store('fleets', 'readwrite')).put(f, 'last'));
  },
};
