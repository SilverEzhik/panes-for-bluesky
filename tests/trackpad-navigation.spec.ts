import { expect, test } from '@playwright/test';
import { mockBluesky } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

test('short horizontal trackpad swipes work over buttons and return to the feed pane', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const deck = page.locator('.panel-stack');
  const source = page.locator('.feed-results');
  const initial = Number(await deck.getAttribute('data-native-offset'));
  await source.locator('.post-author').first().hover();
  await page.mouse.wheel(-85, 2);
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await expect.poll(async () => Number(await deck.getAttribute('data-native-offset'))).toBeLessThan(initial - 50);
  await expect(page.locator('.stack-panel')).toHaveCount(1);
  const directoryRow = page.locator('.timeline .feed-picker-row').first();
  await directoryRow.hover(); await page.waitForTimeout(230);
  await page.mouse.wheel(85, 1);
  await expect.poll(async () => Number(await deck.getAttribute('data-native-offset'))).toBe(initial);
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  expect(control.violations).toEqual([]);
});

test('vertical scrolling over post buttons stays native and Ctrl-wheel does not move the pane stack', async ({ page }) => {
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const deck = page.locator('.panel-stack');
  const offset = await deck.getAttribute('data-native-offset');
  const panel = page.locator('.stack-panel').first();
  await panel.locator('.post-author').first().hover(); await page.mouse.wheel(0, 420);
  await expect.poll(() => panel.locator('.stack-panel__body').evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  expect(await deck.getAttribute('data-native-offset')).toBe(offset);
  // Pinching away from a post's text must retain the browser's normal gesture path.
  await panel.locator('.stack-panel__header').dispatchEvent('wheel', { deltaX: 120, deltaY: 0, ctrlKey: true, bubbles: true, cancelable: true });
  expect(await deck.getAttribute('data-native-offset')).toBe(offset);
  expect(control.violations).toEqual([]);
});

test('a horizontal gesture retains its axis despite small diagonal samples and respects editable fields', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const deck = page.locator('.panel-stack');
  const initial = Number(await deck.getAttribute('data-native-offset'));
  const author = page.locator('.feed-results .post-author').first();
  await author.dispatchEvent('wheel', { deltaX: -30, deltaY: 1, bubbles: true, cancelable: true });
  await author.dispatchEvent('wheel', { deltaX: -30, deltaY: 40, bubbles: true, cancelable: true });
  await expect.poll(async () => Number(await deck.getAttribute('data-native-offset'))).toBeLessThan(initial - 50);
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  const next = await deck.getAttribute('data-native-offset');
  await page.getByLabel('Search feeds').dispatchEvent('wheel', { deltaX: 100, deltaY: 0, bubbles: true, cancelable: true });
  expect(await deck.getAttribute('data-native-offset')).toBe(next);
});


test('a missed mouse release settles the pane without sampling stale coordinates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const deck = page.locator('.panel-stack');
  const initial = Number(await deck.getAttribute('data-native-offset'));
  await page.evaluate(() => window.addEventListener('pointerdown', event => {
    (window as any).__lastPointerId = event.pointerId;
  }, { once: true, capture: true }));
  const box = (await page.locator('.stack-panel__header').last().boundingBox())!;
  await page.mouse.move(box.x + 35, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 255, box.y + 20, { steps: 12 });
  await expect.poll(async () => Number(await deck.getAttribute('data-native-offset'))).toBeLessThan(initial - 150);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', {
    pointerId: (window as any).__lastPointerId, pointerType: 'mouse', isPrimary: true,
    buttons: 0, clientX: 0, clientY: -86,
  })));
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  const settled = Number(await deck.getAttribute('data-native-offset'));
  expect(settled).toBeLessThan(initial - 150);
  await page.mouse.up(); await page.mouse.move(300, 22);
  expect(Number(await deck.getAttribute('data-native-offset'))).toBe(settled);
  await expect(page.locator('.stack-panel')).toHaveCount(1);
});


test('vertical reading scroll does not interrupt a pane that is opening', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const alignedX = (await page.locator('.stack-panel__header').last().boundingBox())!.x;
  await page.locator('.feed-results .post-author').first().click();
  const deck = page.locator('.panel-stack');
  await expect(deck).toHaveClass(/panel-stack--moving/);
  const header = page.locator('.stack-panel__header').last();
  await header.dispatchEvent('wheel', { deltaY: 40, deltaX: 0, bubbles: true, cancelable: true });
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  expect((await header.boundingBox())!.x).toBeCloseTo(alignedX, 0);
  await expect(page.locator('.stack-panel')).toHaveCount(2);
});
