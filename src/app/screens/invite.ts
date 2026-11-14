import { t } from '../../i18n';
import '../../ui/qr-code';
import { el } from '../el';

/**
 * iOS Safari, not the Home Screen app (spec §13 iOS caveat, Review 8). iPadOS Safari reports a
 * Mac user agent, so a touch "Mac" counts as an iPad.
 */
export function isIosSafari(nav: Navigator = navigator): boolean {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  return ios && (nav as Navigator & { standalone?: boolean }).standalone !== true;
}

/** Copies `text`; when the clipboard is blocked, shows it in a prompt to copy by hand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt(t().copyFailed, text);
    return false;
  }
}

function icon(emoji: string): HTMLSpanElement {
  return el('span', { 'aria-hidden': 'true' }, emoji);
}

/**
 * "Copy for the app" for iOS Safari, as prominent as the main action (Review 8), with its
 * hint. Empty elsewhere.
 */
export function copyForApp(link: string, onCopied: () => void, status: HTMLElement): HTMLElement[] {
  if (!isIosSafari()) return [];
  const m = t();
  const button = el('button', { type: 'button', class: 'big primary' }, icon('📲'), ` ${m.copyForApp}`);
  button.addEventListener('click', async () => {
    if (await copyText(link)) status.textContent = t().copied;
    onCopied();
  });
  return [button, el('p', { class: 'hint' }, m.playingInApp)];
}

export type InviteOptions = {
  link: string;
  hostName: string;
  /** The link left this device (Share, Copy link, Copy for the app). */
  onShared: () => void;
  onPlace: () => void;
};

/** Host waiting for a guest: QR, Share as prominent as the QR, Copy link, Place my ships. */
export function renderInvite(root: HTMLElement, o: InviteOptions): void {
  const m = t();
  const status = el('p', { class: 'status', role: 'status' });

  const qr = el('qr-code', { class: 'invite-qr', text: o.link, label: m.qrAlt });
  const actions: HTMLElement[] = [];
  if (typeof navigator.share === 'function') {
    const share = el('button', { type: 'button', class: 'big primary' }, icon('📤'), ` ${m.share}`);
    share.addEventListener('click', async () => {
      try {
        await navigator.share({ title: m.appName, text: m.shareText(o.hostName), url: o.link });
        o.onShared();
      } catch {
        // Cancelled share sheet: nothing left the device.
      }
    });
    actions.push(share);
  }
  const copy = el('button', { type: 'button', class: 'big', 'data-link': o.link }, icon('📋'), ` ${m.copyLink}`);
  copy.addEventListener('click', async () => {
    if (await copyText(o.link)) status.textContent = t().copied;
    o.onShared();
  });
  actions.push(copy, ...copyForApp(o.link, o.onShared, status));

  const place = el('button', { type: 'button', class: 'big' }, icon('🚢'), ` ${m.placeMyShips}`);
  place.addEventListener('click', o.onPlace);

  root.replaceChildren(
    el(
      'section',
      { class: 'screen invite' },
      el('h1', {}, m.inviteTitle),
      el('p', {}, m.inviteBody),
      el('div', { class: 'invite-share' }, qr, el('div', { class: 'invite-actions' }, ...actions)),
      status,
      el('p', { class: 'waiting', 'aria-live': 'polite' }, m.waitingForFriend),
      place,
    ),
  );
}
