import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { injectSw, makeBuildId, precacheList } from './sw-plugin';

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

describe('precacheList', () => {
  it('lists every file but sw.js and maps, relative, with ./ first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bship-dist-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '');
    writeFileSync(join(dir, 'sw.js'), '');
    writeFileSync(join(dir, 'assets', 'a.js'), '');
    writeFileSync(join(dir, 'assets', 'a.js.map'), '');
    expect(precacheList(dir)).toEqual(['./', 'assets/a.js', 'index.html']);
  });
});

describe('makeBuildId', () => {
  it('is a sha and a compact UTC timestamp', () => {
    const id = makeBuildId(new Date('2026-11-14T10:15:00.123Z'));
    expect(id).toMatch(/^[0-9a-z]+-20261114T101500Z$/);
  });
});
