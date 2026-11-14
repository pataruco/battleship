import type { Seat } from '../../game/types';
import { t } from '../../i18n';
import { avatarIcon } from '../../theme/default/avatars';
import { el } from '../el';
import { copyForApp } from './invite';

export type JoinOptions = {
  host: Seat;
  link: string;
  /** Resolves true when the seat was taken (the controller then re-routes). */
  onJoin: () => Promise<boolean>;
  /** "I'm <host>, on another device": claim seat 0 locally. */
  onImHost: () => void;
  onShared: () => void;
};

/** Seat 1 is empty and this device isn't seated: "Join Sam's game!" (spec §8). */
export function renderJoin(root: HTMLElement, o: JoinOptions): void {
  const m = t();
  const status = el('p', { class: 'status', role: 'status' });
  const join = el('button', { type: 'button', class: 'big primary' }, el('span', { 'aria-hidden': 'true' }, '⚓'), ` ${m.joinButton}`);
  join.addEventListener('click', async () => {
    join.disabled = true;
    status.textContent = '';
    if (!(await o.onJoin())) {
      join.disabled = false;
      status.textContent = t().retryBanner;
    }
  });
  const imHost = el('button', { type: 'button', class: 'link' }, m.imHost(o.host.name));
  imHost.addEventListener('click', o.onImHost);

  root.replaceChildren(
    el(
      'section',
      { class: 'screen join' },
      avatarIcon(o.host.avatar, 'avatar hero'),
      el('h1', {}, m.joinTitle(o.host.name)),
      join,
      ...copyForApp(o.link, o.onShared, status),
      status,
      imHost,
    ),
  );
  join.focus();
}
