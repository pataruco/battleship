import { t } from '../../i18n';
import { getPrefs, setPrefs } from '../../storage/prefs';
import { el } from '../el';
import { canInstall, isIosSafari, onInstallChange, promptInstall } from '../pwa';

/**
 * Home Screen nudges, placed after the game list so they never cover a control. The one-time hint
 * (dismissible, firmer in iOS Safari) and, where the browser offers it, an Install button.
 * Returns the node and a disposer.
 */
export function installHint(): { node: HTMLElement; dispose: () => void } {
  const node = el('div', { class: 'install' });
  // Shown once: remembered as soon as it appears, and kept on screen until dismissed or left.
  let showHint = !getPrefs().installHintShown && (isIosSafari() || canInstall());
  if (showHint) setPrefs({ installHintShown: true });
  const paint = () => {
    const m = t();
    const parts: HTMLElement[] = [];
    if (canInstall()) {
      const install = el('button', { type: 'button' }, el('span', { 'aria-hidden': 'true' }, '📲'), ` ${m.installButton}`);
      install.addEventListener('click', () => void promptInstall());
      parts.push(install);
    }
    if (showHint) {
      const gotIt = el('button', { type: 'button' }, m.gotIt);
      gotIt.addEventListener('click', () => {
        showHint = false;
        paint();
      });
      parts.push(
        el(
          'aside',
          { class: isIosSafari() ? 'install-hint firm' : 'install-hint', 'aria-label': m.installButton },
          el('span', { 'aria-hidden': 'true' }, '⬆️📱'),
          el('p', {}, m.installHint),
          gotIt,
        ),
      );
    }
    node.replaceChildren(...parts);
  };
  paint();
  const stop = onInstallChange(paint);
  window.addEventListener('lang', paint);
  return {
    node,
    dispose: () => {
      stop();
      window.removeEventListener('lang', paint);
    },
  };
}
