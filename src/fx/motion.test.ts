// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { animate } from './motion';

afterEach(() => vi.unstubAllGlobals());

describe('animate', () => {
  it('under reduced motion fades 150 ms to the keyframes peak, not first-to-last', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const el = document.createElement('div');
    const spy = vi.fn(() => ({}) as Animation);
    el.animate = spy as never;
    animate(el, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 2000 });
    expect(spy).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: 150, fill: 'none' });
  });
  it('passes keyframes through when motion is allowed', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const el = document.createElement('div');
    const spy = vi.fn(() => ({}) as Animation);
    el.animate = spy as never;
    const kf = [{ opacity: 0 }, { opacity: 1 }];
    animate(el, kf, { duration: 10 });
    expect(spy).toHaveBeenCalledWith(kf, { duration: 10 });
  });
});
