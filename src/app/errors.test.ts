import { describe, expect, it, vi } from 'vitest';
import { logError, recentErrors } from './errors';

describe('logError', () => {
  it('keeps the last 20 errors, newest last', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (let i = 0; i < 25; i++) logError(new Error(`e${i}`));
    logError('plain');
    const list = recentErrors();
    expect(list).toHaveLength(20);
    expect(list[0]?.message).toBe('Error: e6');
    expect(list.at(-1)?.message).toBe('plain');
  });
});
