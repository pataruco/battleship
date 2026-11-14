import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const tokens = new Map<string, string>();
for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens.set(m[1]!, m[2]!);

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
const colour = (name: string): string => (name === '#fff' ? '#ffffff' : (tokens.get(name) ?? ''));

// [text, background] pairs actually used in base.css (text >= 4.5:1).
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'paper'],
  ['ink', 'foam'],
  ['#fff', 'sea-deep'],
  ['#fff', 'danger'],
  ['#fff', 'hit'],
  ['#fff', 'ink'],
  ['#fff', 'sea'],
  ['miss', 'foam'],
  ['miss', 'paper'],
  ['ok', 'paper'],
  ['danger', 'paper'],
  ['sea-deep', 'paper'],
];
// Non-text UI parts (>= 3:1): the aim ring (accent outline over an ink inner ring) and the ship ring.
const UI_PAIRS: [string, string][] = [
  ['ink', 'sea'],
  ['accent', 'ink'],
  ['foam', 'sea-deep'],
];

describe('theme token contrast', () => {
  it('parses every token as a hex colour', () => {
    expect(tokens.size).toBeGreaterThanOrEqual(10);
  });
  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(colour(fg), colour(bg))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(UI_PAIRS)('%s against %s is at least 3:1', (fg, bg) => {
    expect(contrast(colour(fg), colour(bg))).toBeGreaterThanOrEqual(3);
  });
});
