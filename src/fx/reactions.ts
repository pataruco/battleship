import type { Emoji, GameDoc, SeatIndex } from '../game/types';

/** A reaction by `seat` that is new between two docs (its `seq` moved on), or null. */
export function newReaction(prev: GameDoc | null, next: GameDoc, seat: SeatIndex): Emoji | null {
  const r = next.reactions[seat];
  if (!r) return null;
  return r.seq !== prev?.reactions[seat]?.seq ? r.emoji : null;
}
