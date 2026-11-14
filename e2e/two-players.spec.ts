import { expect, test, type Page } from '@playwright/test';
import { fireAt, newPlayer, openDocReader, shuffleAndReady, startAndProfile, type DocReader } from './helpers';

test('two players: invite, play a round, rematch, resume after a close', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  let bContext = b.context;
  let bPage = b.page;
  let reader: DocReader | undefined;
  try {
    await a.page.goto('./');
    await startAndProfile(a.page, 'Ann');
    await a.page.getByRole('button', { name: /New game/ }).click();
    const link = await a.page.locator('[data-link]').getAttribute('data-link');
    expect(link).toContain('#/g/');
    reader = await openDocReader(link!);

    await bPage.goto(link!);
    await startAndProfile(bPage, 'Bea');
    await bPage.getByRole('button', { name: /Join!/ }).click();

    // Seat 1 is taken: the host's invite screen moves on to placement by itself.
    for (const page of [a.page, bPage]) await expect(page.getByRole('heading', { name: 'Place your ships' })).toBeVisible();
    await shuffleAndReady(a.page);
    await shuffleAndReady(bPage);
    for (const page of [a.page, bPage]) {
      await expect(page.getByRole('heading', { name: 'Their sea' })).toBeVisible();
      // The one-time "keep this game safe" card shows on each device at the first battle.
      await page.getByRole('button', { name: 'Got it' }).click();
    }

    // Ann (seat 0) always wins; Bea only ever misses.
    const pages: [Page, Page] = [a.page, bPage];
    for (let guard = 0; guard < 140; guard++) {
      const doc = await reader.read();
      if (!doc) throw new Error('doc missing');
      if (doc.phase === 'over') break;
      expect(doc.phase).toBe('battle');
      await fireAt(pages[doc.turn], reader, doc, doc.turn, doc.turn === 0);
    }

    await expect(a.page.locator('.score')).toHaveText('Ann 1 – Bea 0');
    await expect(bPage.locator('.score')).toHaveText('Bea 0 – Ann 1');

    for (const page of pages) await page.getByRole('button', { name: /Play again/ }).click();
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Place your ships' })).toBeVisible();
    expect((await reader.read())?.round).toBe(2);

    // Bea's device goes away; Ann places and readies; Bea comes back from her saved storage.
    const saved = await bContext.storageState({ indexedDB: true });
    await bContext.close();
    await shuffleAndReady(a.page);
    await expect.poll(async () => (await reader!.read())?.ready[0]).toBe(true);

    bContext = await browser.newContext({ storageState: saved, reducedMotion: 'reduce' });
    bPage = await bContext.newPage();
    await bPage.goto(link!);
    await bPage.getByRole('button', { name: /Tap to start/ }).click();
    await expect(bPage.getByText('Ann is ready')).toBeVisible();
    await bPage.getByRole('button', { name: /Ready!/ }).click();
    for (const page of [a.page, bPage]) await expect(page.getByRole('heading', { name: 'Their sea' })).toBeVisible();
  } finally {
    await reader?.close();
    await a.context.close();
    await bContext.close().catch(() => {});
  }
});
