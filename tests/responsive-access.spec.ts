import { expect, test, type Locator } from '@playwright/test';
import { mockBluesky } from './fixtures';

async function expectTouchable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect.poll(() => control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight &&
      rect.left >= 0 && rect.right <= innerWidth && !!hit && element.contains(hit);
  })).toBe(true);
}

for (const width of [600, 601, 667, 768, 800, 801, 844, 1024]) {
  test(`navigation remains reachable at ${width}px in a short landscape viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 375 });
    await mockBluesky(page);
    await page.goto('/');
    await expect(page.locator('.feed-scroll .post-card')).toHaveCount(30);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-navigation-mode', width >= 768 ? 'expanded' : 'compact');
    if (width >= 768) await expect(page.locator('.brand-word')).toBeVisible();
    else await expect(page.locator('.brand-word')).toBeHidden();
    for (const title of ['Timeline', 'Mentions & activity', 'Discover', 'Search', 'Profile']) {
      await expectTouchable(page.locator('.sidebar').getByTitle(title, { exact: true }));
    }
    await expectTouchable(page.getByRole('button', { name: 'New post', exact: true }));
    await expectTouchable(page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }));
    await page.locator('.feed-scroll .post-text').first().click();
    await expect(page.locator('.stack-panel')).toHaveCount(1);
    await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
    await expectTouchable(page.getByRole('button', { name: 'New post', exact: true }));
    await expectTouchable(page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }));
  });
}

test('compact navigation dismisses without replacing the panel stack', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBluesky(page);
  await page.goto('/');
  await page.locator('.feed-scroll .post-text').first().click();
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  // Move the deck to its timeline anchor so its navigation toggle is exposed.
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  const close = page.getByRole('button', { name: 'Close navigation', exact: true });
  await expectTouchable(close);
  await close.click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/nav-expanded/);
  await expect(page.locator('.stack-panel')).toHaveCount(1);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss navigation', exact: true }).click({ position: { x: 365, y: 300 } });
  await expect(page.locator('.app-shell')).not.toHaveClass(/nav-expanded/);
  await expect(page.locator('.stack-panel')).toHaveCount(1);
});

test('desktop timeline origin stays fixed when a sheet opens and closes', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockBluesky(page);
  await page.goto('/');
  const list = page.locator('.feed-scroll');
  await expect(page.locator('.post-card')).toHaveCount(30);
  const origin = await list.evaluate(element => element.getBoundingClientRect().top);
  await list.locator('.post-text').first().click();
  await expect(page.locator('.stack-panel')).toHaveCount(1);
  expect(await list.evaluate(element => element.getBoundingClientRect().top)).toBe(origin);
  await page.getByRole('button', { name: 'Close Conversation', exact: true }).click();
  expect(await list.evaluate(element => element.getBoundingClientRect().top)).toBe(origin);
});

test('dialog respects a smaller visual viewport and keeps submit reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBluesky(page);
  await page.goto('/');
  await page.locator('.account-summary').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // This checks the CSS contract, not an emulated iOS virtual keyboard.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--visual-viewport-height', '330px');
    document.documentElement.style.setProperty('--visual-viewport-top', '100px');
  });
  const dialog = page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(100);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(430);
  await expectTouchable(dialog.getByRole('button', { name: 'Sign in', exact: true }));
});

test('repeated open and close cannot scroll the deck ancestors or shift the timeline', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockBluesky(page);
  await page.goto('/');
  const posts = page.locator('.feed-scroll .post-card');
  await expect(posts).toHaveCount(30);
  const baseline = await page.locator('.feed-scroll').evaluate(element => ({ top: element.getBoundingClientRect().top, scrollTop: element.scrollTop }));
  async function assertOrigins() {
    const layout = await page.evaluate(() => ({
      ancestors: ['html', 'body', '.app-shell', '.workspace', '.panel-stack'].map(selector => {
        const element = document.querySelector(selector)!;
        return { selector, left: element.scrollLeft, top: element.scrollTop };
      }),
      feed: (() => { const element = document.querySelector('.feed-scroll')!; return { top: element.getBoundingClientRect().top, scrollTop: element.scrollTop }; })(),
    }));
    expect(layout.ancestors.filter(element => element.left !== 0 || element.top !== 0)).toEqual([]);
    expect(layout.feed).toEqual(baseline);
  }
  const deck = page.locator('.panel-stack');
  for (let cycle = 0; cycle < 12; cycle++) {
    // Await native settling so locator actionability does not scroll a partly
    // covered descendant while the closing deck is still moving horizontally.
    await expect(deck).not.toHaveClass(/panel-stack--moving/);
    await posts.first().locator('.post-conversation-opener').click();
    await expect(page.locator('.stack-panel')).toHaveCount(1);
    await expect(deck).not.toHaveClass(/panel-stack--moving/);
    await assertOrigins();
    await page.getByRole('button', { name: 'Close Conversation', exact: true }).click();
    await expect(page.locator('.stack-panel')).toHaveCount(0);
    await expect(deck).not.toHaveClass(/panel-stack--moving/);
    await assertOrigins();
  }
});
