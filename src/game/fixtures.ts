import type { Cell, Ship } from './types';
import { FLEET_LENGTHS } from './types';

/** Test fleets, in fleet order [5,4,3,3,2]. Valid and non-overlapping. */
export const FLEET_A: Ship[] = [
  { bow: 0, dir: 'h' }, // 0..4
  { bow: 20, dir: 'v' }, // 20,30,40,50
  { bow: 77, dir: 'h' }, // 77..79
  { bow: 95, dir: 'h' }, // 95..97
  { bow: 18, dir: 'v' }, // 18,28
];

export const FLEET_B: Ship[] = [
  { bow: 55, dir: 'v' }, // 55,65,75,85,95
  { bow: 10, dir: 'h' }, // 10..13
  { bow: 14, dir: 'v' }, // 14,24,34
  { bow: 70, dir: 'h' }, // 70..72
  { bow: 88, dir: 'v' }, // 88,98
];

/** Cells covered by one ship. */
export function shipCells(ship: Ship, length: number): Cell[] {
  return Array.from(
    { length },
    (_, i) => ship.bow + i * (ship.dir === 'h' ? 1 : 10),
  );
}

/** Every cell covered by a fleet, ship by ship, in fleet order. */
export function fleetCells(fleet: Ship[]): Cell[] {
  return fleet.flatMap((s, i) => shipCells(s, FLEET_LENGTHS[i]!));
}
