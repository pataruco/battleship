import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameDoc, Profile } from '../game/types';
import { closeDb, openDb } from './idb';
import { fleetRepo, type GameRecord, gamesRepo, profileRepo } from './games-repo';

const me: Profile = { playerId: 'p0', name: 'Ana', avatar: 'fish' };
const you: Profile = { playerId: 'p1', name: 'Bo', avatar: 'crab' };

function doc(seq: number, shots0: number[] = [], round = 1): GameDoc {
  return {
    v: 1, id: 'g', seq, engine: 1, seats: [me, you], round, score: [0, 0],
    phase: 'battle', fleets: [null, null], ready: [true, true],
    shots: [shots0, []], turn: 0, firstTurn: 0, winner: null,
    rematch: [false, false], reactions: [null, null],
  };
}

function rec(id: string, over: Partial<GameRecord> = {}): GameRecord {
  return {
    id, secret: 's', seat: 0, doc: null, revision: 0, seq: 0, opponent: null,
    shared: false, addedAt: 100, lastMoveAt: null, ...over,
  };
}

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('gamesRepo', () => {
  it('patch sets device flags and keeps the cached doc', async () => {
    await gamesRepo.put(rec('a', { doc: doc(5), seq: 5 }));
    expect(await gamesRepo.patch('a', { nudgeShown: true })).toBe(true);
    const got = await gamesRepo.get('a');
    expect(got?.nudgeShown).toBe(true);
    expect(got?.doc?.seq).toBe(5);
    expect(await gamesRepo.patch('missing', { shared: true })).toBe(false);
  });

  it('puts, gets and removes', async () => {
    await gamesRepo.put(rec('a'));
    expect((await gamesRepo.get('a'))?.id).toBe('a');
    await gamesRepo.remove('a');
    expect(await gamesRepo.get('a')).toBeNull();
  });

  it('lists newest lastMoveAt ?? addedAt first', async () => {
    await gamesRepo.put(rec('old', { addedAt: 1 }));
    await gamesRepo.put(rec('moved', { addedAt: 2, lastMoveAt: 500 }));
    await gamesRepo.put(rec('new', { addedAt: 300 }));
    expect((await gamesRepo.list()).map((r) => r.id)).toEqual(['moved', 'new', 'old']);
  });

  it('saveAck stores a newer doc and derives seq and opponent', async () => {
    await gamesRepo.put(rec('g'));
    expect(await gamesRepo.saveAck('g', doc(3), 7, 900)).toBe(true);
    const r = await gamesRepo.get('g');
    expect(r).toMatchObject({ revision: 7, seq: 3, lastMoveAt: 900, opponent: { name: 'Bo', avatar: 'crab' } });
  });

  it('saveAck uses the other seat as opponent for seat 1', async () => {
    await gamesRepo.put(rec('g', { seat: 1 }));
    await gamesRepo.saveAck('g', doc(1), 1, null);
    expect((await gamesRepo.get('g'))?.opponent).toEqual({ name: 'Ana', avatar: 'fish' });
  });

  it('saveAck leaves opponent unchanged when seat is null', async () => {
    const opp = { name: 'Zed', avatar: 'x' };
    await gamesRepo.put(rec('g', { seat: null, opponent: opp }));
    await gamesRepo.saveAck('g', doc(1), 1, null);
    expect((await gamesRepo.get('g'))?.opponent).toEqual(opp);
  });

  it('saveAck refuses an older doc', async () => {
    await gamesRepo.put(rec('g'));
    await gamesRepo.saveAck('g', doc(5, [1, 2]), 9, 1);
    expect(await gamesRepo.saveAck('g', doc(9, [1]), 10, 2)).toBe(false);
    expect(await gamesRepo.saveAck('g', doc(2, [1, 2], 0), 10, 2)).toBe(false);
    const r = await gamesRepo.get('g');
    expect(r?.revision).toBe(9);
    expect(r?.seq).toBe(5);
  });

  it('saveAck accepts an equal doc', async () => {
    await gamesRepo.put(rec('g'));
    await gamesRepo.saveAck('g', doc(5), 9, 1);
    expect(await gamesRepo.saveAck('g', doc(5), 10, 2)).toBe(true);
    expect((await gamesRepo.get('g'))?.revision).toBe(10);
  });

  it('saveAck throws unknown_game without a record', async () => {
    await expect(gamesRepo.saveAck('nope', doc(1), 1, null)).rejects.toThrow('unknown_game');
  });
});

describe('profileRepo and fleetRepo', () => {
  it('round trips the profile', async () => {
    expect(await profileRepo.get()).toBeNull();
    await profileRepo.put(me);
    expect(await profileRepo.get()).toEqual(me);
  });
  it('round trips the last fleet', async () => {
    expect(await fleetRepo.getLast()).toBeNull();
    const f = [{ bow: 0, dir: 'h' as const }];
    await fleetRepo.putLast(f);
    expect(await fleetRepo.getLast()).toEqual(f);
  });
});

describe('a closed connection', () => {
  it('the next read and write reopen the database', async () => {
    await gamesRepo.put(rec('a', { doc: doc(1), seq: 1 }));
    (await openDb()).close();
    expect((await gamesRepo.list()).map((r) => r.id)).toEqual(['a']);
    (await openDb()).close();
    expect(await gamesRepo.saveAck('a', doc(2, [3]), 2, 50)).toBe(true);
    (await openDb()).close();
    expect((await gamesRepo.get('a'))?.seq).toBe(2);
    (await openDb()).close();
    await gamesRepo.remove('a');
    expect(await gamesRepo.list()).toEqual([]);
  });

  it('a versionchange from another tab closes and forgets the connection', async () => {
    const first = await openDb();
    let closed = false;
    const close = first.close.bind(first);
    first.close = () => {
      closed = true;
      close();
    };
    first.onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent);
    expect(closed).toBe(true);
    expect(await openDb()).not.toBe(first);
  });
});
