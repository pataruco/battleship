import { getPrefs, setPrefs } from '../storage/prefs';
import { en, type Messages } from './en';
import { es } from './es';

export type { Messages } from './en';
export { en, es };
export type Lang = 'en' | 'es';

/** A saved choice wins; otherwise the first device language we ship (`es-*` → es), else English. */
export function pickLang(saved: Lang | null, languages: readonly string[]): Lang {
  if (saved) return saved;
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }
  return 'en';
}

let current: Lang = 'en';
const table: Record<Lang, Messages> = { en, es };

function apply(l: Lang): void {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'es' ? 'es-419' : 'en';
}

/** Applies the saved or device language at boot (does not persist it). */
export function initLang(): Lang {
  const langs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  apply(pickLang(getPrefs().lang, langs));
  return current;
}

export function lang(): Lang {
  return current;
}

export function t(): Messages {
  return table[current];
}

export function setLang(l: Lang): void {
  apply(l);
  setPrefs({ lang: l });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('lang'));
}
