import type { GameDoc } from './types';

export function totalShots(doc: GameDoc): number {
  return doc.shots[0].length + doc.shots[1].length;
}

/** R3 ordering: higher round, then more total shots, then higher seq. 1 means `a` is newer. */
export function compareDocs(a: GameDoc, b: GameDoc): -1 | 0 | 1 {
  const diff =
    a.round - b.round || totalShots(a) - totalShots(b) || a.seq - b.seq;
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}
