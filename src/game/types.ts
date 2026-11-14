/** Board cell index 0..99, row-major (row = cell / 10, column = cell % 10). */
export type Cell = number;
export type Dir = 'h' | 'v';
export type Ship = { bow: Cell; dir: Dir };

export const FLEET_LENGTHS = [5, 4, 3, 3, 2] as const;

export type Outcome =
  | { kind: 'miss' }
  | { kind: 'hit' }
  | { kind: 'sunk'; ship: number }
  | { kind: 'win'; ship: number };

export type CellState = 'unknown' | 'miss' | 'hit' | 'sunk' | 'ship';
export type FleetError = 'out_of_bounds' | 'overlap' | 'wrong_ships';

/** Human label: column letter then 1-based row, so 23 is "D3". */
export function cellLabel(cell: Cell): string {
  return `${String.fromCharCode(65 + (cell % 10))}${Math.floor(cell / 10) + 1}`;
}

export const DOC_VERSION = 1;
export const EMOJI = ['🎉', '😱', '😂', '👏', '😭', '🔥'] as const;
export type Emoji = (typeof EMOJI)[number];
export type SeatIndex = 0 | 1;
export type Profile = { playerId: string; name: string; avatar: string };
export type Seat = Profile;
export type Reaction = { emoji: Emoji; seq: number };
export type Phase = 'setup' | 'battle' | 'over';

export type GameDoc = {
  v: 1;
  id: string;
  seq: number;
  engine: number;
  seats: [Seat, Seat | null];
  round: number;
  score: [number, number];
  phase: Phase;
  fleets: [Ship[] | null, Ship[] | null];
  ready: [boolean, boolean];
  shots: [Cell[], Cell[]];
  turn: SeatIndex;
  firstTurn: SeatIndex;
  winner: SeatIndex | null;
  rematch: [boolean, boolean];
  reactions: [Reaction | null, Reaction | null];
};

export type Action =
  | { type: 'join'; profile: Profile }
  | { type: 'place'; seat: SeatIndex; fleet: Ship[] }
  | { type: 'ready'; seat: SeatIndex; coin: SeatIndex }
  | { type: 'fire'; seat: SeatIndex; cell: Cell }
  | { type: 'react'; seat: SeatIndex; emoji: Emoji }
  | { type: 'rematch'; seat: SeatIndex };
