import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';
import { pickLang } from './index';

describe('i18n', () => {
  it('has the same keys in en and es', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it('has no empty strings', () => {
    for (const m of [en, es]) {
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === 'string') expect(v.trim(), k).not.toBe('');
      }
    }
  });
  it('picks the device language unless one was saved', () => {
    expect(pickLang(null, ['es-MX'])).toBe('es');
    expect(pickLang(null, ['fr', 'es-419'])).toBe('es');
    expect(pickLang(null, ['fr'])).toBe('en');
    expect(pickLang('en', ['es'])).toBe('en');
    expect(pickLang('es', ['en-GB'])).toBe('es');
  });
  it('formats relative times in the language', () => {
    expect(es.ago(-2 * 86400e3)).toContain('2 días');
    expect(en.ago(-2 * 86400e3)).toContain('2 days');
    expect(en.ago(-5 * 60e3)).toContain('5 minutes');
  });
  it('names ships in both languages', () => {
    expect(en.shipName(0)).toBe('Flagship');
    expect(es.shipName(4)).toBe('Bote');
  });
});
