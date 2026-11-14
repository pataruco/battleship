// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { unlockAudio } from './audio';

/** A context whose resume is refused (no user activation yet, or an interrupted iOS session). */
class RefusingContext {
  resumes = 0;
  currentTime = 0;
  destination = {};
  resume(): Promise<void> {
    this.resumes++;
    return Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
  }
  createGain() {
    return { gain: { value: 0 }, connect: () => {} };
  }
  createOscillator() {
    return { connect: (n: unknown) => n, start: () => {}, stop: () => {} };
  }
}

describe('unlockAudio', () => {
  it('a refused resume is swallowed (no unhandled rejection)', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    let made: RefusingContext | null = null;
    globalThis.AudioContext = class extends RefusingContext {
      constructor() {
        super();
        made = this;
      }
    } as unknown as typeof AudioContext;
    try {
      unlockAudio();
      await new Promise((r) => setTimeout(r, 20));
      expect(made!.resumes).toBeGreaterThan(0);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
