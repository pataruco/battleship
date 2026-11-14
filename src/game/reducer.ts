import type { Action, GameDoc, Outcome, Profile, SeatIndex } from './types';
import { DOC_VERSION, EMOJI } from './types';
import type { Engine } from '../engine/engine';

export type RulesEngine = Pick<
  Engine,
  'version' | 'checkFleet' | 'shotOutcome'
>;

export type ReduceError =
  | 'seat_taken'
  | 'wrong_phase'
  | 'bad_fleet'
  | 'no_fleet'
  | 'not_your_turn'
  | 'already_fired'
  | 'bad_cell'
  | 'bad_emoji'
  | 'no_opponent'
  | 'bad_seat';

export type ReduceResult =
  | { ok: true; doc: GameDoc; outcome?: Outcome }
  | { ok: false; error: ReduceError };

export function createDoc(
  id: string,
  profile: Profile,
  engineVersion: number,
): GameDoc {
  return {
    v: DOC_VERSION,
    id,
    seq: 1,
    engine: engineVersion,
    seats: [profile, null],
    round: 1,
    score: [0, 0],
    phase: 'setup',
    fleets: [null, null],
    ready: [false, false],
    shots: [[], []],
    turn: 0,
    firstTurn: 0,
    winner: null,
    rematch: [false, false],
    reactions: [null, null],
  };
}

const fail = (error: ReduceError): ReduceResult => ({ ok: false, error });

function set<T>(pair: [T, T], seat: SeatIndex, value: T): [T, T] {
  const next: [T, T] = [pair[0], pair[1]];
  next[seat] = value;
  return next;
}

/** Pure: never mutates `doc`. Checks phase, then seat/turn, then input validity. */
export function reduce(
  doc: GameDoc,
  action: Action,
  engine: RulesEngine,
): ReduceResult {
  const seq = doc.seq + 1;
  const base: GameDoc = {
    ...doc,
    seq,
    engine: Math.max(doc.engine, engine.version),
  };
  const accept = (
    changes: Partial<GameDoc>,
    outcome?: Outcome,
  ): ReduceResult => ({
    ok: true,
    doc: { ...base, ...changes },
    ...(outcome ? { outcome } : {}),
  });

  if (action.type === 'ready' && action.coin !== 0 && action.coin !== 1)
    return fail('bad_seat');

  if (action.type === 'join') {
    if (doc.phase !== 'setup') return fail('wrong_phase');
    if (doc.seats[1] !== null) return fail('seat_taken');
    return accept({ seats: [doc.seats[0], action.profile] });
  }

  const { seat } = action;
  if (seat !== 0 && seat !== 1) return fail('bad_seat');
  const noOpponent = seat === 1 && doc.seats[1] === null;

  switch (action.type) {
    case 'place': {
      if (doc.phase !== 'setup') return fail('wrong_phase');
      if (noOpponent) return fail('no_opponent');
      if (engine.checkFleet(action.fleet) !== null) return fail('bad_fleet');
      return accept({
        fleets: set(
          doc.fleets,
          seat,
          action.fleet.map((s) => ({ bow: s.bow, dir: s.dir })),
        ),
        ready: set(doc.ready, seat, false),
      });
    }

    case 'ready': {
      if (doc.phase !== 'setup') return fail('wrong_phase');
      if (noOpponent) return fail('no_opponent');
      if (doc.fleets[seat] === null) return fail('no_fleet');
      const ready = set(doc.ready, seat, true);
      if (doc.seats[1] === null || !ready[0] || !ready[1])
        return accept({ ready });
      const first: SeatIndex = doc.round === 1 ? action.coin : doc.firstTurn;
      return accept({ ready, phase: 'battle', turn: first, firstTurn: first });
    }

    case 'fire': {
      if (doc.phase !== 'battle') return fail('wrong_phase');
      if (doc.turn !== seat) return fail('not_your_turn');
      const { cell } = action;
      if (!Number.isInteger(cell) || cell < 0 || cell > 99)
        return fail('bad_cell');
      if (doc.shots[seat].includes(cell)) return fail('already_fired');
      const target = doc.fleets[1 - seat]!; // both fleets are set in battle
      const shots = set(doc.shots, seat, [...doc.shots[seat], cell]);
      const outcome = engine.shotOutcome(target, shots[seat]);
      if (outcome.kind === 'win') {
        return accept(
          {
            shots,
            phase: 'over',
            winner: seat,
            score: set(doc.score, seat, doc.score[seat] + 1),
          },
          outcome,
        );
      }
      return accept({ shots, turn: (1 - seat) as SeatIndex }, outcome);
    }

    case 'react': {
      if (noOpponent) return fail('no_opponent');
      if (!EMOJI.includes(action.emoji)) return fail('bad_emoji');
      return accept({
        reactions: set(doc.reactions, seat, { emoji: action.emoji, seq }),
      });
    }

    case 'rematch': {
      if (doc.phase !== 'over' || doc.winner === null)
        return fail('wrong_phase');
      const rematch = set(doc.rematch, seat, true);
      if (!rematch[0] || !rematch[1]) return accept({ rematch });
      return accept({
        round: doc.round + 1,
        phase: 'setup',
        fleets: [null, null],
        ready: [false, false],
        shots: [[], []],
        rematch: [false, false],
        firstTurn: (1 - doc.winner) as SeatIndex,
        winner: null,
      });
    }
  }
}
