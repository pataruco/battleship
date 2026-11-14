import { t } from '../../i18n';
import { el } from '../el';
import { symbolIcon } from '../../theme/default/avatars';

/** Filled in by Task 18: unlock `AudioContext` (and `navigator.audioSession`) inside the tap. */
export function unlockAudio(): void {}
/** Filled in by Task 18: a silent utterance inside the tap unlocks `speechSynthesis` on iOS. */
export function unlockSpeech(): void {}

/** One big tap on every cold open (R6). Calls `onStart` after unlocking audio and speech. */
export function renderStart(app: HTMLElement, onStart: () => void): () => void {
  const build = () => {
    const button = el(
      'button',
      { type: 'button', class: 'start-button' },
      symbolIcon('boom', 'start-art'),
      el('span', { class: 'start-title' }, t().appName),
      el('span', { class: 'start-hint' }, t().tapToStart),
    );
    button.addEventListener('click', () => {
      unlockAudio();
      unlockSpeech();
      onStart();
    });
    app.replaceChildren(button);
    button.focus();
  };
  build();
  window.addEventListener('lang', build);
  return () => window.removeEventListener('lang', build);
}
