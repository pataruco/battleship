// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Emoji } from '../game/types';
import './emoji-bar';

afterEach(() => vi.useRealTimers());

describe('<emoji-bar>', () => {
  it('names each emoji and rests for 3 s after a reaction', () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    const bar = document.createElement('emoji-bar');
    document.body.append(bar);
    bar.nameOf = (e) => (e === '🎉' ? 'Party' : 'Other');
    const sent: Emoji[] = [];
    bar.addEventListener('react', (e) => sent.push((e as CustomEvent<{ emoji: Emoji }>).detail.emoji));
    const buttons = bar.querySelectorAll('button');
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Party');
    buttons[0]!.click();
    buttons[1]!.click();
    expect(sent).toEqual(['🎉']);
    vi.advanceTimersByTime(3000);
    buttons[1]!.click();
    expect(sent).toEqual(['🎉', '😱']);
  });
});
