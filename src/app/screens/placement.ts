import { getEngine } from '../../engine/engine';
import type { SeatIndex, Ship } from '../../game/types';
import { cellLabel } from '../../game/types';
import { t } from '../../i18n';
import { fleetRepo } from '../../storage/games-repo';
import '../../ui/player-badge';
import '../../ui/sea-grid';
import '../../ui/ship-dock';
import type { DockAnnounce } from '../../ui/ship-dock';
import { el, liveRegion } from '../el';
import { logError } from '../errors';
import type { ControllerState } from '../game-controller';
import type { GameView, GameViewOptions } from './game';

const key = (f: Ship[] | null) => JSON.stringify(f?.map((s) => [s.bow, s.dir]) ?? null);

function icon(emoji: string): HTMLSpanElement {
  return el('span', { 'aria-hidden': 'true' }, emoji);
}

/**
 * My sea + ship dock, Shuffle, Ready!, "Same ships as last time?" and the opponent's badge.
 * Built once per round and updated in place on every controller change, so keyboard focus
 * stays on the grid while ships move.
 */
export function renderPlacement(root: HTMLElement, o: GameViewOptions): GameView {
  const m = t();
  const { c } = o;
  const seat = c.state.seat as SeatIndex;
  const foe = (1 - seat) as SeatIndex;

  const grid = el('sea-grid', { 'aria-label': m.mySea });
  const dock = el('ship-dock', { 'data-shuffle': m.shuffle, 'data-hint': m.placeHint });
  dock.grid = grid;
  const badge = el('player-badge', { class: 'opponent' });
  const ready = el('button', { type: 'button', class: 'big primary ready' }, icon('✅'), ` ${m.ready}`);
  const same = el('button', { type: 'button', class: 'big same', hidden: true }, icon('♻️'), ` ${m.sameShips}`);
  const waiting = el('p', { class: 'waiting', hidden: true });
  const live = liveRegion('sr');

  // The fleet the doc has for me (last synced), and the latest one the player wants.
  let synced = '';
  let wanted: Ship[] | null = null;
  let sending = false;
  let last: Ship[] | null = null;
  let disposed = false;
  let autoPlaced = false;

  /** Latest wins: a change made while one is in flight is sent when it lands. */
  const send = async () => {
    if (sending) return;
    sending = true;
    try {
      while (wanted && !disposed) {
        const fleet = wanted;
        const res = await o.act({ type: 'place', seat, fleet });
        if (wanted === fleet) wanted = null;
        if (res.kind !== 'ok') {
          // Rejected or failed: show what the game really has (if it has a fleet yet).
          wanted = null;
          const real = c.state.doc?.fleets[seat] ?? null;
          if (real) dock.fleet = real;
          synced = key(real);
        }
      }
    } finally {
      sending = false;
      if (!disposed) update(c.state);
    }
  };

  const place = (fleet: Ship[]) => {
    wanted = fleet;
    update(c.state);
    void send();
  };

  dock.addEventListener('place', (e) => place((e as CustomEvent<{ fleet: Ship[] }>).detail.fleet));
  dock.addEventListener('announce', (e) => {
    const d = (e as CustomEvent<DockAnnounce>).detail;
    const mm = t();
    const ship = mm.shipName(d.ship);
    const at = d.cell === undefined ? '' : cellLabel(d.cell);
    switch (d.kind) {
      case 'picked':
        return live.say(mm.shipPicked(ship));
      case 'moved':
        return live.say(d.valid ? mm.shipAt(ship, at) : `${mm.shipAt(ship, at)}. ${mm.invalidSpot}`);
      case 'dropped':
        return live.say(mm.shipAt(ship, at));
      case 'cancelled':
        return live.say(mm.shipPutBack(ship));
      case 'turned':
        return live.say(mm.shipTurned(ship));
      case 'invalid':
        return live.say(mm.invalidSpot);
    }
  });

  ready.addEventListener('click', async () => {
    const fleet = dock.fleet;
    if (!fleet || wanted || sending) return;
    const coin = (crypto.getRandomValues(new Uint8Array(1))[0]! & 1) as SeatIndex;
    const res = await o.act({ type: 'ready', seat, coin });
    if (res.kind === 'ok') fleetRepo.putLast(fleet).catch(logError);
  });

  same.addEventListener('click', () => {
    if (!last) return;
    dock.fleet = last;
    place(last);
  });

  fleetRepo
    .getLast()
    .then((f) => {
      if (disposed || !f || getEngine().checkFleet(f) !== null) return;
      last = f;
      update(c.state);
    })
    .catch(logError);

  function update(s: ControllerState): void {
    const doc = s.doc;
    if (!doc || disposed) return;
    const mm = t();
    const mine = doc.fleets[seat];
    // Only a change in the doc's fleet (another device of mine, a re-read) moves the dock.
    const docKey = key(mine);
    if (docKey !== synced) {
      synced = docKey;
      if (!wanted && !sending && docKey !== key(dock.fleet)) dock.fleet = mine;
    }
    // A new round with no fleet yet: start from a random one, so ships are on the board.
    if (!mine && !dock.fleet && !autoPlaced && !s.pending) {
      autoPlaced = true;
      const fleet = getEngine().randomFleet(crypto.getRandomValues(new Uint8Array(16)));
      dock.fleet = fleet;
      place(fleet);
      return;
    }

    const iAmReady = doc.ready[seat];
    const other = doc.seats[foe];
    badge.info = {
      player: other,
      here: other ? s.opponentHere : null,
      text: !other ? mm.waitingForFriend : doc.ready[foe] ? mm.opponentReady(other.name) : '',
    };
    ready.disabled = iAmReady || !mine || s.pending || sending || wanted !== null;
    same.hidden = !last || iAmReady || key(last) === key(dock.fleet);
    waiting.hidden = !iAmReady;
    waiting.textContent = iAmReady ? mm.waitingFor(other?.name ?? '…') : '';
  }

  root.replaceChildren(
    el(
      'section',
      { class: 'screen placement' },
      el('h1', {}, m.placeTitle),
      badge,
      grid,
      dock,
      el('p', { class: 'hint' }, m.placeKeysHint),
      same,
      ready,
      waiting,
      live.node,
    ),
  );
  update(c.state);

  return {
    update,
    dispose: () => {
      disposed = true;
    },
  };
}
