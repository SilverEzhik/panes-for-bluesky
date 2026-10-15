import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockBluesky, post } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

const viewport = (page: Page) => page.locator('.media-panel__viewport');
const fullscreen = (page: Page) => page.getByRole('dialog', { name: 'Photos — fullscreen' });

async function setup(page: Page, safari = false) {
  if (safari) await page.addInitScript(() => {
    // Synthetic desktop Safari events must use the library's Safari device path.
    Object.defineProperty(window, 'GestureEvent', { configurable: true, value: class extends Event {} });
    let target: object | null = window;
    while (target) {
      if (Object.hasOwn(target, 'ontouchstart')) Reflect.deleteProperty(target, 'ontouchstart');
      target = Object.getPrototypeOf(target);
    }
  });
  const control = await mockBluesky(page);
  await page.route('https://lift-photo.example.test/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#267ca7"/></svg>',
  }));
  control.respond('app.bsky.feed.getFeed', () => ({ body: { feed: [{ post: {
    ...post(), embed: { $type: 'app.bsky.embed.images#view', images: [{
      thumb: 'https://lift-photo.example.test/photo.svg', fullsize: 'https://lift-photo.example.test/photo.svg', alt: 'Lift test photo',
    }] },
  } }] } }));
  await openTestFeed(page, control);
  await page.getByRole('link', { name: 'Lift test photo', exact: true }).click();
  await expect(viewport(page)).toBeVisible();
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await expect.poll(() => viewport(page).locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1600);
}

async function safari(target: Locator, type: string, scale: number) {
  await target.evaluate((node, sample) => {
    const box = node.getBoundingClientRect();
    const event = new Event(sample.type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      scale: { value: sample.scale }, rotation: { value: 0 },
      clientX: { value: box.left + box.width / 2 }, clientY: { value: box.top + box.height / 2 },
    });
    node.dispatchEvent(event);
  }, { type, scale });
}

async function expectPromoted(page: Page) {
  await expect(fullscreen(page)).toBeVisible();
  await expect(page.locator('.photo-lift')).toHaveCount(0);
  await expect(viewport(page)).toHaveAttribute('data-lifted', 'false');
  await expect(fullscreen(page).getByAltText('Lift test photo')).toBeVisible();
  await expect.poll(() => fullscreen(page).evaluate(node => node.contains(document.activeElement))).toBe(true);
  await expect(page.locator('.stack-panel')).toHaveCount(2);
}

test('a held outward pinch lifts the photo beyond its pane and promotes only on release', async ({ page }) => {
  await setup(page, true);
  const pane = (await page.locator('.stack-panel').last().boundingBox())!;
  await safari(viewport(page), 'gesturestart', 1);
  await safari(viewport(page), 'gesturechange', 1.8);
  await expect(page.locator('body > .photo-lift')).toBeVisible();
  await expect(viewport(page)).toHaveAttribute('data-lifted', 'true');
  await expect(viewport(page).locator('img')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.photo-lift')).toHaveCSS('pointer-events', 'none');
  await expect(fullscreen(page)).toHaveCount(0);
  await expect.poll(async () => {
    const lifted = (await page.locator('.photo-lift img').boundingBox())!;
    return lifted.x < pane.x - 20 || lifted.x + lifted.width > pane.x + pane.width + 20;
  }).toBe(true);
  await safari(viewport(page), 'gestureend', 1.8);
  await expectPromoted(page);
  const before = Number(await viewport(page).getAttribute('data-zoom'));
  await safari(viewport(page), 'gesturestart', 1);
  await safari(viewport(page), 'gesturechange', 1.4);
  await expect(page.locator('.photo-lift')).toHaveCount(0);
  await expect.poll(async () => Number(await viewport(page).getAttribute('data-zoom'))).toBeGreaterThan(before);
  await safari(viewport(page), 'gestureend', 1.4);
  await expect(fullscreen(page)).toBeVisible();
});

test('reversing, cancelling, or interrupting a lifted pinch restores the photo pane', async ({ page }) => {
  await setup(page, true);
  for (const ending of ['reverse', 'cancel', 'blur', 'resize'] as const) {
    await safari(viewport(page), 'gesturestart', 1);
    await safari(viewport(page), 'gesturechange', 1.8);
    await expect(page.locator('.photo-lift')).toBeVisible();
    if (ending === 'reverse') {
      await safari(viewport(page), 'gesturechange', 1);
      await safari(viewport(page), 'gestureend', 1);
    } else if (ending === 'cancel') await safari(viewport(page), 'gesturecancel', 1.8);
    else if (ending === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.setViewportSize({ width: 980, height: 760 });
    await expect(page.locator('.photo-lift')).toHaveCount(0);
    await expect(fullscreen(page)).toHaveCount(0);
    await expect(viewport(page)).toHaveAttribute('data-lifted', 'false');
    await expect(viewport(page)).toHaveAttribute('data-zoom', '1.000');
    await expect(viewport(page).locator('img')).toBeVisible();
  }
});

test('a small trackpad pinch keeps lifting across the source pane and expands after the burst ends', async ({ page }) => {
  await setup(page);
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const deck = page.locator('.panel-stack');
  const before = await deck.getAttribute('data-native-offset');
  let previousZoom = 1;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(index => {
      const target = document.querySelector<HTMLElement>(index < 2 ? '.media-panel__viewport' : '.stack-panel__header')!;
      const box = target.getBoundingClientRect();
      target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -8,
        clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
    }, i);
    await page.clock.runFor(32);
    await expect.poll(() => page.locator('.photo-lift').count()).toBe(1);
    await expect.poll(async () => Number(await viewport(page).getAttribute('data-zoom'))).toBeGreaterThan(previousZoom);
    previousZoom = Number(await viewport(page).getAttribute('data-zoom'));
    await expect(fullscreen(page)).toHaveCount(0);
    expect(await deck.getAttribute('data-native-offset')).toBe(before);
  }
  await page.clock.resume();
  await expectPromoted(page);
});

test('native touchscreen pinch lifts while contacts remain down and promotes after touch release', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multi-touch injection uses Chromium CDP.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await setup(page);
    const box = (await viewport(page).boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 35, y, id: 1 }, { x: x + 35, y, id: 2 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { x: x - 35 - i * 4, y, id: 1 }, { x: x + 35 + i * 4, y, id: 2 },
    ] });
    await expect(page.locator('.photo-lift')).toBeVisible();
    await expect(fullscreen(page)).toHaveCount(0);
    expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expectPromoted(page);
  } finally { await context.close(); }
});
