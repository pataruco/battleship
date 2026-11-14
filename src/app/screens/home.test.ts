// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnStatus } from '../../net/nats';
import { closeDb } from '../../storage/idb';
import { gamesRepo, type GameRecord } from '../../storage/games-repo';
import { Store } from '../store';
import type { AppState } from '../session';

vi.mock('../pwa', () => ({
  isIosSafari: () => false,
  canInstall: () => false,
  promptInstall: async () => {},
  onInstallChange: () => () => {},
}));

const fake = vi.hoisted(() => ({ session: {} as { state: Store<AppState>; refreshHome: () => Promise<GameRecord[]> } }));
vi.mock('../session', () => ({ session: fake.session }));

import { renderHome } from './home';

const settle = () => new Promise((r) => setTimeout(r, 20));

function rec(id: string, name: string, addedAt: number): GameRecord {
  return {
    id,
    secret: 'AAAAAAAAAAAAAAAAAAAAAA',
    seat: 0,
    doc: null,
    revision: 1,
    seq: 1,
    opponent: { name, avatar: 'crab' },
    shared: false,
    addedAt,
    lastMoveAt: null,
  };
}

let app: HTMLElement;
let stop: (() => void) | undefined;

beforeEach(async () => {
  stop?.();
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  const state = new Store<AppState>({ status: 'online', profile: null, games: null, badges: {} });
  // Home's refresh, minus the network: the list from this device.
  fake.session.state = state;
  fake.session.refreshHome = vi.fn(async () => {
    const games = await gamesRepo.list();
    state.set({ games });
    return games;
  });
  document.body.replaceChildren();
  app = document.createElement('main');
  document.body.append(app);
});

async function mount(): Promise<void> {
  stop = renderHome(app, { profile: null, onNewGame: async () => {} });
  await settle();
}

const cards = () => [...app.querySelectorAll<HTMLAnchorElement>('a.card')].map((a) => a.querySelector('strong')?.textContent);

describe('Home: remove from my list', () => {
  it('each card has a Remove button named after the opponent; confirming removes it from this device only', async () => {
    await gamesRepo.put(rec('a', 'Dad', 2));
    await gamesRepo.put(rec('b', 'Mia', 1));
    await mount();
    expect(cards()).toEqual(['Dad', 'Mia']);

    const remove = app.querySelector<HTMLButtonElement>('button[aria-label="Remove game with Mia"]')!;
    expect(remove).not.toBeNull();
    expect(remove.textContent).toContain('Remove');
    remove.click();
    const dialog = app.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Mia');

    dialog.querySelector<HTMLButtonElement>('button.danger')!.click();
    await settle();
    expect(dialog.open).toBe(false);
    expect(await gamesRepo.get('b')).toBeNull();
    expect(await gamesRepo.get('a')).not.toBeNull();
    expect(cards()).toEqual(['Dad']);
  });

  it('Cancel keeps the game', async () => {
    await gamesRepo.put(rec('a', 'Dad', 2));
    await mount();
    app.querySelector<HTMLButtonElement>('button[aria-label="Remove game with Dad"]')!.click();
    const dialog = app.querySelector('dialog')!;
    dialog.querySelector<HTMLButtonElement>('button.cancel')!.click();
    await settle();
    expect(dialog.open).toBe(false);
    expect(await gamesRepo.get('a')).not.toBeNull();
    expect(cards()).toEqual(['Dad']);
  });
});

describe('Home: connection status line', () => {
  it.each<[ConnStatus, string | null]>([
    ['busy', 'The sea is busy. Trying again soon'],
    ['auth-failed', 'Update needed. Reload the page'],
    ['online', null],
    ['offline', null],
  ])('%s → %s', async (status, text) => {
    await mount();
    fake.session.state.set({ status });
    const line = app.querySelector('.conn-status');
    expect(line?.textContent || null).toBe(text);
  });
});
