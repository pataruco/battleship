import { t } from '../../i18n';
import { gamesRepo } from '../../storage/games-repo';
import { el } from '../el';
import { logError } from '../errors';
import { copyText } from './invite';

/** Share sheet when there is one, else copy. True when the link left the device. */
export async function shareLink(link: string, myName: string): Promise<boolean> {
  const m = t();
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: m.appName, text: m.shareText(myName), url: link });
      return true;
    } catch {
      return false; // cancelled
    }
  }
  await copyText(link);
  return true;
}

export type KeepSafeOptions = { id: string; link: string; myName: string; onShared: () => void };

/**
 * Spec §13 nudge 3: the first time a round starts on a device that never shared or copied this
 * game's link, a one-time "Keep this game safe: send it to a grown-up" card with Share.
 */
export async function maybeKeepSafe(root: HTMLElement, o: KeepSafeOptions): Promise<void> {
  const rec = await gamesRepo.get(o.id).catch(() => null);
  if (!rec || rec.shared || rec.nudgeShown || !root.isConnected) return;
  await gamesRepo.patch(o.id, { nudgeShown: true }).catch(logError);
  const m = t();
  const share = el('button', { type: 'button', class: 'big primary' }, el('span', { 'aria-hidden': 'true' }, '📤'), ` ${m.share}`);
  const later = el('button', { type: 'button', class: 'big' }, m.gotIt);
  const dialog = el(
    'dialog',
    { class: 'confirm keep-safe', 'aria-labelledby': 'keep-safe-title' },
    el('p', { id: 'keep-safe-title' }, m.keepSafe),
    el('div', { class: 'confirm-actions' }, share, later),
  );
  share.addEventListener('click', async () => {
    if (await shareLink(o.link, o.myName)) {
      o.onShared();
      dialog.close();
    }
  });
  later.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  root.append(dialog);
  dialog.showModal();
}
