import type { GameDoc } from './types';
import { DOC_VERSION, EMOJI, FLEET_LENGTHS } from './types';

type Rec = Record<string, unknown>;

const isObj = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => Number.isInteger(x);
const isCell = (x: unknown) => isInt(x) && x >= 0 && x <= 99;
const isSeatIndex = (x: unknown) => x === 0 || x === 1;
const isPair = (x: unknown, item: (y: unknown) => boolean): x is [unknown, unknown] =>
  Array.isArray(x) && x.length === 2 && item(x[0]) && item(x[1]);

const isSeat = (x: unknown) =>
  isObj(x) && typeof x.playerId === 'string' && typeof x.name === 'string' && typeof x.avatar === 'string';
const isShip = (x: unknown) => isObj(x) && isCell(x.bow) && (x.dir === 'h' || x.dir === 'v');
const isFleet = (x: unknown) =>
  x === null || (Array.isArray(x) && x.length === FLEET_LENGTHS.length && x.every(isShip));
const isShots = (x: unknown) => Array.isArray(x) && x.every(isCell);
const isReaction = (x: unknown) =>
  x === null || (isObj(x) && (EMOJI as readonly unknown[]).includes(x.emoji) && isInt(x.seq));

/** Structural check of a doc read from the wire. Shape and types only; rules are not re-checked. */
export function isGameDoc(x: unknown): x is GameDoc {
  if (!isObj(x)) return false;
  const ok =
    x.v === DOC_VERSION &&
    typeof x.id === 'string' &&
    isInt(x.seq) &&
    x.seq >= 1 &&
    isInt(x.engine) &&
    Array.isArray(x.seats) &&
    x.seats.length === 2 &&
    isSeat(x.seats[0]) &&
    (x.seats[1] === null || isSeat(x.seats[1])) &&
    isInt(x.round) &&
    x.round >= 1 &&
    isPair(x.score, (s) => isInt(s) && s >= 0) &&
    (x.phase === 'setup' || x.phase === 'battle' || x.phase === 'over') &&
    isPair(x.fleets, isFleet) &&
    isPair(x.ready, (b) => typeof b === 'boolean') &&
    isPair(x.shots, isShots) &&
    isSeatIndex(x.turn) &&
    isSeatIndex(x.firstTurn) &&
    (x.winner === null || isSeatIndex(x.winner)) &&
    isPair(x.rematch, (b) => typeof b === 'boolean') &&
    isPair(x.reactions, isReaction);
  if (!ok) return false;
  if (x.phase === 'battle') {
    const [f0, f1] = x.fleets as [unknown, unknown];
    if (f0 === null || f1 === null || (x.seats as unknown[])[1] === null) return false;
  }
  return true;
}
