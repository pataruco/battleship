import { t } from '../../i18n';
import { el } from '../el';
import { unlockAudio } from '../../fx/audio';
import { unlockSpeech } from '../../fx/speech';
import { symbolIcon } from '../../theme/default/avatars';

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
