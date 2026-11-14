export type Prefs = { lang: 'en' | 'es' | null; sound: boolean; voice: boolean };
type PrefsStore = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'bship.prefs';
const DEFAULTS: Prefs = { lang: null, sound: true, voice: true };

export function getPrefs(storage: PrefsStore = globalThis.localStorage): Prefs {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? 'null') as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
    return {
      lang: raw.lang === 'en' || raw.lang === 'es' ? raw.lang : DEFAULTS.lang,
      sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULTS.sound,
      voice: typeof raw.voice === 'boolean' ? raw.voice : DEFAULTS.voice,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setPrefs(patch: Partial<Prefs>, storage: PrefsStore = globalThis.localStorage): void {
  storage.setItem(KEY, JSON.stringify({ ...getPrefs(storage), ...patch }));
}
