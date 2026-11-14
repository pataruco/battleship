// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ControllerState } from '../game-controller';

class FakeController extends EventTarget {
  state: ControllerState = {
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
  set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    this.dispatchEvent(new Event('change'));
  }
  dispose(): void {}
  markShared(): Promise<void> {
    return Promise.resolve();
  }
}

const fake = vi.hoisted(() => ({ c: null as unknown as FakeController }));
vi.mock('../session', () => ({ session: { openGame: async () => fake.c, lastGameId: null } }));

import { renderGame } from './game';

const settle = () => new Promise((r) => setTimeout(r, 10));
let stop: () => void = () => {};

afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

describe('game screen banner', () => {
  it('update needed (auth failed) → the banner offers Reload; other banners do not', async () => {
    fake.c = new FakeController();
    const app = document.createElement('main');
    document.body.replaceChildren(app);
    stop = renderGame(app, { id: crypto.randomUUID(), secret: 'AAAAAAAAAAAAAAAAAAAAAA', onNewGame: async () => {} });
    await settle();

    fake.c.set({ banner: 'offline' });
    const banner = app.querySelector<HTMLElement>('.banner')!;
    expect(banner.hidden).toBe(false);
    expect(banner.querySelector<HTMLButtonElement>('button')!.hidden).toBe(true);

    fake.c.set({ banner: 'update-needed' });
    expect(banner.textContent).toContain('Update needed');
    const reload = banner.querySelector<HTMLButtonElement>('button')!;
    expect(reload.hidden).toBe(false);
    expect(reload.textContent).toContain('Reload');
    const spy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    reload.click();
    expect(spy).toHaveBeenCalledOnce();
  });
});
