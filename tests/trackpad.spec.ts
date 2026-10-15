import { expect, test } from '@playwright/test';
import { mockBluesky } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

test('trackpad pinch events open post actions while ordinary scrolling and gestures outside posts retain defaults', async ({ page }) => {
  // Simulate desktop Safari capability detection; mobile tests keep native detection.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'GestureEvent', { configurable: true, value: class extends Event {} });
    let target: object | null = window;
    while (target) {
      if (Object.hasOwn(target, 'ontouchstart')) Reflect.deleteProperty(target, 'ontouchstart');
      target = Object.getPrototypeOf(target);
    }
  });
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const post = page.locator('.feed-results .post-card').first();
  await expect(post).toBeVisible();
  const text = post.locator('.post-text');
  const box = (await text.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 15);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.locator('.stack-panel').first().locator('.stack-panel__body').evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.stack-panel').first().locator('.stack-panel__body').evaluate(element => element.scrollTo(0, 0));
  const prevented = await text.evaluate(element => !element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -60 })));
  expect(prevented).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
  await page.keyboard.press('Escape');
  // The post deliberately debounces a single trackpad pinch burst.
  await page.waitForTimeout(850);
  await text.evaluate(element => {
    for (const [type, scale] of [['gesturestart', 1], ['gesturechange', 1.35], ['gestureend', 1.35]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'scale', { value: scale });
      element.dispatchEvent(event);
    }
  });
  await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.locator('.sidebar').evaluate(element => element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -60 })))).toBe(true);
  expect(await page.locator('.sidebar').evaluate(element => {
    const event = new Event('gesturechange', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'scale', { value: 1.4 });
    return element.dispatchEvent(event);
  })).toBe(true);
});

test('browser native trackpad pinch opens post actions', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native trackpad gesture injection uses Chromium CDP.');
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const text = page.locator('.feed-results .post-card .post-text').first();
  await expect(text).toBeVisible();
  const box = (await text.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture', { x: box.x + box.width / 2, y: box.y + box.height / 2, scaleFactor: 1.5, relativeSpeed: 800, gestureSourceType: 'mouse' });
  await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBeCloseTo(1, 3);
});
