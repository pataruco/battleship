import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEngine, type Engine } from './engine';

/** Test helper: instantiate the built wasm from disk (Node has no fetch for local files).
 * Resolved from the repo root, since import.meta.url is not a file URL under happy-dom.. */
export function loadEngineForTests(): Promise<Engine> {
  const bytes = readFileSync(resolve(process.cwd(), 'src/engine/engine.wasm'));
  return loadEngine(bytes);
}
