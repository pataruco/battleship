import { readFileSync } from 'node:fs';
import { loadEngine, type Engine } from './engine';

/** Test helper: instantiate the built wasm from disk (Node has no fetch for local files). */
export function loadEngineForTests(): Promise<Engine> {
  const bytes = readFileSync(new URL('./engine.wasm', import.meta.url));
  return loadEngine(bytes);
}
