import { describe, expect, it } from 'vitest';
import { injectSw } from './sw-plugin';

const SRC = 'const BUILD_ID = __BUILD_ID__;\nconst PRECACHE = __PRECACHE__;';

describe('injectSw', () => {
  it('replaces both placeholders with JSON values', () => {
    const out = injectSw(SRC, 'abc-1', ['./', 'assets/a.js']);
    expect(out).toBe('const BUILD_ID = "abc-1";\nconst PRECACHE = ["./","assets/a.js"];');
  });
  it('throws when a placeholder is missing', () => {
    expect(() => injectSw('const PRECACHE = __PRECACHE__;', 'x', [])).toThrow(/__BUILD_ID__/);
    expect(() => injectSw('const BUILD_ID = __BUILD_ID__;', 'x', [])).toThrow(/__PRECACHE__/);
  });
});
