import { expect, test, type Page } from '@playwright/test';
import { author, fixtureCid, me, mockBluesky, post } from './fixtures';

const feed = (page: Page) => page.locator('.feed-scroll .post-card');
async function login(page: Page) {
  await page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to Bluesky' });
  await dialog.getByLabel('Handle or email').fill(me.handle);
  await dialog.getByLabel('App password', { exact: true }).fill('test-app-password');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible();
}

test('late search responses cannot overwrite the newer result or revive a cleared search', async ({ page }) => {
  const api = await mockBluesky(page);
  api.respond('app.bsky.feed.searchPosts', request => ({ body: { posts: [post(request.query.get('q') === 'second' ? 72 : 71)] } }));
  const first = api.defer('app.bsky.feed.searchPosts', request => request.query.get('q') === 'first');
  await page.goto('/');
  await expect(feed(page)).toHaveCount(30);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Search Bluesky' });
  await field.fill('first');
  await page.locator('.search-bar').getByRole('button', { name: 'Search', exact: true }).click();
  await first.started;
  await field.fill('second');
  await page.locator('.search-bar').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(feed(page)).toContainText('Panel test post 72.');
  const firstResponse = page.waitForResponse(response => response.url().includes('searchPosts') && new URL(response.url()).searchParams.get('q') === 'first');
  first.release();
  await (await firstResponse).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(feed(page)).toHaveCount(1);
  await expect(feed(page)).toContainText('Panel test post 72.');
  const pending = api.defer('app.bsky.feed.searchPosts', request => request.query.get('q') === 'third');
  await field.fill('third');
  await page.locator('.search-bar').getByRole('button', { name: 'Search', exact: true }).click();
  await pending.started;
  await page.locator('.nav-items').getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(feed(page)).toHaveCount(30);
  const thirdResponse = page.waitForResponse(response => response.url().includes('searchPosts') && new URL(response.url()).searchParams.get('q') === 'third');
  pending.release();
  await (await thirdResponse).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await expect(feed(page)).toHaveCount(30);
  expect(api.violations).toEqual([]);
});

test('cursor pagination retries a failed page, deduplicates overlap and retains prior posts', async ({ page }) => {
  const api = await mockBluesky(page); api.paginated = true;
  let failPage = true;
  api.respond('app.bsky.feed.getFeed', request => request.query.has('cursor') && failPage ? { status: 503, body: { error: 'UpstreamFailure', message: 'Second page failed' } } : undefined);
  await page.goto('/'); await expect(feed(page)).toHaveCount(30);
  await page.getByRole('button', { name: 'Load more posts', exact: true }).click();
  await expect(page.locator('.inline-error')).toContainText('Second page failed');
  await expect(feed(page)).toHaveCount(30);
  failPage = false;
  await page.getByRole('button', { name: /Retry|Try again/i }).click();
  await expect(feed(page)).toHaveCount(59);
  expect(await feed(page).locator('.post-text').allTextContents()).toEqual(Array.from({ length: 59 }, (_, i) => post(i).record.text));
  const requests = api.requests.filter(request => request.endpoint === 'app.bsky.feed.getFeed');
  expect(requests.map(request => request.query.get('cursor'))).toEqual([null, 'page-2', 'page-2']);
  await expect(page.getByRole('button', { name: 'Load more posts', exact: true })).toHaveCount(0);
  expect(api.violations).toEqual([]);
});

test('reaction writes preserve exact subjects and a confirmed reply appears in its conversation', async ({ page }) => {
  const api = await mockBluesky(page);
  await page.goto('/'); await login(page);
  await feed(page).first().locator('.post-conversation-opener').click();
  const detail = page.locator('.stack-panel').last();
  await expect(detail.getByText('Panel test post 90.', { exact: false })).toBeVisible();
  await detail.getByRole('button', { name: 'Like, 3 likes', exact: true }).first().click();
  await detail.getByRole('button', { name: 'Unlike, 4 likes', exact: true }).first().click();
  await detail.getByRole('button', { name: 'Repost, 2 reposts', exact: true }).first().click();
  await detail.getByRole('button', { name: 'Undo repost, 3 reposts', exact: true }).first().click();
  const creates = api.requests.filter(request => request.endpoint === 'com.atproto.repo.createRecord');
  for (const collection of ['app.bsky.feed.like', 'app.bsky.feed.repost']) {
    const create = creates.find(request => request.body.collection === collection)!;
    expect(create.body.repo).toBe(me.did);
    expect(create.body.record.subject).toEqual({ uri: post(0).uri, cid: fixtureCid });
    expect(api.requests.filter(request => request.endpoint === 'com.atproto.repo.deleteRecord' && request.body.collection === collection)).toHaveLength(1);
  }
  await detail.getByRole('button', { name: 'Reply, 1 replies', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Your reply' }).fill('A confirmed conversation reply.');
  await dialog.getByRole('button', { name: /^(Post|Reply)$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.stack-panel')).toHaveCount(2);
  await expect(page.locator('.stack-panel').last().getByText('A confirmed conversation reply.', { exact: true })).toBeVisible();
  await page.locator('.stack-panel').last().getByRole('button', { name: 'Close Conversation', exact: true }).click();
  await expect(page.locator('.stack-panel')).toHaveCount(1);
  await expect(detail.getByText('A confirmed conversation reply.', { exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Reply, 2 replies', exact: true })).toBeVisible();
  const reply = api.requests.find(request => request.endpoint === 'com.atproto.repo.createRecord' && request.body.record.text === 'A confirmed conversation reply.')!;
  expect(reply.body.record.reply).toEqual({ root: { uri: post(0).uri, cid: fixtureCid }, parent: { uri: post(0).uri, cid: fixtureCid } });
  expect(api.violations).toEqual([]);
});

test('notification pagination acknowledges only the newest displayed notification timestamp', async ({ page }) => {
  const api = await mockBluesky(page);
  const notification = (index: number, indexedAt: string) => ({ uri: `at://${author.did}/app.bsky.feed.like/notification${index}`, cid: fixtureCid, author, reason: 'like', reasonSubject: post(index).uri, record: { $type: 'app.bsky.feed.like', subject: { uri: post(index).uri, cid: fixtureCid }, createdAt: indexedAt }, indexedAt, isRead: false });
  const newest = '2026-10-15T11:00:00.000Z';
  api.respond('app.bsky.notification.listNotifications', request => ({ body: request.query.has('cursor') ? { notifications: [notification(1, '2026-10-14T10:00:00.000Z')] } : { notifications: [notification(0, newest)], cursor: 'notifications-2' } }));
  await page.goto('/'); await login(page);
  await page.getByRole('button', { name: 'Mentions & activity', exact: true }).click();
  await expect(page.locator('.notification')).toHaveCount(1);
  await expect.poll(() => api.requests.filter(request => request.endpoint === 'app.bsky.notification.updateSeen').length).toBe(1);
  await page.getByRole('button', { name: 'Load more posts', exact: true }).click();
  await expect(page.locator('.notification')).toHaveCount(2);
  const seen = api.requests.filter(request => request.endpoint === 'app.bsky.notification.updateSeen');
  expect(seen.map(request => request.body.seenAt)).toEqual([newest]);
  expect(api.violations).toEqual([]);
});

test('expired access rotates refresh credentials before a single authenticated write', async ({ page }) => {
  const api = await mockBluesky(page);
  await page.goto('/'); await login(page);
  await feed(page).first().locator('.post-conversation-opener').click();
  const detail = page.locator('.stack-panel').last();
  await expect(detail.getByText('Panel test post 90.', { exact: false })).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sliding-panels.bluesky-session')!).session);
  api.expireAccess(me.did);
  await detail.getByRole('button', { name: 'Like, 3 likes', exact: true }).first().click();
  await expect(detail.getByRole('button', { name: 'Unlike, 4 likes', exact: true }).first()).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('sliding-panels.bluesky-session')!).session);
  expect(after.accessJwt).not.toBe(before.accessJwt);
  expect(after.refreshJwt).not.toBe(before.refreshJwt);
  const refresh = api.requests.filter(request => request.endpoint === 'com.atproto.server.refreshSession');
  expect(refresh).toHaveLength(1);
  expect(refresh[0].headers.authorization).toBe(`Bearer ${before.refreshJwt}`);
  const committed = api.requests.filter(request => request.endpoint === 'com.atproto.repo.createRecord' && request.headers.authorization === `Bearer ${after.accessJwt}`);
  expect(committed).toHaveLength(1);
  expect(committed[0].body.repo).toBe(me.did);
  await page.reload();
  await expect(page.locator('.account-summary')).toHaveAttribute('aria-label', 'View Signed In Tester profile');
  expect(api.violations).toEqual([]);
});

test('logout in another tab closes a composer and fences its queued delayed-save completion', async ({ page, context }) => {
  const firstApi = await mockBluesky(page);
  await page.goto('/'); await login(page);
  const other = await context.newPage();
  const secondApi = await mockBluesky(other);
  await other.goto('/');
  await expect(other.locator('.account-summary')).toHaveAttribute('aria-label', 'View Signed In Tester profile');
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'What’s happening?' });
  await expect(input).toBeEnabled();
  // Hold acknowledgement of one genuine IDB commit, leaving the next UI edit
  // queued behind it. The database transaction itself is allowed to commit so
  // the other tab can erase it; the storage-level tests cover durable fencing.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    (window as any).__delayedDraftCommitted = false;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const transaction = original.apply(this, args);
      const names = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
      if (args[1] === 'readwrite' && names.includes('drafts')) {
        IDBDatabase.prototype.transaction = original;
        Object.defineProperty(transaction, 'oncomplete', {
          configurable: true,
          set(handler: (event: Event) => void) {
            transaction.addEventListener('complete', event => {
              (window as any).__delayedDraftCommitted = true;
              (window as any).__releaseDraftCompletion = () => handler.call(transaction, event);
            }, { once: true });
          },
        });
      }
      return transaction;
    };
  });
  await input.fill('Private draft committed before remote sign out.');
  await expect.poll(() => page.evaluate(() => (window as any).__delayedDraftCommitted)).toBe(true);
  await input.fill('Queued private text must never resurrect after logout.');
  await expect(page.locator('.draft-status')).toHaveAttribute('data-save-state', 'saving');
  await other.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(other.locator('.account-summary')).toHaveAttribute('aria-label', 'Sign in');
  await expect(page.locator('.account-summary')).toHaveAttribute('aria-label', 'Sign in');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(async () => {
    (window as any).__releaseDraftCompletion();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(await page.evaluate(() => localStorage.getItem('sliding-panels.bluesky-session'))).toBeNull();
  const keys = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('panels-local'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const keys = await Promise.all(['snapshots', 'drafts'].map(store => new Promise<IDBValidKey[]>((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); })));
    db.close(); return keys.flat().map(String);
  });
  expect(keys.some(key => key.includes(me.did))).toBe(false);
  await login(page);
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'What’s happening?' })).toHaveValue('');
  expect(firstApi.violations).toEqual([]);
  expect(secondApi.violations).toEqual([]);
  await other.close();
});
