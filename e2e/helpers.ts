import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { wsconnect } from '@nats-io/nats-core';
import { Kvm } from '@nats-io/kv';
import { createSealer } from '../src/crypto/seal';
import type { Cell, GameDoc, SeatIndex } from '../src/game/types';
import { cellLabel, FLEET_LENGTHS } from '../src/game/types';

const NATS_URL = 'ws://localhost:9222';
const BUCKET = 'bship_games';

/** `#/g/<id>/<secret>` out of an invite link. */
export function parseLink(link: string): { id: string; secret: string } {
  const m = /#\/g\/([^/]+)\/([^/?#]+)/.exec(link);
  if (!m) throw new Error(`not a game link: ${link}`);
  return { id: m[1]!, secret: m[2]! };
}

export type DocReader = { read(): Promise<GameDoc | null>; close(): Promise<void> };

/** Reads and unseals the game doc straight from NATS, as the `browser` user. */
export async function openDocReader(link: string): Promise<DocReader> {
  const { id, secret } = parseLink(link);
  const sealer = await createSealer(id, secret);
  const nc = await wsconnect({ servers: NATS_URL, user: 'browser', pass: 'browser-dev', name: 'bship-e2e' });
  const kv = await new Kvm(nc).open(BUCKET, { allow_direct: true });
  return {
    async read() {
      const entry = await kv.get(`g.${id}`);
      if (!entry || entry.operation !== 'PUT') return null;
      return sealer.openJson<GameDoc>('doc', entry.value);
    },
    close: () => nc.close(),
  };
}

/** The next cell `from` should shoot: a ship cell of the foe's fleet (`hit`) or a water cell. */
export function pickTarget(doc: GameDoc, from: SeatIndex, hit: boolean): Cell {
  const foe = (1 - from) as SeatIndex;
  const fleet = doc.fleets[foe];
  if (!fleet) throw new Error('foe has no fleet');
  const ships = new Set<Cell>();
  fleet.forEach((s, i) => {
    const step = s.dir === 'h' ? 1 : 10;
    for (let k = 0; k < FLEET_LENGTHS[i]!; k++) ships.add(s.bow + k * step);
  });
  const fired = new Set(doc.shots[from]);
  for (let cell = 0; cell < 100; cell++) {
    if (!fired.has(cell) && ships.has(cell) === hit) return cell;
  }
  throw new Error('no target left');
}

/** Cold open: tap to start, then fill in the one-time profile. */
export async function startAndProfile(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Tap to start/ }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: /Save/ }).click();
}

export async function newPlayer(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  return { context, page: await context.newPage() };
}

export async function shuffleAndReady(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Shuffle/ }).click();
  const ready = page.getByRole('button', { name: /Ready!/ });
  await expect(ready).toBeEnabled();
  await ready.click();
}

/** `seat` aims in "Their sea" and fires; resolves once the doc has the shot. */
export async function fireAt(page: Page, reader: DocReader, doc: GameDoc, seat: SeatIndex, hit: boolean): Promise<void> {
  const cell = pickTarget(doc, seat, hit);
  const shots = doc.shots[seat].length;
  await page.locator('.their').getByRole('gridcell', { name: `${cellLabel(cell)}, water`, exact: true }).click();
  await page.getByRole('button', { name: /FIRE!/ }).click();
  await expect.poll(async () => (await reader.read())?.shots[seat].length, { intervals: [200] }).toBe(shots + 1);
}
