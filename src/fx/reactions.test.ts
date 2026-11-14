import { describe, expect, it } from 'vitest';
import type { GameDoc } from '../game/types';
import { newReaction } from './reactions';

const doc = (r: { emoji: string; seq: number } | null) => ({ reactions: [null, r] }) as unknown as GameDoc;

describe('newReaction', () => {
  it('reports a reaction only when its seq moved on', () => {
    expect(newReaction(doc(null), doc({ emoji: '🎉', seq: 1 }), 1)).toBe('🎉');
    expect(newReaction(doc({ emoji: '🎉', seq: 1 }), doc({ emoji: '🎉', seq: 1 }), 1)).toBeNull();
    expect(newReaction(doc({ emoji: '🎉', seq: 1 }), doc({ emoji: '🎉', seq: 2 }), 1)).toBe('🎉');
    expect(newReaction(null, doc(null), 1)).toBeNull();
  });
});
