export type Prefs = { lang: 'en' | 'es' | null; sound: boolean; voice: boolean; installHintShown: boolean };
type PrefsStore = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'bship.prefs';
const DEFAULTS: Prefs = { lang: null, sound: true, voice: true, installHintShown: false };

/** Never throws: a blocked `localStorage` or a full quota just means defaults / unsaved prefs. */
export function getPrefs(storage?: PrefsStore): Prefs {
  try {
    const raw = JSON.parse((storage ?? globalThis.localStorage).getItem(KEY) ?? 'null') as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
    return {
      lang: raw.lang === 'en' || raw.lang === 'es' ? raw.lang : DEFAULTS.lang,
      sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULTS.sound,
      voice: typeof raw.voice === 'boolean' ? raw.voice : DEFAULTS.voice,
      installHintShown: typeof raw.installHintShown === 'boolean' ? raw.installHintShown : DEFAULTS.installHintShown,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setPrefs(patch: Partial<Prefs>, storage?: PrefsStore): void {
  try {
    (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify({ ...getPrefs(storage), ...patch }));
  } catch {
    // Boot-critical: ignore a blocked store or quota error.
  }
}
