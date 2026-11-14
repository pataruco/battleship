import { lang } from '../i18n';
import { getPrefs } from '../storage/prefs';

const ES_ORDER = ['es-mx', 'es-us'];

/** ES: `es-MX` > `es-US` > any `es-*`. EN: the device's own `en-*` (e.g. `en-GB`), else any `en-*`. */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  language: 'en' | 'es',
  deviceLangs: readonly string[],
): SpeechSynthesisVoice | null {
  const tag = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  const ofLang = voices.filter((v) => tag(v).split('-')[0] === language);
  if (!ofLang.length) return null;
  const find = (want: string) => ofLang.find((v) => tag(v) === want);
  if (language === 'es') {
    for (const want of ES_ORDER) {
      const v = find(want);
      if (v) return v;
    }
    return ofLang[0]!;
  }
  for (const d of deviceLangs) {
    const v = d.toLowerCase().startsWith('en-') ? find(d.toLowerCase()) : undefined;
    if (v) return v;
  }
  return ofLang[0]!;
}

let cached: SpeechSynthesisVoice[] = [];
let listening = false;

function synth(): SpeechSynthesis | null {
  return typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
}

function loadVoices(): void {
  const s = synth();
  if (!s) return;
  const list = s.getVoices();
  if (list.length) cached = list;
  if (!listening && typeof s.addEventListener === 'function') {
    listening = true;
    // The list often arrives late (`voiceschanged`): cache again and re-pick on every `say`.
    s.addEventListener('voiceschanged', loadVoices);
  }
}

/** Speaks an empty utterance inside the start tap: iOS only allows speech after a gesture. */
export function unlockSpeech(): void {
  const s = synth();
  if (!s || typeof SpeechSynthesisUtterance === 'undefined') return;
  loadVoices();
  try {
    s.speak(new SpeechSynthesisUtterance(''));
  } catch {
    // Speech is a nicety.
  }
}

/** Speaks `text` in the app language, cancelling the previous utterance. No-op: voice off or no matching voice. */
export function say(text: string): void {
  const s = synth();
  if (!s || !text || !getPrefs().voice || typeof SpeechSynthesisUtterance === 'undefined') return;
  loadVoices();
  const language = lang();
  const voice = pickVoice(cached, language, typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]));
  if (!voice) return;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    s.speak(u);
  } catch {
    // Speech is a nicety.
  }
}
