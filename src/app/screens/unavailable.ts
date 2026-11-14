import { t } from '../../i18n';
import { el } from '../el';

export type UnavailableOptions = {
  kind: 'unavailable' | 'update-needed' | 'not-found';
  /** Starts a new game; rejects when that can't happen now (offline). */
  onNewGame: () => Promise<void>;
};

/**
 * "This game can't be opened right now" (R3), "Update needed" for a doc from a newer app, or a bad
 * link (spec §10.4): friendly, with a way on.
 */
export function renderUnavailable(root: HTMLElement, o: UnavailableOptions): void {
  const m = t();
  const icon = (emoji: string) => el('span', { 'aria-hidden': 'true' }, emoji);
  const status = el('p', { class: 'error', role: 'alert' });
  let action: HTMLElement;
  if (o.kind === 'update-needed') {
    action = el('button', { type: 'button', class: 'big primary' }, icon('🔄'), ` ${m.reload}`);
    action.addEventListener('click', () => window.location.reload());
  } else {
    const b = el('button', { type: 'button', class: 'big primary' }, icon('➕'), ` ${m.startNewGame}`);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await o.onNewGame();
      } catch {
        status.textContent = t().offline;
        b.disabled = false;
      }
    });
    action = b;
  }
  const [title, body] =
    o.kind === 'unavailable'
      ? [m.unavailableTitle, m.unavailableBody]
      : o.kind === 'not-found'
        ? [m.notFound, m.notFoundBody]
        : [m.updateNeededTitle, m.updateNeededBody];
  root.replaceChildren(
    el(
      'section',
      { class: 'screen unavailable' },
      el('h1', {}, title),
      el('p', {}, body),
      action,
      status,
      el('a', { class: 'big', href: '#/' }, icon('🏠'), ` ${m.home}`),
    ),
  );
}
