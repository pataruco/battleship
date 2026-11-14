// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need.
// Run with `node scripts/icons.mjs` (uses Playwright's Chromium).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');
const BACKGROUND = '#0b3d5c';

/**
 * `pad` is the share of the canvas kept as margin on each side. The maskable icon needs no extra
 * padding: the artwork's subject already sits inside the central 80% circle and the waves bleed.
 */
async function render(page, file, size, pad) {
  const inner = Math.round(size * (1 - pad * 2));
  const offset = Math.round(size * pad);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:${BACKGROUND}"><div style="position:absolute;left:${offset}px;top:${offset}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`,
  );
  writeFileSync(join(dir, file), await page.screenshot({ type: 'png' }));
  console.log('wrote', file);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await render(page, 'icon-192.png', 192, 0);
  await render(page, 'icon-512.png', 512, 0);
  await render(page, 'maskable-512.png', 512, 0);
  await render(page, 'apple-touch-icon-180.png', 180, 0);
} finally {
  await browser.close();
}
