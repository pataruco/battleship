import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Fills the service worker's build id and precache list; throws when a placeholder is missing. */
export function injectSw(source: string, buildId: string, files: string[]): string {
  for (const placeholder of ['__BUILD_ID__', '__PRECACHE__']) {
    if (!source.includes(placeholder)) throw new Error(`sw.js is missing ${placeholder}`);
  }
  return source
    .replaceAll('__BUILD_ID__', () => JSON.stringify(buildId))
    .replaceAll('__PRECACHE__', () => JSON.stringify(files));
}

/** Short git sha + UTC timestamp, e.g. `f66d4c8-20261114T101500Z`. */
export function makeBuildId(now = new Date()): string {
  let sha = 'nogit';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || sha;
  } catch {
    // Not a git checkout: the timestamp alone still differs per build.
  }
  return `${sha}-${now.toISOString().replace(/[-:]|\.\d+/g, '')}`;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Every file in `outDir` except the worker itself, as URLs relative to the scope, plus `./`. */
export function precacheList(outDir: string): string[] {
  const files = walk(outDir)
    .map((f) => relative(outDir, f).split(sep).join(posix.sep))
    .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
    .sort();
  return ['./', ...files];
}

/** After the bundle is written, stamps `dist/sw.js` with the build id and precache list. */
export function swPlugin(buildId: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'bship-sw',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    async writeBundle() {
      const path = join(outDir, 'sw.js');
      await writeFile(path, injectSw(await readFile(path, 'utf8'), buildId, precacheList(outDir)));
    },
  };
}
