import { describe, expect, it } from 'vitest';
import { compareDocs } from './compare';
import { createDoc } from './reducer';
import type { GameDoc } from './types';

const d: GameDoc = createDoc(
  'g1',
  { playerId: 'p0', name: 'Mum', avatar: 'whale' },
  1,
);

describe('compareDocs', () => {
  it('higher round beats more shots', () => {
    const a = { ...d, round: 2 };
    const b = { ...d, shots: [[1, 2, 3], []] as GameDoc['shots'], seq: 50 };
    expect(compareDocs(a, b)).toBe(1);
    expect(compareDocs(b, a)).toBe(-1);
  });
  it('more shots beat higher seq', () => {
    const a = { ...d, shots: [[1], []] as GameDoc['shots'], seq: 2 };
    const b = { ...d, seq: 40 };
    expect(compareDocs(a, b)).toBe(1);
  });
  it('higher seq wins otherwise; equal is 0', () => {
    expect(compareDocs({ ...d, seq: 5 }, d)).toBe(1);
    expect(compareDocs(d, { ...d })).toBe(0);
  });
});
