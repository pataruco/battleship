// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderUnavailable } from './unavailable';

describe('renderUnavailable', () => {
  it('a bad link → a friendly screen with Start a new game and Home', async () => {
    const root = document.createElement('main');
    const onNewGame = vi.fn(async () => {});
    renderUnavailable(root, { kind: 'not-found', onNewGame });
    expect(root.querySelector('h1')?.textContent).toBe("This link doesn't work");
    const start = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Start a new game'))!;
    expect(start).toBeDefined();
    start.click();
    expect(onNewGame).toHaveBeenCalledOnce();
    expect(root.querySelector('a[href="#/"]')).not.toBeNull();
  });
});
