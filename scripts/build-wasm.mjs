import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';

const manifest = 'engine/Cargo.toml';
const built = 'engine/target/wasm32-unknown-unknown/release/engine.wasm';
const out = 'src/engine/engine.wasm';

execFileSync(
  'cargo',
  ['build', '--release', '--target', 'wasm32-unknown-unknown', '--manifest-path', manifest],
  { stdio: 'inherit' },
);
mkdirSync('src/engine', { recursive: true });
copyFileSync(built, out);
console.log(`engine.wasm: ${statSync(out).size} bytes`);
