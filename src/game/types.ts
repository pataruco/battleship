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
