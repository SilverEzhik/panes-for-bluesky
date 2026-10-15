import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockBluesky, me } from './fixtures';

const panels = (page: Page) => page.locator('.stack-panel');
const feedPosts = (page: Page) => page.locator('.feed-scroll .post-card');
async function openConversation(page: Page) {
  await feedPosts(page).first().click();
  await expect(panels(page)).toHaveCount(1);
  await expect(panels(page).last().getByText('Panel test post 90.', { exact: false })).toBeVisible();
  await expect.poll(async () => { const box = (await panels(page).last().boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
}
async function openTwoPanels(page: Page) {
  await openConversation(page);
  await panels(page).last().getByRole('button', { name: "View Panel Tester's profile", exact: true }).first().click();
  await expect(panels(page)).toHaveCount(2);
  await expect(panels(page).last().getByText('A deterministic profile used by browser tests.')).toBeVisible();
  await expect.poll(async () => { const box = (await panels(page).last().boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
}
async function drag(page: Page, locator: Locator, dx: number, dy = 0) {
  const box = (await locator.boundingBox())!;
  // Keep the requested drag within the browser viewport. Firefox's synthetic
  // pointer stream does not represent a physical outside-window release.
  const x = Math.max(box.x + 8, Math.min(box.x + Math.min(90, box.width / 3), page.viewportSize()!.width - 20 - Math.max(0, dx)));
  expect(x + dx).toBeLessThan(page.viewportSize()!.width);
  expect(x + dx).toBeGreaterThan(0);
  const y = box.y + Math.min(20, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 18 });
  await page.mouse.up();
}
async function signIn(page: Page) {
  await page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to Bluesky' });
  await dialog.getByLabel('Handle or email').fill(me.handle);
  await dialog.getByLabel('App password', { exact: true }).fill('test-app-password');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => { await mockBluesky(page); await page.goto('/'); await expect(feedPosts(page)).toHaveCount(30); });

test('conversation and profile form real stacked sheets; a header drag browses without dismissing', async ({ page }, testInfo) => {
  await openTwoPanels(page);
  await expect(panels(page).last()).toHaveCSS('touch-action', 'pan-y pinch-zoom');
  const first = await panels(page).first().boundingBox();
  const last = await panels(page).last().boundingBox();
  expect(last!.x).toBeGreaterThan(first!.x);
  expect(last!.x + last!.width).toBeLessThanOrEqual(1025);
  await page.screenshot({ path: `research/verification/${testInfo.project.name}-stacked.png` });
  const beforeDrag = (await panels(page).last().boundingBox())!.x;
  await drag(page, panels(page).last().locator('.stack-panel__header'), 210);
  await expect(panels(page)).toHaveCount(2);
  await expect.poll(async () => (await panels(page).last().boundingBox())!.x).toBeGreaterThan(beforeDrag + 80);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await page.getByRole('button', { name: 'Close Profile', exact: true }).click();
  await expect(panels(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Close Conversation' }).click();
  await expect(panels(page)).toHaveCount(0);
});

test('pointer body drag and horizontal trackpad wheel browse sheets while vertical wheel scrolls content', async ({ page }) => {
  await openTwoPanels(page);
  const newest = panels(page).last();
  const originalX = (await newest.boundingBox())!.x;
  await drag(page, newest.locator('.profile-bio'), 280);
  await expect.poll(async () => (await newest.boundingBox())!.x).toBeGreaterThan(originalX + 80);
  await expect(panels(page)).toHaveCount(2);
  // Return to the newest sheet using a real wheel event from the browser input API.
  const visiblePanel = await newest.boundingBox();
  await page.mouse.move(Math.min(1000, visiblePanel!.x + 50), 250);
  await page.mouse.wheel(800, 0);
  await expect.poll(async () => (await newest.boundingBox())!.x).toBeLessThan(originalX + 2);
  const body = newest.locator('.stack-panel__body');
  await page.mouse.move(originalX + 160, 450);
  await page.mouse.wheel(0, 550);
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  await expect(panels(page)).toHaveCount(2);
});

test('keyboard opens posts, browses sheets, and closes the newest panel', async ({ page }) => {
  await feedPosts(page).first().locator('.post-conversation-opener').focus();
  await page.keyboard.press('Enter');
  await expect(panels(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(panels(page)).toHaveCount(0);
  await openTwoPanels(page);
  const originalX = (await panels(page).last().boundingBox())!.x;
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(async () => (await panels(page).last().boundingBox())!.x).toBeGreaterThan(originalX + 80);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await panels(page).last().boundingBox())!.x).toBeLessThan(originalX + 2);
  await page.keyboard.press('Escape');
  await expect(panels(page)).toHaveCount(1);
});

test('a short directional flick advances from an intermediate panel anchor', async ({ page }) => {
  await openTwoPanels(page);
  await panels(page).last().locator('.post-card').nth(1).click();
  await expect(panels(page)).toHaveCount(3);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  const newestX = (await panels(page).last().boundingBox())!.x;
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await expect.poll(async () => (await panels(page).last().boundingBox())!.x).toBeGreaterThan(newestX + 100);
  await drag(page, panels(page).nth(1).locator('.profile-bio'), -22);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await expect.poll(async () => Math.abs((await panels(page).last().boundingBox())!.x - newestX)).toBeLessThan(2);
});

test('mobile navigation and full width sheets fit a phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(feedPosts(page)).toHaveCount(30);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search Bluesky' }).fill('panels');
  await page.locator('.search-bar').getByRole('button', { name: 'Search' }).click();
  await expect(feedPosts(page)).toHaveCount(1);
  await feedPosts(page).first().click();
  await expect(panels(page)).toHaveCount(1);
  await expect.poll(async () => (await panels(page).last().boundingBox())!.width).toBeLessThanOrEqual(390);
  await expect.poll(async () => (await panels(page).last().boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: `research/verification/${testInfo.project.name}-phone.png` });
  await drag(page, panels(page).last().locator('.stack-panel__header'), 190);
  await expect(panels(page)).toHaveCount(1);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await page.getByRole('button', { name: 'Close Conversation', exact: true }).click();
  await expect(panels(page)).toHaveCount(0);
});

test('authentication errors stay in the dialog, successful login sends writes and persists only tokens', async ({ page }) => {
  const api = await mockBluesky(page);
  api.failLogin = true;
  await page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Handle or email').fill(me.handle);
  await dialog.getByLabel('App password', { exact: true }).fill('test-app-password');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  api.failLogin = false;
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-app-password');
  await openConversation(page);
  await panels(page).last().getByRole('button', { name: 'Like, 3 likes', exact: true }).first().click();
  await expect(panels(page).last().getByRole('button', { name: 'Unlike, 4 likes', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await page.getByRole('textbox', { name: 'What’s happening?' }).fill('Published from the browser verification suite.');
  await page.getByRole('dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const writes = api.requests.filter(request => request.endpoint === 'com.atproto.repo.createRecord');
  expect(writes.some(request => request.body.collection === 'app.bsky.feed.like' && request.headers.authorization?.startsWith('Bearer '))).toBeTruthy();
  expect(writes.some(request => request.body.collection === 'app.bsky.feed.post' && request.body.record.text === 'Published from the browser verification suite.')).toBeTruthy();
});

test('failed publishing preserves a locally saved draft through closing and reopening', async ({ page }) => {
  const api = await mockBluesky(page);
  await signIn(page);
  api.failWrites = true;
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await page.getByRole('textbox', { name: 'What’s happening?' }).fill('A draft that must survive a failed write.');
  await page.getByRole('dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Publication is unconfirmed');
  await page.getByRole('button', { name: 'Close composer' }).click();
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'What’s happening?' })).toHaveValue('A draft that must survive a failed write.');
});

test('saved public posts survive reload when Bluesky is unavailable', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'offline-transport', description: 'XRPC aborted to test IndexedDB fallback; stopped-server shell tested separately.' });
  await page.unroute('**/xrpc/**');
  await page.route('**/xrpc/**', route => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await expect(page.getByText(/Saved posts ·/)).toBeVisible();
  await expect(feedPosts(page)).toHaveCount(30);
  await expect(page.locator('.inline-error')).toHaveCount(0);
});

test('account reading and drafts survive a Bluesky outage, writes wait for verified reconnection, and sign out clears private storage', async ({ page }) => {
  await signIn(page);
  await expect(feedPosts(page)).toHaveCount(30);
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await page.getByRole('textbox', { name: 'What’s happening?' }).fill('An account draft saved before disconnecting.');
  await page.getByRole('button', { name: 'Close composer' }).click();
  await page.unroute('**/xrpc/**');
  await page.route('**/xrpc/**', route => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('.account-summary')).toHaveAttribute('aria-label', 'View Signed In Tester profile');
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(feedPosts(page)).toHaveCount(30);
  await expect(page.getByText(/Saved posts ·/)).toBeVisible();
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'What’s happening?' })).toHaveValue('An account draft saved before disconnecting.');
  await page.getByRole('dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/offline|Reconnect/i);
  await expect(page.getByRole('textbox', { name: 'What’s happening?' })).toHaveValue('An account draft saved before disconnecting.');
  await page.unroute('**/xrpc/**');
  const api = await mockBluesky(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const sessionIndex = api.requests.findIndex(request => ['com.atproto.server.getSession', 'com.atproto.server.refreshSession'].includes(request.endpoint));
  const writeIndex = api.requests.findIndex(request => request.endpoint === 'com.atproto.repo.createRecord');
  expect(sessionIndex).toBeGreaterThanOrEqual(0);
  expect(writeIndex).toBeGreaterThan(sessionIndex);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.account-summary')).toHaveAttribute('aria-label', 'Sign in');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sliding-panels.bluesky-session'))).toBe(null);
  const storedKeys = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('panels-local'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const results = await Promise.all(['snapshots', 'drafts'].map(name => new Promise<IDBValidKey[]>((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); })));
    db.close();
    return results.flat().map(String);
  });
  expect(storedKeys.some(key => key.includes(me.did))).toBe(false);
});
