import { describe, expect, it } from 'vitest';
import { getPrefs, setPrefs } from './prefs';

function memStore(initial?: string) {
  const m = new Map<string, string>();
  if (initial !== undefined) m.set('bship.prefs', initial);
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('prefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getPrefs(memStore())).toEqual({ lang: null, sound: true, voice: true, installHintShown: false });
  });
  it('merges patches and persists them', () => {
    const s = memStore();
    setPrefs({ lang: 'es' }, s);
    setPrefs({ sound: false }, s);
    expect(getPrefs(s)).toEqual({ lang: 'es', sound: false, voice: true, installHintShown: false });
  });
  it('falls back to defaults on corrupt JSON', () => {
    expect(getPrefs(memStore('{nope'))).toEqual({ lang: null, sound: true, voice: true, installHintShown: false });
  });
  it('ignores wrongly typed stored fields', () => {
    const s = memStore(JSON.stringify({ lang: 'fr', sound: 'x', voice: false, installHintShown: false }));
    expect(getPrefs(s)).toEqual({ lang: null, sound: true, voice: false, installHintShown: false });
  });
  it('never throws when storage is blocked or full', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(getPrefs(blocked)).toEqual({ lang: null, sound: true, voice: true, installHintShown: false });
    expect(() => setPrefs({ sound: false }, blocked)).not.toThrow();
  });
  it('never throws when localStorage is missing', () => {
    expect(getPrefs()).toEqual({ lang: null, sound: true, voice: true, installHintShown: false });
    expect(() => setPrefs({ sound: false })).not.toThrow();
  });
});
