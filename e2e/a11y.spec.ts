import { expect, test, type Page } from '@playwright/test';
import { newPlayer, openDocReader, shuffleAndReady, startAndProfile, type DocReader } from './helpers';

/** Visible interactive elements that have no accessible name, and gridcells without an aria-label. */
async function unnamed(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (e: Element) => {
      const r = (e as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    };
    const nameOf = (e: Element): string => {
      const aria = e.getAttribute('aria-label')?.trim();
      if (aria) return aria;
      const by = e.getAttribute('aria-labelledby');
      if (by) {
        const text = by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim();
        if (text) return text;
      }
      if (e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement) {
        const label = Array.from(e.labels ?? [])
          .map((l) => l.textContent ?? '')
          .join(' ')
          .trim();
        if (label) return label;
      }
      const text = (e.textContent ?? '').trim();
      if (text) return text;
      return (e.getAttribute('title') ?? e.querySelector('img[alt]')?.getAttribute('alt') ?? '').trim();
    };
    const bad: string[] = [];
    for (const e of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="gridcell"]')) {
      if (e instanceof HTMLInputElement && e.type === 'hidden') continue;
      const isCell = e.getAttribute('role') === 'gridcell';
      if (!isCell && !visible(e) && !(e instanceof HTMLInputElement && e.classList.contains('sr'))) continue;
      if (isCell && !e.getAttribute('aria-label')?.trim()) bad.push(`gridcell without aria-label: ${e.outerHTML.slice(0, 80)}`);
      else if (!nameOf(e)) bad.push(e.outerHTML.slice(0, 100));
    }
    for (const g of document.querySelectorAll('[role="grid"]')) {
      if (!g.getAttribute('aria-label')) bad.push('grid without aria-label');
    }
    return bad;
  });
}

async function expectAccessible(page: Page, screen: string): Promise<void> {
  expect(await unnamed(page), `${screen}: elements without an accessible name`).toEqual([]);
}

test('every screen names its controls, and a keyboard alone can aim and fire', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  let reader: DocReader | undefined;
  try {
    await a.page.goto('./');
    await expect(a.page.getByRole('button', { name: /Tap to start/ })).toBeVisible();
    await expectAccessible(a.page, 'start');

    await a.page.getByRole('button', { name: /Tap to start/ }).click();
    await expect(a.page.getByLabel('Your name')).toBeVisible();
    await expectAccessible(a.page, 'profile');

    await a.page.getByLabel('Your name').fill('Ann');
    await a.page.getByRole('button', { name: /Save/ }).click();
    await expect(a.page.getByRole('button', { name: /New game/ })).toBeVisible();
    await expectAccessible(a.page, 'home');

    await a.page.getByRole('button', { name: /New game/ }).click();
    const link = await a.page.locator('[data-link]').getAttribute('data-link');
    await expectAccessible(a.page, 'invite');
    reader = await openDocReader(link!);

    await b.page.goto(link!);
    await startAndProfile(b.page, 'Bea');
    await b.page.getByRole('button', { name: /Join!/ }).click();
    for (const page of [a.page, b.page]) await expect(page.getByRole('heading', { name: 'Place your ships' })).toBeVisible();
    await expectAccessible(a.page, 'placement');

    await shuffleAndReady(a.page);
    await shuffleAndReady(b.page);
    for (const page of [a.page, b.page]) {
      await expect(page.getByRole('heading', { name: 'Their sea' })).toBeVisible();
      await page.getByRole('button', { name: 'Got it' }).click();
    }
    await expectAccessible(a.page, 'battle');

    // Keyboard only, on whichever player holds the turn: Tab to the grid, arrows, Enter, Tab to FIRE, Enter.
    const doc = await reader.read();
    const seat = doc!.turn;
    const page = seat === 0 ? a.page : b.page;
    const shots = doc!.shots[seat].length;
    await expect(page.getByRole('button', { name: /FIRE!/ })).toBeVisible();
    // macOS WebKit only Tabs to buttons with Option held, as Safari does by default.
    const tab = test.info().project.name === 'webkit' ? 'Alt+Tab' : 'Tab';
    const focusedIn = (sel: string) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);
    for (let i = 0; i < 40 && !(await focusedIn('.their [role="grid"]')); i++) await page.keyboard.press(tab);
    expect(await focusedIn('.their [role="grid"]')).toBe(true);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.their').getByRole('gridcell', { name: 'C2, water, aimed', exact: true })).toBeVisible();
    for (let i = 0; i < 10 && !(await focusedIn('button.fire')); i++) await page.keyboard.press(tab);
    expect(await focusedIn('button.fire')).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await reader!.read())?.shots[seat].length, { intervals: [200] }).toBe(shots + 1);
  } finally {
    await reader?.close();
    await a.context.close();
    await b.context.close();
  }
});
