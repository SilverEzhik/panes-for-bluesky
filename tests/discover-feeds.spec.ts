import { expect, test, type Page } from '@playwright/test';
import { author, fixtureCid, me, mockBluesky, post, type ApiControl } from './fixtures';

const uri = (key: string) => `at://${author.did}/app.bsky.feed.generator/${key}`;
const generator = (key: string, displayName: string) => ({
  $type: 'app.bsky.feed.defs#generatorView', uri: uri(key), cid: fixtureCid,
  did: 'did:web:feeds.example.test', creator: author, displayName,
  description: `Posts selected by ${displayName}.`, likeCount: 42, indexedAt: '2026-10-15T12:00:00.000Z',
});
const space = generator('space', 'Astronomy');
const art = generator('art', 'Art studio');
const discover = { ...generator('discover', 'Discover'), uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' };
const feedPosts = (page: Page) => page.locator('.timeline .post-card');
const feedPane = (page: Page) => page.locator('.stack-panel').filter({ has: page.locator('.feed-results') });
const chosenPosts = (page: Page) => feedPane(page).locator('.post-card');
const picker = (page: Page) => page.getByRole('region', { name: 'Choose a Bluesky feed' });
async function openPicker(page: Page) {
  while (await page.locator('.stack-panel').count()) await page.locator('.stack-panel').last().locator('.stack-panel__close').click();
  await expect(page.locator('.timeline h1')).toHaveText('Feeds');
  await expect(picker(page)).toBeVisible();
}
async function signIn(page: Page) {
  await page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to Bluesky' });
  await dialog.getByLabel('Handle or email').fill(me.handle);
  await dialog.getByLabel('App password', { exact: true }).fill('test-app-password');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Feeds', exact: true }).click();
}
function directory(control: ApiControl) {
  control.respond('app.bsky.unspecced.getPopularFeedGenerators', request => ({ body: {
    feeds: request.query.get('query') ? [art] : [discover, space, art],
  } }));
  control.respond('app.bsky.feed.getFeedGenerators', request => ({ body: { feeds: [space, art].filter(feed => request.query.getAll('feeds').includes(feed.uri)) } }));
  control.respond('app.bsky.feed.getFeedGenerator', request => ({ body: { view: request.query.get('feed') === art.uri ? art : space, isOnline: true, isValid: true } }));
}

test('custom feed search selects the actual generator and keeps its URI through pagination', async ({ page }) => {
  const control = await mockBluesky(page); directory(control);
  control.respond('app.bsky.feed.getFeed', request => request.query.get('feed') === art.uri ? { body: {
    feed: [{ post: { ...post(request.query.has('cursor') ? 102 : 101), record: { ...post().record, text: request.query.has('cursor') ? 'More from Art studio' : 'A post from Art studio' } } }],
    ...(!request.query.has('cursor') ? { cursor: 'art-next' } : {}),
  } } : undefined);
  await page.goto('/'); await expect(picker(page)).toBeVisible();
  await openPicker(page);
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Feeds', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Choose feed', exact: true })).toHaveCount(0);
  expect(control.requests.some(call => call.endpoint === 'app.bsky.feed.getFeed')).toBe(false);
  await picker(page).getByLabel('Search feeds', { exact: true }).fill('art');
  await picker(page).getByRole('button', { name: 'Search', exact: true }).click();
  await expect(picker(page).getByText('Feeds matching “art”')).toBeVisible();
  await picker(page).getByRole('button', { name: /Art studio/ }).click();
  await expect(page.locator('.stack-panel')).toHaveCount(1);
  await expect(feedPane(page)).toHaveAttribute('aria-label', 'Art studio');
  await expect(chosenPosts(page)).toHaveCount(1);
  await expect(feedPosts(page)).toHaveCount(0);
  await expect(chosenPosts(page).first()).toContainText('A post from Art studio');
  await feedPane(page).getByRole('button', { name: 'Load more posts', exact: true }).click();
  await expect(chosenPosts(page)).toHaveCount(2);
  expect(control.requests.some(call => call.endpoint === 'app.bsky.feed.getFeed' && call.query.get('feed') === art.uri && call.query.get('cursor') === 'art-next')).toBe(true);
  await chosenPosts(page).first().locator('.post-conversation-opener').click();
  await expect(page.locator('.stack-panel')).toHaveCount(2);
  await page.getByRole('button', { name: 'Close Conversation', exact: true }).click();
  await openPicker(page);
  await expect(picker(page).getByLabel('Search feeds')).toHaveValue('art');
  await picker(page).getByLabel('Search feeds').fill('');
  await picker(page).getByRole('button', { name: 'Search', exact: true }).click();
  await picker(page).getByRole('button', { name: /^Discover/ }).click();
  await expect(feedPane(page)).toHaveAttribute('aria-label', 'Discover');
  await expect(chosenPosts(page)).toHaveCount(30);
  await expect(feedPosts(page)).toHaveCount(0);
  expect(control.violations).toEqual([]);
});

for (const version of ['v2', 'legacy']) {
  test(`signed-in Feeds reads ${version} saved feeds without changing preferences`, async ({ page }) => {
    const control = await mockBluesky(page); directory(control);
    control.respond('app.bsky.actor.getPreferences', () => ({ body: { preferences: version === 'v2' ? [{
      $type: 'app.bsky.actor.defs#savedFeedsPrefV2', items: [
        { id: 'art', type: 'feed', value: art.uri, pinned: false },
        { id: 'list', type: 'list', value: `at://${author.did}/app.bsky.graph.list/list1`, pinned: true },
        { id: 'space', type: 'feed', value: space.uri, pinned: true },
        { id: 'following', type: 'timeline', value: 'following', pinned: true },
      ],
    }] : [{ $type: 'app.bsky.actor.defs#savedFeedsPref', pinned: [space.uri], saved: [art.uri, space.uri] }] } }));
    await page.goto('/'); await signIn(page); await openPicker(page);
    const saved = picker(page).locator('.feed-picker-row').filter({ hasText: 'Pinned' });
    await expect(saved).toHaveCount(1); await expect(saved).toContainText('Astronomy');
    await saved.click();
    await expect(feedPane(page)).toHaveAttribute('aria-label', 'Astronomy');
    await expect(chosenPosts(page)).toHaveCount(30);
    expect(control.requests.some(call => call.endpoint === 'app.bsky.feed.getFeed' && call.query.get('feed') === space.uri)).toBe(true);
    expect(control.requests.filter(call => call.method !== 'GET').map(call => call.endpoint)).toEqual(['com.atproto.server.createSession']);
    expect(control.violations).toEqual([]);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.stack-panel')).toHaveCount(0);
    await openPicker(page);
    await expect(picker(page).getByText('Sign in to see your saved and pinned Bluesky feeds.')).toBeVisible();
    await expect(picker(page).getByText('Pinned', { exact: false })).toHaveCount(1); // signed-out explanation only
  });
}

test('a shared custom-feed embed renders a card and opens its feed instead of a webpage', async ({ page }) => {
  const control = await mockBluesky(page); directory(control);
  const value = { ...post(), embed: { $type: 'app.bsky.embed.record#view', record: space } };
  control.respond('app.bsky.feed.getFeed', request => ({ body: { feed: [{ post: request.query.get('feed') === space.uri ? { ...post(201), record: { ...post().record, text: 'Hello from the astronomy feed' } } : value }] } }));
  control.respond('app.bsky.feed.getPostThread', () => ({ body: { thread: { $type: 'app.bsky.feed.defs#threadViewPost', post: value, replies: [] } } }));
  await page.goto('/');
  await picker(page).getByRole('button', { name: /^Discover/ }).click();
  const original = feedPane(page).first();
  await expect(original.locator('.timeline-feed-preview')).toContainText('Astronomy');
  await original.locator('.post-conversation-opener').click();
  const detail = page.locator('.stack-panel').last();
  await expect(detail.locator('.timeline-feed-preview')).toBeVisible();
  await detail.locator('.timeline-feed-preview').click();
  await expect(page.locator('.stack-panel')).toHaveCount(3);
  await expect(page.locator('.stack-panel').nth(1)).toHaveAttribute('aria-label', 'Conversation');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(feedPane(page).last()).toHaveAttribute('aria-label', 'Astronomy');
  await expect(feedPane(page).last().locator('.post-card')).toContainText('Hello from the astronomy feed');
  await expect(original.locator('.timeline-feed-preview')).toContainText('Astronomy');
  expect(control.violations).toEqual([]);
});

test('a slow custom-feed response cannot replace a newer selection', async ({ page }) => {
  const control = await mockBluesky(page); directory(control);
  const slow = control.defer('app.bsky.feed.getFeed', request => request.query.get('feed') === space.uri);
  await page.goto('/'); await expect(picker(page)).toBeVisible(); await openPicker(page);
  await picker(page).getByRole('button', { name: /Astronomy/ }).click(); await slow.started;
  await openPicker(page);
  await picker(page).getByRole('button', { name: /Art studio/ }).click();
  await expect(chosenPosts(page)).toHaveCount(30);
  slow.release({ body: { feed: [{ post: { ...post(303), record: { ...post().record, text: 'Stale astronomy response' } } }] } });
  await expect(feedPane(page)).toHaveAttribute('aria-label', 'Art studio');
  await expect(chosenPosts(page)).toHaveCount(30);
  await expect(chosenPosts(page).filter({ hasText: 'Stale astronomy response' })).toHaveCount(0);
  expect(control.violations).toEqual([]);
});

test('blocked custom-feed embeds withhold their text and artwork', async ({ page }) => {
  const control = await mockBluesky(page); directory(control);
  const blocked = { ...space, avatar: 'https://protected-feed.example.test/private.jpg', creator: { ...author, viewer: { blocking: `at://${me.did}/app.bsky.graph.block/blocked` } } };
  let imageRequests = 0;
  await page.route('https://protected-feed.example.test/**', route => { imageRequests++; return route.abort(); });
  control.respond('app.bsky.feed.getFeed', () => ({ body: { feed: [{ post: { ...post(), embed: { $type: 'app.bsky.embed.record#view', record: blocked } } }] } }));
  await page.goto('/');
  await picker(page).getByRole('button', { name: /^Discover/ }).click();
  await expect(chosenPosts(page)).toHaveCount(1);
  await expect(chosenPosts(page)).not.toContainText('Astronomy');
  await expect(chosenPosts(page).locator('img[src*="protected-feed"]')).toHaveCount(0);
  expect(imageRequests).toBe(0);
  expect(control.violations).toEqual([]);
});

test('saved custom-feed posts stay separate from other feeds during an outage', async ({ page }) => {
  const control = await mockBluesky(page); directory(control);
  control.respond('app.bsky.feed.getFeed', request => !control.failFeed && request.query.get('feed') === space.uri ? { body: { feed: [{ post: { ...post(404), record: { ...post().record, text: 'Saved astronomy post' } } }] } } : undefined);
  await page.goto('/'); await expect(picker(page)).toBeVisible();
  await openPicker(page); await picker(page).getByRole('button', { name: /Astronomy/ }).click();
  await expect(chosenPosts(page)).toContainText('Saved astronomy post');
  control.failFeed = true;
  await feedPane(page).getByRole('button', { name: 'Refresh feed', exact: true }).click();
  await expect(page.locator('.connection-banner')).toContainText('Saved posts');
  await expect(chosenPosts(page)).toContainText('Saved astronomy post');
  await openPicker(page); await picker(page).getByRole('button', { name: /Art studio/ }).click();
  await expect(feedPane(page).getByRole('alert')).toContainText('Couldn’t load this feed');
  await expect(chosenPosts(page)).toHaveCount(0);
  await expect(feedPosts(page)).toHaveCount(0);
  expect(control.violations).toEqual([]);
});

test('a phone can choose a feed without overflow or opening navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const control = await mockBluesky(page); directory(control);
  await page.goto('/'); await expect(picker(page)).toBeVisible();
  await openPicker(page);
  await picker(page).getByRole('button', { name: /Astronomy/ }).click();
  await expect(feedPane(page)).toHaveAttribute('aria-label', 'Astronomy');
  await expect(feedPane(page).getByRole('button', { name: 'Refresh feed', exact: true })).toBeInViewport();
  await expect(page.locator('.stack-panel')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close Astronomy', exact: true }).click();
  await expect(picker(page)).toBeVisible();
  await expect(picker(page).getByRole('button', { name: /Art studio/ })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(control.violations).toEqual([]);
});

test('Feeds has no injected default entry when Discover is absent from account and directory', async ({ page }) => {
  const control = await mockBluesky(page);
  control.respond('app.bsky.unspecced.getPopularFeedGenerators', () => ({ body: { feeds: [space, art] } }));
  await page.goto('/'); await signIn(page);
  await expect(picker(page).getByText('No saved custom feeds on your Bluesky account.')).toBeVisible();
  await expect(picker(page).getByRole('button', { name: /Astronomy/ })).toBeVisible();
  await expect(picker(page).getByRole('button', { name: /Discover/ })).toHaveCount(0);
  await expect(picker(page).getByText('The default Discover feed')).toHaveCount(0);
  await expect(page.locator('.stack-panel')).toHaveCount(0);
  expect(control.requests.some(call => call.endpoint === 'app.bsky.feed.getFeed')).toBe(false);
  expect(control.violations).toEqual([]);
});
