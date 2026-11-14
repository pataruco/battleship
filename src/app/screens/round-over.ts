import type { SeatIndex } from '../../game/types';
import { say } from '../../fx/speech';
import { t } from '../../i18n';
import '../../ui/sea-grid';
import { safeBoardCells } from '../board-cells';
import { el, liveRegion } from '../el';
import type { ControllerState } from '../game-controller';
import type { GameView, GameViewOptions } from './game';

/**
 * A win celebration or a gentle "Good game!", the score, and a pulsing Play again. On the
 * loser's screen, the winner's surviving ships are revealed.
 */
export function renderRoundOver(root: HTMLElement, o: GameViewOptions): GameView {
  const m = t();
  const { c } = o;
  const seat = c.state.seat as SeatIndex;
  const foe = (1 - seat) as SeatIndex;
  const doc = c.state.doc!;
  const won = doc.winner === seat;

  const headline = won ? m.youWon : m.goodGame;
  const score = el('p', { class: 'score' });
  const again = el('button', { type: 'button', class: 'big primary play-again' }, el('span', { 'aria-hidden': 'true' }, '🔁'), ` ${m.playAgain}`);
  const note = el('p', { class: 'waiting', hidden: true });
  const live = liveRegion('sr');

  const kids: Node[] = [
    el('h1', { class: won ? 'win' : 'lose' }, el('span', { 'aria-hidden': 'true' }, won ? '🎉' : '🤝'), ` ${headline}`),
    score,
  ];
  const winner = doc.winner;
  if (!won && winner !== null) {
    // Where their ships were hiding: the winner's fleet against my shots, revealed.
    const reveal = el('sea-grid', { class: 'reveal' });
    reveal.mode = 'own';
    reveal.label = m.revealHint;
    reveal.cells = safeBoardCells(doc.fleets[winner], doc.shots[seat], true);
    kids.push(el('h2', {}, m.revealHint), reveal);
  }
  kids.push(again, note, el('a', { class: 'big', href: '#/' }, el('span', { 'aria-hidden': 'true' }, '🏠'), ` ${m.home}`), live.node);

  again.addEventListener('click', () => void o.act({ type: 'rematch', seat }));

  function update(s: ControllerState): void {
    const d = s.doc;
    if (!d || d.phase !== 'over') return;
    const mm = t();
    const me = d.seats[seat];
    const other = d.seats[foe];
    score.textContent = mm.score(me?.name ?? '', d.score[seat], other?.name ?? '', d.score[foe]);
    const mine = d.rematch[seat];
    again.disabled = mine || s.pending;
    again.classList.toggle('pulse', !mine);
    note.hidden = !mine && !d.rematch[foe];
    note.textContent = mine ? mm.rematchWaiting(other?.name ?? '') : d.rematch[foe] ? mm.rematchAsked(other?.name ?? '') : '';
  }

  root.replaceChildren(el('section', { class: `screen round-over ${won ? 'won' : 'lost'}` }, ...kids));
  update(c.state);
  live.say(`${headline} ${score.textContent ?? ''}`);
  // The winner heard it at the winning shot; the other player hears a kind "Good game!".
  if (!won) say(headline);
  return { update, dispose: () => {} };
}
