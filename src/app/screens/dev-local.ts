import { getEngine } from '../../engine/engine';
import { createDoc, reduce } from '../../game/reducer';
import type { Action, GameDoc, Outcome, SeatIndex, Ship } from '../../game/types';
import type { Cell } from '../../game/types';
import type { SeaGrid } from '../../ui/sea-grid';
import type { ShipDock } from '../../ui/ship-dock';
import '../../ui/sea-grid';
import '../../ui/ship-dock';

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; onclick?: () => void; disabled?: boolean } = {},
  ...kids: Node[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.onclick) el.addEventListener('click', props.onclick);
  if (props.disabled && el instanceof HTMLButtonElement) el.disabled = true;
  el.append(...kids);
  return el;
}

function describe(o: Outcome): string {
  switch (o.kind) {
    case 'miss':
      return 'Miss!';
    case 'hit':
      return 'Hit!';
    case 'sunk':
      return 'You sank a ship!';
    case 'win':
      return 'You sank the last ship!';
  }
}

/** Two players on one screen, in memory. Dev only. */
export function renderDevLocal(root: HTMLElement): void {
  const engine = getEngine();
  let doc: GameDoc = createDoc(
    crypto.randomUUID(),
    { playerId: 'p0', name: 'Player 1', avatar: 'octopus' },
    engine.version,
  );
  const joined = reduce(
    doc,
    { type: 'join', profile: { playerId: 'p1', name: 'Player 2', avatar: 'crab' } },
    engine,
  );
  if (joined.ok) doc = joined.doc;
  let message = '';
  let aim: Cell | null = null;

  const apply = (action: Action): void => {
    const r = reduce(doc, action, engine);
    if (r.ok) {
      doc = r.doc;
      message = r.outcome ? describe(r.outcome) : '';
    } else {
      message = `Not allowed: ${r.error}`;
    }
    aim = null;
    draw();
  };

  const name = (s: SeatIndex) => doc.seats[s]?.name ?? `Player ${s + 1}`;

  const setupPanel = (seat: SeatIndex): HTMLElement => {
    const grid = document.createElement('sea-grid') as SeaGrid;
    const dock = document.createElement('ship-dock') as ShipDock;
    dock.grid = grid;
    dock.fleet = doc.fleets[seat];
    dock.addEventListener('place', (e) =>
      apply({ type: 'place', seat, fleet: (e as CustomEvent<{ fleet: Ship[] }>).detail.fleet }),
    );
    const ready = doc.ready[seat];
    return h(
      'section',
      { class: 'panel' },
      h('h2', { text: `${name(seat)}${ready ? ' (ready)' : ''}` }),
      grid,
      dock,
      h('button', {
        text: ready ? '✅ Ready!' : '✅ Ready',
        disabled: ready || doc.fleets[seat] === null,
        onclick: () =>
          apply({ type: 'ready', seat, coin: crypto.getRandomValues(new Uint8Array(1))[0]! % 2 as SeatIndex }),
      }),
    );
  };

  const battle = (): HTMLElement => {
    const me = doc.turn;
    const foe = (1 - me) as SeatIndex;
    const target = document.createElement('sea-grid') as SeaGrid;
    target.cells = engine.boardCells(doc.fleets[foe]!, doc.shots[me], false);
    target.aim = aim;
    const fire = h('button', {
      class: 'fire',
      text: '💥 FIRE',
      disabled: aim === null,
      onclick: () => {
        if (aim !== null) apply({ type: 'fire', seat: me, cell: aim });
      },
    });
    target.addEventListener('aim', (e) => {
      aim = (e as CustomEvent<{ cell: Cell }>).detail.cell;
      target.aim = aim;
      fire.disabled = false;
    });
    const own = document.createElement('sea-grid') as SeaGrid;
    own.mode = 'own';
    own.cells = engine.boardCells(doc.fleets[me]!, doc.shots[foe], true);
    return h(
      'div',
      { class: 'boards' },
      h('section', { class: 'panel' }, h('h2', { text: `${name(me)}: aim, then FIRE` }), target, fire),
      h('section', { class: 'panel' }, h('h2', { text: 'Your fleet' }), own),
    );
  };

  const over = (): HTMLElement => {
    const w = doc.winner as SeatIndex;
    return h(
      'section',
      { class: 'panel' },
      h('h2', { text: `${name(w)} wins!` }),
      h('p', { text: `Score ${doc.score[0]} - ${doc.score[1]}` }),
      ...([0, 1] as SeatIndex[]).map((seat) =>
        h('button', {
          text: `${name(seat)}: rematch${doc.rematch[seat] ? ' (agreed)' : ''}`,
          disabled: doc.rematch[seat],
          onclick: () => apply({ type: 'rematch', seat }),
        }),
      ),
    );
  };

  function draw(): void {
    const status = h('p', { text: message });
    status.setAttribute('role', 'status');
    const body =
      doc.phase === 'setup'
        ? h('div', { class: 'boards' }, setupPanel(0), setupPanel(1))
        : doc.phase === 'battle'
          ? battle()
          : over();
    root.replaceChildren(h('h1', { text: `Local game, round ${doc.round}` }), status, body);
  }
  draw();
}
