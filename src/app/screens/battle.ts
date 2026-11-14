import type { Cell, Emoji, GameDoc, Outcome, SeatIndex } from '../../game/types';
import { cellLabel } from '../../game/types';
import { t } from '../../i18n';
import type { ApplyResult } from '../../net/game-store';
import '../../ui/emoji-bar';
import '../../ui/fire-button';
import '../../ui/player-badge';
import '../../ui/sea-grid';
import { safeBoardCells, shipIndexAt } from '../board-cells';
import { el, liveRegion } from '../el';
import type { ControllerState, MovedDetail } from '../game-controller';
import type { GameView, GameViewOptions } from './game';
import { maybeKeepSafe, shareLink } from './keep-safe';

/** Shell flight: FIRE to result is never shorter than this. */
export const FLIGHT_MS = 600;
const FLOAT_MS = 2_000;
/** A winning shot's result stays on screen this long before Round over (shorter under reduced motion). */
export const WIN_HOLD_MS = 1_800;
export const WIN_HOLD_REDUCED_MS = 600;
/** Until presence has had a chance to hear the opponent, show no away line or dot. */
export const PRESENCE_GRACE_MS = 5_000;

function winHoldMs(): number {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced ? WIN_HOLD_REDUCED_MS : WIN_HOLD_MS;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

function icon(emoji: string): HTMLSpanElement {
  return el('span', { 'aria-hidden': 'true' }, emoji);
}

/**
 * Their sea (aim, then FIRE) and my sea (incoming shots), turn banner with presence, results in
 * an aria-live region, the menu and the emoji bar. Updated in place on every change. While a
 * shell is in flight the target board keeps showing the doc from before FIRE, and `busy()`
 * holds the screen until the result has shown (≥ 600 ms).
 *
 * Fx hook (Task 18): the section gets `data-fx` set to the last event (`fire`, `miss`, `hit`,
 * `sunk`, `win`, `fizzle`, `incoming-…`, `react`), and the controller's `moved` events are
 * available to any layer.
 */
export function renderBattle(root: HTMLElement, o: GameViewOptions): GameView {
  const m = t();
  const { c } = o;
  const seat = c.state.seat as SeatIndex;
  const foe = (1 - seat) as SeatIndex;

  const target = el('sea-grid', { class: 'target' });
  const own = el('sea-grid', { class: 'own' });
  own.mode = 'own';
  target.label = m.theirSea;
  own.label = m.mySea;
  const fire = el('fire-button', {});
  fire.label = m.fire;
  const aimText = el('p', { class: 'aim-label' }, m.aimHint);
  const turn = el('player-badge', { class: 'turn' });
  const away = el('p', { class: 'away', hidden: true });
  const live = liveRegion('result');
  const floater = el('p', { class: 'float', 'aria-hidden': 'true', hidden: true });

  const toggle = el(
    'button',
    { type: 'button', class: 'mine-toggle', 'aria-expanded': 'false', 'aria-controls': 'my-sea' },
    icon('🚢'),
    ` ${m.mySea}`,
  );
  const shareAgain = el('button', { type: 'button' }, icon('📤'), ` ${m.shareAgain}`);
  const menu = el(
    'details',
    { class: 'menu' },
    el('summary', {}, icon('☰'), ` ${m.menu}`),
    el('div', { class: 'menu-items' }, shareAgain, el('a', { class: 'big', href: '#/' }, icon('🏠'), ` ${m.home}`)),
  );
  const emojis = el('emoji-bar', { 'data-label': m.react });
  emojis.nameOf = (e) => t().emojiName(e);

  const section = el(
    'section',
    { class: 'screen battle' },
    el('div', { class: 'battle-top' }, turn, menu),
    away,
    el(
      'div',
      { class: 'battle-boards' },
      el('div', { class: 'their' }, el('h2', {}, m.theirSea), target, aimText, fire),
      el('div', { class: 'mine', id: 'my-sea' }, el('h2', {}, m.mySea), own),
    ),
    toggle,
    live.node,
    emojis,
    floater,
  );

  let aim: Cell | null = null;
  /** The doc shown on the target board while a shell is in flight. */
  let held: GameDoc | null = null;
  /** A win's result is on screen: Round over waits. */
  let celebrating = false;
  let disposed = false;
  let floatTimer: ReturnType<typeof setTimeout> | undefined;
  let presenceKnown = c.state.opponentHere;
  const graceTimer = setTimeout(() => {
    presenceKnown = true;
    update(c.state);
  }, PRESENCE_GRACE_MS);

  const fx = (name: string) => (section.dataset.fx = name);
  const myName = () => c.state.doc?.seats[seat]?.name ?? '';
  const foeName = () => c.state.doc?.seats[foe]?.name ?? '';

  const setAim = (cell: Cell | null) => {
    aim = cell;
    target.aim = cell;
    fire.aim = cell;
    // The square's name, spaced so a voice reads "E 3" (Task 18 speaks it).
    aimText.textContent = cell === null ? t().aimHint : t().cellSpoken(cellLabel(cell));
  };

  /** What my shot did, from its outcome or (a landed retry) from the board. */
  const mineSaid = (doc: GameDoc, cell: Cell, outcome?: Outcome): { text: string; kind: string } => {
    const mm = t();
    const fleet = doc.fleets[foe];
    const kind = outcome?.kind ?? safeBoardCells(fleet, doc.shots[seat], false)[cell] ?? 'miss';
    const ship = () => mm.shipName(outcome && 'ship' in outcome ? outcome.ship : shipIndexAt(fleet, cell));
    switch (kind) {
      case 'hit':
        return { text: mm.hitSpoken, kind };
      case 'sunk':
        return { text: mm.sunkSpoken(ship()), kind };
      case 'win':
        return { text: `${mm.sunkSpoken(ship())} ${mm.youWon}`, kind };
      default:
        return { text: mm.missSpoken, kind: 'miss' };
    }
  };

  const onFire = async (cell: Cell) => {
    const start = performance.now();
    const before = c.state.doc;
    held = before;
    fx('fire');
    live.say(t().firing);
    update(c.state);
    let res: ApplyResult;
    try {
      res = await o.act({ type: 'fire', seat, cell });
      await sleep(FLIGHT_MS - (performance.now() - start));
    } finally {
      held = null;
    }
    if (disposed) return;
    const mm = t();
    let won = false;
    if (res.kind === 'ok') {
      const said = mineSaid(res.doc, cell, res.outcome);
      fx(said.kind);
      live.say(`${mm.cellSpoken(cellLabel(cell))}: ${said.text}`);
      won = said.kind === 'win';
      setAim(null);
    } else if (res.kind === 'failed') {
      // The shell fizzled: nothing landed. The aim stays for another go; the banner says Try again.
      fx('fizzle');
      live.say(mm.fizzle);
    } else {
      const wasUnfired = before !== null && !before.shots[seat].includes(cell);
      if (wasUnfired && res.doc.round === before.round && res.doc.shots[seat].includes(cell)) {
        // Our earlier try landed after all (a lost reply): show its result softly.
        const said = mineSaid(res.doc, cell, res.doc.phase === 'over' && res.doc.winner === seat ? { kind: 'win', ship: shipIndexAt(res.doc.fleets[foe], cell) } : undefined);
        fx(said.kind);
        live.say(`${mm.cellSpoken(cellLabel(cell))}: ${said.text}`);
        won = said.kind === 'win';
      } else {
        live.say(res.doc.phase === 'battle' && res.doc.turn !== seat ? mm.notYourTurn : mm.alreadyFired);
      }
      setAim(null);
    }
    fire.reset();
    if (won) {
      // Let the kid see and hear "You sank… You won!" before Round over takes the screen.
      celebrating = true;
      update(c.state);
      await sleep(winHoldMs());
      celebrating = false;
      if (disposed) return;
    }
    update(c.state);
    o.repaint();
  };

  const onMoved = (e: Event) => {
    const { prev, next } = (e as CustomEvent<MovedDetail>).detail;
    if (disposed || !prev || prev.round !== next.round) return;
    const mm = t();
    const before = prev.shots[foe].length;
    const after = next.shots[foe].length;
    if (after > before) {
      const cell = next.shots[foe][after - 1]!;
      const state = safeBoardCells(next.fleets[seat], next.shots[foe], true)[cell];
      const label = cellLabel(cell);
      if (state === 'sunk') live.say(mm.theySank(mm.shipName(shipIndexAt(next.fleets[seat], cell))));
      else if (state === 'hit') live.say(mm.theyHit(label));
      else live.say(mm.theyMissed(label));
      fx(`incoming-${state ?? 'miss'}`);
    }
    const r = next.reactions[foe];
    if (r && r.seq !== prev.reactions[foe]?.seq) {
      fx('react');
      live.say(mm.reacted(foeName(), r.emoji));
      floater.textContent = r.emoji;
      floater.hidden = false;
      floater.classList.remove('go');
      void floater.offsetWidth; // restart the CSS animation
      floater.classList.add('go');
      clearTimeout(floatTimer);
      floatTimer = setTimeout(() => (floater.hidden = true), FLOAT_MS);
    }
  };

  target.addEventListener('aim', (e) => setAim((e as CustomEvent<{ cell: Cell }>).detail.cell));
  // Keyboard: Enter (or Space) on the square that is already aimed fires.
  target.addEventListener(
    'keydown',
    (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && aim !== null && target.cellFromElement(e.target as Element) === aim) {
        e.preventDefault();
        e.stopPropagation();
        fire.querySelector('button')?.click();
      }
    },
    { capture: true },
  );
  fire.addEventListener('fire', (e) => void onFire((e as CustomEvent<{ cell: Cell }>).detail.cell));
  toggle.addEventListener('click', () => {
    const open = !section.classList.contains('show-mine');
    section.classList.toggle('show-mine', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  shareAgain.addEventListener('click', async () => {
    if (await shareLink(o.link, myName())) o.onShared();
    menu.open = false;
  });
  emojis.addEventListener('react', (e) => {
    const emoji = (e as CustomEvent<{ emoji: Emoji }>).detail.emoji;
    void o.act({ type: 'react', seat, emoji });
  });
  c.addEventListener('moved', onMoved);

  function update(s: ControllerState): void {
    const now = s.doc;
    if (!now || disposed) return;
    const mm = t();
    const doc = held ?? now;
    target.cells = safeBoardCells(doc.fleets[foe], doc.shots[seat], false);
    own.cells = safeBoardCells(now.fleets[seat], now.shots[foe], true);
    const myTurn = now.phase === 'battle' && now.turn === seat;
    if (s.opponentHere) presenceKnown = true;
    const flying = held !== null;
    target.disabled = !myTurn || s.pending || flying;
    fire.blocked = !myTurn || s.pending || flying;
    section.classList.toggle('my-turn', myTurn && !flying);
    const other = now.seats[foe];
    turn.info =
      myTurn || flying
        ? { player: now.seats[seat], here: null, text: mm.yourTurn }
        : {
            player: other,
            here: presenceKnown ? s.opponentHere : null,
            text: `${mm.turnOf(other?.name ?? '')}…`,
            dotLabel: other ? (s.opponentHere ? mm.here(other.name) : mm.away(other.name)) : '',
          };
    away.hidden = !presenceKnown || s.opponentHere || !other;
    away.textContent = other ? mm.away(other.name) : '';
    // A square that has been fired at can't stay aimed (a re-read, or another device of mine).
    if (aim !== null && !flying && doc.shots[seat].includes(aim)) setAim(null);
  }

  root.replaceChildren(section);
  update(c.state);
  void maybeKeepSafe(section, { id: c.id, link: o.link, myName: myName(), onShared: o.onShared });

  return {
    update,
    busy: () => held !== null || celebrating,
    dispose: () => {
      disposed = true;
      clearTimeout(floatTimer);
      clearTimeout(graceTimer);
      c.removeEventListener('moved', onMoved);
    },
  };
}
