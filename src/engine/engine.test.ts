import { describe, expect, it } from 'vitest';
import { loadEngineForTests } from './load-node';

describe('engine', () => {
  it('reports rules version 1', async () => {
    const engine = await loadEngineForTests();
    expect(engine.version).toBe(1);
  });
});
