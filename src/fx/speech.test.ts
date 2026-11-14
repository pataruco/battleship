import { describe, expect, it } from 'vitest';
import { pickVoice } from './speech';

const v = (lang: string) => ({ lang, name: lang }) as SpeechSynthesisVoice;

describe('pickVoice', () => {
  it('Spanish prefers es-MX, then es-US, then any es-*', () => {
    expect(pickVoice([v('es-ES'), v('es-US'), v('es-MX')], 'es', [])!.lang).toBe('es-MX');
    expect(pickVoice([v('es-ES'), v('es-US')], 'es', [])!.lang).toBe('es-US');
    expect(pickVoice([v('en-US'), v('es-AR')], 'es', ['en-GB'])!.lang).toBe('es-AR');
  });
  it('English takes the device en-* first, else any en-*', () => {
    const voices = [v('en-US'), v('en-GB'), v('es-MX')];
    expect(pickVoice(voices, 'en', ['en-GB'])!.lang).toBe('en-GB');
    expect(pickVoice(voices, 'en', ['fr-FR', 'en-AU'])!.lang).toBe('en-US');
    expect(pickVoice(voices, 'en', [])!.lang).toBe('en-US');
  });
  it('accepts underscore tags (Android) and returns null when nothing matches', () => {
    expect(pickVoice([v('es_MX')], 'es', [])!.lang).toBe('es_MX');
    expect(pickVoice([v('fr-FR')], 'en', ['en-GB'])).toBeNull();
    expect(pickVoice([], 'es', [])).toBeNull();
  });
});
