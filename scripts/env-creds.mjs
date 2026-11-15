// Points .env at Synadia with the browser user's creds, read from stdin.
// Usage: sops decrypt ... browser.creds.sops | node scripts/env-creds.mjs <env-file> <nats-url>
// Sets VITE_NATS_URL, VITE_NATS_AUTH=creds and VITE_NATS_CREDS; leaves every other line alone.
// Only use the *browser* creds here: every VITE_* value ends up in the app's JavaScript.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';

const [envFile, url] = process.argv.slice(2);
if (!envFile || !url) {
  console.error('usage: node scripts/env-creds.mjs <env-file> <nats-url> < browser.creds');
  process.exit(2);
}

const creds = readFileSync(0, 'utf8').trim();
if (!creds.includes('BEGIN NATS USER JWT') || !creds.includes('BEGIN USER NKEY SEED')) {
  console.error('stdin is not a NATS creds file');
  process.exit(1);
}
// Vite reads .env with dotenv and dotenv-expand: a double-quoted value turns \n into newlines,
// but has no escape for a quote, and expands $NAME. Creds files contain neither; refuse if they do.
if (/["$\\]/.test(creds)) {
  console.error('creds contain ", $ or \\, which .env cannot hold safely');
  process.exit(1);
}

const values = {
  VITE_NATS_URL: url,
  VITE_NATS_AUTH: 'creds',
  VITE_NATS_CREDS: `"${creds.replace(/\r?\n/g, '\\n')}"`,
};

const lines = readFileSync(envFile, 'utf8').split('\n');
const seen = new Set();
const out = lines.map((line) => {
  const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
  if (!key || !(key in values)) return line;
  seen.add(key);
  return `${key}=${values[key]}`;
});
while (out.length && out.at(-1) === '') out.pop();
for (const [key, value] of Object.entries(values)) if (!seen.has(key)) out.push(`${key}=${value}`);

writeFileSync(envFile, `${out.join('\n')}\n`, { mode: 0o600 });
chmodSync(envFile, 0o600);
console.log(`${envFile}: VITE_NATS_URL=${url}, VITE_NATS_AUTH=creds, VITE_NATS_CREDS set`);
