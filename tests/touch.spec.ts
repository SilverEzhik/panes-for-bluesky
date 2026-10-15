import { expect, test, type CDPSession } from '@playwright/test';
import { mockBluesky } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

async function swipe(cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  for (let step = 1; step <= 20; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 20, y: from.y + (to.y - from.y) * step / 20, id: 1 }] });
    await new Promise(resolve => setTimeout(resolve, 12));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('native touchscreen vertical scrolling and horizontal sheet swipe work on a phone', async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Chromium CDP supplies real touchscreen input; mouse/wheel run on every engine.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const posts = page.locator('.feed-results .post-card');
  await expect(posts).toHaveCount(30);
  await posts.first().tap();
  const panel = page.locator('.stack-panel');
  await expect(panel).toHaveCount(2);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await panel.last().getByRole('button', { name: "View Panel Tester's profile", exact: true }).first().tap();
  await expect(panel).toHaveCount(3);
  await expect(panel.last().locator('.post-card')).toHaveCount(30);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  const cdp = await context.newCDPSession(page);
  await swipe(cdp, { x: 210, y: 680 }, { x: 210, y: 280 });
  await expect.poll(() => panel.last().locator('.stack-panel__body').evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  await expect(panel).toHaveCount(3);
  // Let native kinetic scrolling finish before starting the separate header gesture.
  await expect.poll(async () => panel.last().locator('.stack-panel__body').evaluate(async element => {
    const first = element.scrollTop;
    await new Promise(resolve => setTimeout(resolve, 150));
    return Math.abs(element.scrollTop - first);
  })).toBeLessThan(1);
  const header = (await panel.last().locator('.stack-panel__header').boundingBox())!;
  await page.evaluate(() => {
    (window as any).__touchTrace = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture', 'touchstart', 'touchend']) document.addEventListener(type, event => {
      const pointer = event as PointerEvent;
      (window as any).__touchTrace.push({ type, target: (event.target as Element).className, x: pointer.clientX, y: pointer.clientY, button: pointer.button, primary: pointer.isPrimary });
    }, true);
  });
  await swipe(cdp, { x: header.x + 40, y: header.y + 22 }, { x: header.x + 230, y: header.y + 22 });
  await testInfo.attach('native-touch-events.json', { body: JSON.stringify(await page.evaluate(() => ({ events: (window as any).__touchTrace, header: document.querySelector('.stack-panel:last-child .stack-panel__header')?.getBoundingClientRect().toJSON() })), null, 2), contentType: 'application/json' });
  await expect(panel).toHaveCount(3);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await page.getByRole('button', { name: 'Close Profile', exact: true }).tap();
  await expect(panel).toHaveCount(2);
  await page.screenshot({ path: `research/verification/${testInfo.project.name}-native-touch.png` });
  await context.close();
});

for (const gesture of ['pinch apart', 'two finger pull down'] as const) {
  test(`native ${gesture} opens a post using the browser touchscreen input pipeline`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Native multi-touch injection uses Chromium CDP.');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const control = await mockBluesky(page);
    await openTestFeed(page, control);
    const text = page.locator('.feed-results .post-card .post-text').first();
    await expect(text).toBeVisible();
    const box = (await text.boundingBox())!;
    const a = { x: box.x + 50, y: box.y + 20, id: 1 };
    const b = { x: box.x + 130, y: box.y + 20, id: 2 };
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
    for (let step = 1; step <= 12; step++) {
      const travel = step * 5;
      const points = gesture === 'pinch apart'
        ? [{ ...a, x: a.x - travel }, { ...b, x: b.x + travel }]
        : [{ ...a, y: a.y + travel }, { ...b, y: b.y + travel }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
      await new Promise(resolve => setTimeout(resolve, 12));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (gesture === 'pinch apart') await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
    else await expect(page.locator('.stack-panel')).toHaveCount(2);
    await context.close();
  });
}

test('touch pointer recognition for pinch and two finger pull down is consistent across engines', async ({ page }) => {
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  const post = page.locator('.feed-results .post-card').first();
  await expect(post).toBeVisible();
  for (const gesture of ['pinch', 'pull']) {
    await post.evaluate((element, mode) => {
      const target = element.querySelector('.post-text')!;
      const emit = (type: string, id: number, x: number, y: number) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id, isPrimary: id === 1, clientX: x, clientY: y }));
      emit('pointerdown', 1, 100, 120); emit('pointerdown', 2, 180, 120);
      emit('pointermove', 1, mode === 'pinch' ? 50 : 100, mode === 'pull' ? 180 : 120);
      emit('pointermove', 2, mode === 'pinch' ? 230 : 180, mode === 'pull' ? 180 : 120);
      emit('pointerup', 1, 100, 180); emit('pointerup', 2, 180, 180);
    }, gesture);
    if (gesture === 'pinch') {
      await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } else {
      await expect(page.locator('.stack-panel')).toHaveCount(2);
      await page.getByRole('button', { name: 'Close Conversation' }).click();
      await expect(page.locator('.stack-panel')).toHaveCount(1);
    }
    // The gesture's click suppression deliberately outlives the sheet animation.
    await page.waitForTimeout(850);
  }
});
