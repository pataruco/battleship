import { expect, test } from '@playwright/test';

test('the app shell loads offline after a first visit', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /Tap to start/ })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Precaching finishes in the worker's install step; ready resolves once it is active.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Tap to start/ })).toBeVisible();
});
