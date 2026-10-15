import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
const result = { checkedAt: new Date().toISOString(), errors: [] };
page.on('pageerror', error => result.errors.push(error.message));
try {
  await page.goto(process.env.PANES_URL || 'http://localhost:5173');
  await page.locator('.timeline .feed-picker-row').filter({ has: page.getByText('Science', { exact: true }) }).click({ timeout: 45000 });
  const thumbnail = page.locator('.feed-results .timeline-image-link').first();
  await thumbnail.waitFor({ timeout: 45000 }); await thumbnail.click();
  await page.locator('.panel-stack--moving').waitFor({ state: 'hidden' });
  const viewer = page.getByRole('region', { name: 'Image viewer' });
  const image = viewer.locator('.media-panel__image');
  await image.waitFor();
  await page.waitForFunction(() => { const image = document.querySelector('.media-panel__image'); return image?.complete && image.naturalWidth > 0; }, { timeout: 30000 });
  result.imageWidth = await image.evaluate(node => node.naturalWidth);
  result.originalPane = await page.locator('.stack-panel').last().boundingBox();
  const originalImage = await image.boundingBox();
  const photoViewport = viewer.locator('.media-panel__viewport');
  const paneBox = await photoViewport.boundingBox();
  const x0 = paneBox.x + paneBox.width / 2, y0 = paneBox.y + paneBox.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0 - 35, y: y0, id: 1 }, { x: x0 + 35, y: y0, id: 2 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
    { x: x0 - 35 - i * 4, y: y0, id: 1 }, { x: x0 + 35 + i * 4, y: y0, id: 2 },
  ] });
  await page.locator('.photo-lift').waitFor();
  result.lift = { original: originalImage, held: await page.locator('.photo-lift img').boundingBox(), fullscreenWhileHeld: await page.locator('.media-fullscreen').count() };
  await mkdir('research/verification', { recursive: true });
  await page.screenshot({ path: 'research/verification/live-photo-pinch-lift.png' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('dialog', { name: 'Photos — fullscreen' }).waitFor();
  await page.locator('.photo-lift').waitFor({ state: 'hidden' });
  await viewer.getByRole('button', { name: 'Reset image zoom' }).click();
  const dialog = page.getByRole('dialog', { name: 'Photos — fullscreen' });
  result.fullscreen = await dialog.boundingBox();
  const surface = viewer.locator('.media-panel__viewport');
  await page.waitForFunction(() => document.querySelector('.media-panel__viewport')?.getAttribute('data-zoom') === '1.000');
  result.fitZoom = await surface.getAttribute('data-zoom');
  await surface.hover(); await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -10);
  await page.keyboard.up('Control');
  await page.waitForFunction(() => Number(document.querySelector('.media-panel__viewport')?.getAttribute('data-zoom')) > 1.7);
  result.zoom = Number(await surface.getAttribute('data-zoom'));
  await page.mouse.wheel(60, 40);
  await page.waitForFunction(() => { const node = document.querySelector('.media-panel__viewport'); return Math.abs(Number(node?.getAttribute('data-pan-x'))) + Math.abs(Number(node?.getAttribute('data-pan-y'))) > 1; });
  result.pan = { x: Number(await surface.getAttribute('data-pan-x')), y: Number(await surface.getAttribute('data-pan-y')) };
  await viewer.getByRole('button', { name: 'Reset image zoom' }).click();
  await mkdir('research/verification', { recursive: true });
  await page.screenshot({ path: 'research/verification/live-photo-fullscreen.png' });
  const box = await surface.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + 230, { steps: 12 });
  await page.waitForFunction(() => document.querySelector('.media-panel__viewport')?.getAttribute('data-dismiss-armed') === 'true');
  result.dismissPreview = { armed: await surface.getAttribute('data-dismiss-armed'), stillFullscreen: await dialog.count(), cueAbsent: await surface.locator('.media-panel__dismiss-cue').count() === 0 };
  await page.screenshot({ path: 'research/verification/live-photo-dismiss-preview.png' });
  await page.mouse.up();
  await dialog.waitFor({ state: 'hidden' });
  result.restoredPane = await page.locator('.stack-panel').last().boundingBox();
  result.remainingPanes = await page.locator('.stack-panel').count();
  result.backgroundRestored = await page.locator('.app-shell').evaluate(node => !node.inert && !node.hasAttribute('aria-hidden'));
  const deck = page.locator('.panel-stack');
  const beforeSwipe = Number(await deck.getAttribute('data-native-offset'));
  await surface.hover(); await page.mouse.wheel(-100, 1);
  await page.waitForFunction(before => Number(document.querySelector('.panel-stack')?.getAttribute('data-native-offset')) < before - 50, beforeSwipe);
  await page.locator('.panel-stack--moving').waitFor({ state: 'hidden' });
  result.trackpadPaneSwipe = { before: beforeSwipe, after: Number(await deck.getAttribute('data-native-offset')) };
  result.pass = result.imageWidth > 0 && result.lift.held.width > result.lift.original.width * 1.1 && result.lift.fullscreenWhileHeld === 0 && result.fullscreen.x === 0 && result.fullscreen.y === 0 && result.fullscreen.width === 1280 && result.fullscreen.height === 900 && result.fitZoom === '1.000' && result.zoom > 1.5 && (Math.abs(result.pan.x) + Math.abs(result.pan.y) > 1) && result.remainingPanes === 2 && result.originalPane.width === result.restoredPane.width && result.backgroundRestored && result.dismissPreview.armed === 'true' && result.dismissPreview.stillFullscreen === 1 && result.dismissPreview.cueAbsent && result.trackpadPaneSwipe.after < beforeSwipe - 50 && !result.errors.length;
} catch (error) { result.failure = String(error); result.pass = false; }
finally {
  await mkdir('research/verification', { recursive: true });
  await writeFile('research/verification/live-photo-smoke.json', JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
