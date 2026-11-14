// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setEngine } from '../../engine/engine';
import { loadEngineForTests } from '../../engine/load-node';
import { FLEET_A, FLEET_B, fleetCells } from '../../game/fixtures';
import type { Action, GameDoc } from '../../game/types';
import type { ApplyResult } from '../../net/game-store';
import type { ControllerState, GameController } from '../game-controller';
import { FLIGHT_MS, renderBattle, WIN_HOLD_MS } from './battle';
import type { GameView } from './game';

const B_CELLS = fleetCells(FLEET_B);
const LAST = B_CELLS.at(-1)!;

function battleDoc(): GameDoc {
  return {
    v: 1,
    id: 'g',
    seq: 40,
    engine: 1,
    seats: [
      { playerId: 'p0', name: 'Sam', avatar: 'whale' },
      { playerId: 'p1', name: 'Kid', avatar: 'crab' },
    ],
    round: 1,
    score: [0, 0],
    phase: 'battle',
    fleets: [FLEET_A, FLEET_B],
    ready: [true, true],
    // Every cell of B's fleet but the last one is already hit.
    shots: [B_CELLS.slice(0, -1), [99, 98, 97, 96, 89, 87, 86, 69, 68, 67, 66, 64, 63, 62, 61, 60]],
    turn: 0,
    firstTurn: 0,
    winner: null,
    rematch: [false, false],
    reactions: [null, null],
  };
}

/** Just enough of GameController for a screen: state, act, events. */
class FakeController extends EventTarget {
  readonly id = 'g';
  state: ControllerState;
  constructor(doc: GameDoc) {
    super();
    this.state = { doc, revision: 1, seat: 0, status: 'ready', pending: false, opponentHere: true, banner: null, needsJoin: false, needsWho: false };
  }
  set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    this.dispatchEvent(new Event('change'));
  }
}

beforeAll(async () => {
  setEngine(await loadEngineForTests());
});

let c: FakeController;
let view: GameView;
let roundOverShown: boolean;
let acts: Action[];

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  const root = document.createElement('main');
  document.body.append(root);
  c = new FakeController(battleDoc());
  acts = [];
  roundOverShown = false;
  const act = async (action: Action): Promise<ApplyResult> => {
    acts.push(action);
    c.set({ pending: true });
    await Promise.resolve();
    const prev = c.state.doc!;
    const doc: GameDoc = {
      ...prev,
      seq: prev.seq + 1,
      shots: [[...prev.shots[0], LAST], prev.shots[1]],
      phase: 'over',
      winner: 0,
      score: [1, 0],
    };
    // Like the controller: the doc is adopted (a change) before act resolves.
    c.set({ doc, pending: false });
    return { kind: 'ok', doc, revision: 2, outcome: { kind: 'win', ship: 0 } };
  };
  // Like game.ts: a change or repaint moves on to Round over only when the view isn't busy.
  const repaint = () => {
    if (c.state.doc?.phase === 'over' && !view.busy?.()) roundOverShown = true;
    else view.update(c.state);
  };
  c.addEventListener('change', repaint);
  view = renderBattle(root, {
    c: c as unknown as GameController,
    link: 'https://example.test/#/g/x/y',
    act,
    repaint,
    onShared: () => {},
  });
});

afterEach(() => {
  view.dispose();
  vi.useRealTimers();
});

describe('battle: the winning shot', () => {
  it('shows and announces the win before Round over takes the screen', async () => {
    document.querySelector<HTMLElement>(`.their [data-cell="${LAST}"]`)!.click();
    document.querySelector<HTMLButtonElement>('fire-button button')!.click();
    expect(acts).toHaveLength(1);

    // The shell is in flight: the doc already says "over", but the screen holds.
    await vi.advanceTimersByTimeAsync(FLIGHT_MS - 50);
    expect(roundOverShown).toBe(false);
    expect(view.busy?.()).toBe(true);

    // The result is shown (and live) while the hold lasts.
    await vi.advanceTimersByTimeAsync(100);
    const result = document.querySelector('.result')!;
    expect(result.getAttribute('aria-live')).toBe('polite');
    expect(result.textContent).toContain('You won!');
    expect(document.querySelector<HTMLElement>('.battle')!.dataset.fx).toBe('win');
    expect(roundOverShown).toBe(false);

    await vi.advanceTimersByTimeAsync(WIN_HOLD_MS - 200);
    expect(roundOverShown).toBe(false);
    expect(document.querySelector('.result')!.textContent).toContain('You won!');

    await vi.advanceTimersByTimeAsync(200);
    expect(roundOverShown).toBe(true);
    expect(view.busy?.()).toBe(false);
  });
});
