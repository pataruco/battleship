import type { Seat, SeatIndex } from '../../game/types';
import { t } from '../../i18n';
import { avatarIcon } from '../../theme/default/avatars';
import { el } from '../el';

export type WhoOptions = {
  seats: [Seat, Seat];
  /** Was that seat heard from just now (presence)? */
  isHere: (seat: SeatIndex) => boolean;
  onClaim: (seat: SeatIndex) => void;
};

/** Both seats taken, this device unknown: tap your picture (spec §8). Claiming is local only. */
export function renderWho(root: HTMLElement, o: WhoOptions): void {
  const m = t();
  const question = el('p', {});
  const yes = el('button', { type: 'button', class: 'big primary', value: 'yes' }, m.thatsMe);
  const no = el('button', { type: 'button', class: 'big', value: 'no' }, m.cancel);
  const dialog = el('dialog', { class: 'confirm' }, question, el('div', { class: 'confirm-actions' }, yes, no));
  let asked: SeatIndex | null = null;
  yes.addEventListener('click', () => {
    dialog.close();
    if (asked !== null) o.onClaim(asked);
  });
  no.addEventListener('click', () => dialog.close());

  const pick = (seat: SeatIndex) => {
    const p = o.seats[seat];
    const b = el('button', { type: 'button', class: 'who-pick' }, avatarIcon(p.avatar, 'avatar'), el('span', {}, p.name));
    b.addEventListener('click', () => {
      // Someone is playing as this seat right now: a gentle "are you sure?" first.
      if (!o.isHere(seat)) return o.onClaim(seat);
      asked = seat;
      question.textContent = t().areYouSure(p.name);
      dialog.showModal();
    });
    return b;
  };

  root.replaceChildren(
    el(
      'section',
      { class: 'screen who' },
      el('h1', {}, m.whoAreYou),
      el('p', {}, m.whoTap),
      el('div', { class: 'who-seats' }, pick(0), pick(1)),
      dialog,
    ),
  );
}
