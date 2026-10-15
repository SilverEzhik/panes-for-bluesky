import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockBluesky, post } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

const viewer = (page: Page) => page.getByRole('region', { name: 'Image viewer' });
const surface = (page: Page) => viewer(page).locator('.media-panel__viewport');
async function setup(page: Page, count = 3, device?: 'touch' | 'safari') {
  if (device === 'touch') await page.addInitScript(() => { Object.defineProperty(window, 'ontouchstart', { configurable: true, value: null }); });
  if (device === 'safari') await page.addInitScript(() => {
    // Exercise the library’s Safari feature-detection path on every engine.
    Object.defineProperty(window, 'GestureEvent', { configurable: true, value: class extends Event {} });
    let target: object | null = window;
    while (target) { if (Object.hasOwn(target, 'ontouchstart')) Reflect.deleteProperty(target, 'ontouchstart'); target = Object.getPrototypeOf(target); }
  });
  const control = await mockBluesky(page);
  await page.route('https://photos.example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#267ca7"/><circle cx="800" cy="500" r="250" fill="#e8bc6b"/></svg>' }));
  const value = { ...post(), embed: { $type: 'app.bsky.embed.images#view', images: Array.from({ length: count }, (_, index) => index + 1).map(i => ({ thumb: `https://photos.example.test/${i}.svg`, fullsize: `https://photos.example.test/${i}.svg`, alt: `Test photo ${i}` })) } };
  control.respond('app.bsky.feed.getFeed', () => ({ body: { feed: [{ post: value }] } }));
  await openTestFeed(page, control);
  await page.getByRole('link', { name: 'Test photo 1', exact: true }).click();
  await expect(viewer(page)).toBeVisible();
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await expect.poll(() => viewer(page).locator('img.media-panel__image').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1600);
  return control;
}
async function pinch(target: Locator, factor: number) {
  await target.evaluate((node, scale) => {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const emit = (type: string, id: number, px: number) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id, isPrimary: id === 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: px, clientY: y }));
    // Synthetic contacts have no native pointer capture; real CDP touch is tested separately.
    const capture = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (id) { try { capture.call(this, id); } catch { /* Synthetic contact. */ } };
    emit('pointerdown', 1, x - 60); emit('pointerdown', 2, x + 60);
    emit('pointermove', 1, x - 60 * scale); emit('pointermove', 2, x + 60 * scale);
    emit('pointerup', 1, x - 60 * scale); emit('pointerup', 2, x + 60 * scale);
    Element.prototype.setPointerCapture = capture;
  }, factor);
}
async function swipe(target: Locator, dx: number, dy: number) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await target.page().mouse.move(x, y); await target.page().mouse.down();
  await target.page().mouse.move(x + dx, y + dy, { steps: 12 }); await target.page().mouse.up();
}

test('fullscreen expands the pane, fits the image and restores focus without closing Photos', async ({ page }, testInfo) => {
  await setup(page);
  const original = (await page.locator('.stack-panel').last().boundingBox())!;
  await viewer(page).getByRole('button', { name: 'Expand photo pane', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Photos — fullscreen' });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box).toEqual({ x: 0, y: 0, width: page.viewportSize()!.width, height: page.viewportSize()!.height });
  await expect(surface(page)).toHaveAttribute('data-zoom', '1.000');
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
  await expect.poll(() => page.evaluate(() => document.querySelector('.media-fullscreen')!.contains(document.activeElement))).toBe(true);
  await expect(viewer(page).getByRole('button', { name: 'Exit fullscreen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `research/verification/${testInfo.project.name}-photo-fullscreen.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert');
  await expect(page.locator('.stack-panel')).toHaveCount(2);
  await expect(viewer(page).getByRole('button', { name: 'Expand photo pane', exact: true })).toBeFocused();
  expect((await page.locator('.stack-panel').last().boundingBox())!.width).toBe(original.width);
  const filter = await viewer(page).locator('.link-panel__icon-button img').first().evaluate(node => getComputedStyle(node).filter);
  expect(filter).toContain('brightness(0)');
});

test('mouse zoom, drag and keys pan the image while fitted arrow keys browse photos', async ({ page }) => {
  await setup(page);
  await surface(page).dblclick();
  await expect(surface(page)).toHaveAttribute('data-zoom', '2.500');
  const before = Number(await surface(page).getAttribute('data-pan-x'));
  await swipe(surface(page), 80, 40);
  expect(Number(await surface(page).getAttribute('data-pan-x'))).toBeGreaterThan(before + 20);
  await surface(page).focus(); await page.keyboard.press('ArrowRight');
  await expect(viewer(page).getByRole('status')).toHaveText('1 of 3');
  await page.keyboard.press('0'); await expect(surface(page)).toHaveAttribute('data-zoom', '1.000');
  await page.keyboard.press('ArrowRight'); await expect(viewer(page).getByRole('status')).toHaveText('2 of 3');
  await viewer(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(surface(page)).toHaveAttribute('data-zoom', '1.500');
  await viewer(page).getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(surface(page)).toHaveAttribute('data-zoom', '1.000');
});

test('pointer pinch zooms, and shrinking past fit returns a fullscreen photo to its pane', async ({ page }) => {
  await setup(page, 3, 'touch');
  await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
  const offset = await page.locator('.panel-stack').getAttribute('data-native-offset');
  await pinch(surface(page), 2);
  await expect.poll(async () => Number(await surface(page).getAttribute('data-zoom'))).toBeGreaterThan(1.8);
  expect(await page.locator('.panel-stack').getAttribute('data-native-offset')).toBe(offset);
  await viewer(page).getByRole('button', { name: 'Reset image zoom' }).click();
  await pinch(surface(page), .5);
  await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toHaveCount(0);
  await expect(page.locator('.stack-panel')).toHaveCount(2);
});

for (const direction of [-1, 1]) {
  test(`a vertical mouse swipe ${direction < 0 ? 'up' : 'down'} leaves fullscreen without dismissing the gallery`, async ({ page }) => {
    await setup(page);
    await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
    await swipe(surface(page), 2, direction * 210);
    await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toHaveCount(0);
    await expect(viewer(page).getByRole('status')).toHaveText('1 of 3');
    await expect(page.locator('.stack-panel')).toHaveCount(2);
  });
}

test('trackpad horizontal swipes preview and browse once after the momentum burst ends', async ({ page }) => {
  await setup(page);
  const offset = await page.locator('.panel-stack').getAttribute('data-native-offset');
  await surface(page).hover();
  for (const delta of [40, 40, 40, 25, 10]) {
    await page.mouse.wheel(delta, 1);
    await expect(viewer(page).getByRole('status')).toHaveText('1 of 3');
  }
  await expect(viewer(page).getByRole('status')).toHaveText('2 of 3');
  expect(await page.locator('.panel-stack').getAttribute('data-native-offset')).toBe(offset);
  await page.mouse.wheel(150, 0);
  await expect(viewer(page).getByRole('status')).toHaveText('3 of 3');
});

test('Ctrl-wheel zoom and plain trackpad pan stay in fullscreen; a fitted vertical swipe returns to the pane', async ({ page }) => {
  await setup(page);
  await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
  await surface(page).hover(); await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control');
  await expect.poll(async () => Number(await surface(page).getAttribute('data-zoom'))).toBeGreaterThan(1.2);
  await page.mouse.wheel(0, 80);
  await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toBeVisible();
  await expect(viewer(page).getByRole('status')).toHaveText('1 of 3');
  await viewer(page).getByRole('button', { name: 'Reset image zoom' }).click();
  await page.waitForTimeout(250);
  await surface(page).hover(); await page.mouse.wheel(0, 240);
  await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toHaveCount(0);
});

test('Safari gesture events zoom the photo without zooming the document', async ({ page }) => {
  await setup(page, 3, 'safari');
  await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
  await surface(page).evaluate(node => {
    for (const [type, scale] of [['gesturestart', 1], ['gesturechange', 2], ['gestureend', 2]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'scale', { value: scale }); node.dispatchEvent(event);
    }
  });
  await expect(surface(page)).toHaveAttribute('data-zoom', '2.000');
  expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
});

test('native Chromium touchscreen pinch and vertical swipe use the image gesture owner', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multi-touch injection uses Chromium CDP.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  try {
    const page = await context.newPage(); await setup(page);
    await viewer(page).getByRole('button', { name: 'Expand photo pane' }).tap();
    const box = (await surface(page).boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 35, y, id: 1 }, { x: x + 35, y, id: 2 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 35 - i * 5, y, id: 1 }, { x: x + 35 + i * 5, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => Number(await surface(page).getAttribute('data-zoom'))).toBeGreaterThan(1.5);
    expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
    await viewer(page).getByRole('button', { name: 'Reset image zoom' }).tap();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3 }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 22, id: 3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toHaveCount(0);
  } finally { await context.close(); }
});


test('single-photo trackpad swipes hand off to the pane stack, including directly over the image', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 1);
  const deck = page.locator('.panel-stack');
  const offset = Number(await deck.getAttribute('data-native-offset'));
  await viewer(page).locator('img.media-panel__image').hover();
  await page.mouse.wheel(-100, 1);
  await expect.poll(async () => Number(await deck.getAttribute('data-native-offset'))).toBeLessThan(offset - 50);
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await expect(page.locator('.feed-results')).toBeInViewport();
  await expect(page.locator('.stack-panel')).toHaveCount(2);
});

test('fullscreen trackpad dismissal previews its threshold, reverses to cancel and commits after quiet', async ({ page }) => {
  await setup(page);
  await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
  const dialog = page.getByRole('dialog', { name: 'Photos — fullscreen' });
  const cue = surface(page).locator('.media-panel__dismiss-cue');
  await expect(cue).toHaveCount(0);
  await surface(page).hover(); await page.mouse.wheel(0, 50);
  await expect.poll(() => surface(page).evaluate(node => Number((node as HTMLElement).style.getPropertyValue('--photo-scale')))).toBeLessThan(1);
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'false');
  await page.mouse.wheel(0, 180);
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'true');
  await expect(dialog).toBeVisible();
  await page.mouse.wheel(0, -200);
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'false');
  await page.waitForTimeout(300);
  await expect(dialog).toBeVisible();
  await expect(cue).toHaveCount(0);
  await page.mouse.wheel(0, -240);
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'true');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

async function safariGesture(target: Locator, type: string, scale: number) {
  await target.evaluate((node, values) => {
    const event = new Event(values.type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'scale', { value: values.scale }); node.dispatchEvent(event);
  }, { type, scale });
}

test('pinch dismissal is deliberate, reversible, cancelled safely and waits for gestureend', async ({ page }) => {
  await setup(page, 3, 'safari');
  await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
  const dialog = page.getByRole('dialog', { name: 'Photos — fullscreen' });
  await safariGesture(surface(page), 'gesturestart', 1);
  await safariGesture(surface(page), 'gesturechange', .7);
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'false');
  await expect(surface(page).locator('.media-panel__dismiss-cue')).toHaveCount(0);
  await safariGesture(surface(page), 'gestureend', .7);
  await expect(dialog).toBeVisible();
  await safariGesture(surface(page), 'gesturestart', 1);
  await safariGesture(surface(page), 'gesturechange', .55);
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'true');
  await expect(dialog).toBeVisible();
  await safariGesture(surface(page), 'gesturechange', .9);
  await safariGesture(surface(page), 'gestureend', .9);
  await expect(dialog).toBeVisible();
  await expect(surface(page)).toHaveAttribute('data-dismiss-progress', '0.000');
  await safariGesture(surface(page), 'gesturestart', 1);
  await safariGesture(surface(page), 'gesturechange', .55);
  await safariGesture(surface(page), 'gesturecancel', .55);
  await expect(dialog).toBeVisible();
  await expect(surface(page)).toHaveAttribute('data-dismiss-progress', '0.000');
  await safariGesture(surface(page), 'gesturestart', 1);
  await safariGesture(surface(page), 'gesturechange', .55);
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'true');
  await expect(dialog).toBeVisible();
  await safariGesture(surface(page), 'gestureend', .55);
  await expect(dialog).toHaveCount(0);
});

test('zooming out of a magnified fullscreen photo stops at fit and requires a fresh pinch to dismiss', async ({ page }) => {
  await setup(page, 3, 'touch');
  await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
  await pinch(surface(page), 2);
  await expect(surface(page)).toHaveAttribute('data-zoom', '2.000');
  await pinch(surface(page), .2);
  await expect(surface(page)).toHaveAttribute('data-zoom', '1.000');
  await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toBeVisible();
  await pinch(surface(page), .5);
  await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toHaveCount(0);
});

test('wheel zoom is frame-smoothed and preserves zoom when switching to trackpad pan', async ({ page }) => {
  await setup(page);
  await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
  const samples = await surface(page).evaluate(async node => {
    const box = node.getBoundingClientRect();
    // An ordinary short trackpad pinch should visibly zoom, even with small samples.
    for (let i = 0; i < 6; i++) node.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -10, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
    const values: number[] = [];
    for (let i = 0; i < 16; i++) {
      await new Promise(requestAnimationFrame);
      values.push(Number((node as HTMLElement).style.getPropertyValue('--photo-scale')));
    }
    return values;
  });
  expect(samples[0]).toBeGreaterThan(1);
  expect(samples[0]).toBeLessThan(1.7);
  expect(samples.at(-1)).toBeGreaterThan(1.7);
  expect(samples.at(-1)).toBeLessThan(1.9);
  expect(new Set(samples.map(v => v.toFixed(3))).size).toBeGreaterThan(3);
  await surface(page).hover();
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -40); await page.keyboard.up('Control');
  await page.mouse.wheel(30, 0);
  await expect.poll(async () => Number(await surface(page).getAttribute('data-zoom'))).toBeGreaterThan(2.4);
  await expect(viewer(page).getByRole('status')).toHaveText('1 of 3');
});


test('mouse dismissal shows a pull preview, cancels on blur and only commits on release', async ({ page }) => {
  await setup(page);
  await viewer(page).getByRole('button', { name: 'Expand photo pane' }).click();
  const dialog = page.getByRole('dialog', { name: 'Photos — fullscreen' });
  const box = (await surface(page).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + 210, { steps: 12 });
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'true');
  await expect(dialog).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(surface(page)).toHaveAttribute('data-dismiss-progress', '0.000');
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y - 210, { steps: 12 });
  await expect(surface(page)).toHaveAttribute('data-dismiss-armed', 'true');
  await expect(dialog).toBeVisible();
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
});
