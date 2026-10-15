import { expect, test, type Locator, type Page } from '@playwright/test';
import { author, mockBluesky, post } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

const webUrl = 'https://panel-reference.example/article';
const imageUrl = (number: number) => `https://panel-media.example/${number}.svg`;
const panels = (page: Page) => page.locator('.stack-panel').filter({ hasNot: page.locator('.feed-results') });
const firstPost = (page: Page) => page.locator('.feed-results .post-card').first();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#2587b4"/><text x="50" y="100" font-size="48">Panel media fixture</text></svg>';

function linkedPost(kind: 'facets' | 'external' | 'images' | 'broken') {
  const value = post(0);
  if (kind === 'facets') {
    const text = '🦔 Hello @paneltester.bsky.social #slidingpanels reference';
    const facet = (needle: string, feature: Record<string, string>) => {
      const prefix = text.slice(0, text.indexOf(needle));
      return { index: { byteStart: new TextEncoder().encode(prefix).length, byteEnd: new TextEncoder().encode(prefix + needle).length }, features: [feature] };
    };
    return { ...value, record: { ...value.record, text, facets: [
      facet('@paneltester.bsky.social', { $type: 'app.bsky.richtext.facet#mention', did: author.did }),
      facet('#slidingpanels', { $type: 'app.bsky.richtext.facet#tag', tag: 'slidingpanels' }),
      facet('reference', { $type: 'app.bsky.richtext.facet#link', uri: webUrl }),
    ] } };
  }
  if (kind === 'external') return { ...value, embed: { $type: 'app.bsky.embed.external#view', external: { uri: webUrl, title: 'Original sliding panels', description: 'A preserved design reference.', thumb: imageUrl(1) } } };
  return { ...value, embed: { $type: 'app.bsky.embed.images#view', images: [1, 2].map(number => ({ thumb: imageUrl(number), fullsize: kind === 'broken' ? `https://panel-media.example/broken-${number}` : imageUrl(number), alt: `Panel reference image ${number}`, aspectRatio: { width: 1200, height: 900 } })) } };
}

async function setup(page: Page, kind: Parameters<typeof linkedPost>[0]) {
  const control = await mockBluesky(page);
  let webLoads = 0;
  await page.route('https://panel-reference.example/**', async route => {
    webLoads += 1;
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><title>Design reference</title><body><h1>Preserved sliding panels reference</h1></body></html>' });
  });
  await page.route('https://panel-media.example/**', route => route.request().url().includes('broken-')
    ? route.fulfill({ status: 404, body: 'Image unavailable' })
    : route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await page.route('**/xrpc/app.bsky.feed.getFeed?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ feed: [{ post: linkedPost(kind) }] }) }));
  await page.route('**/xrpc/app.bsky.feed.getAuthorFeed?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ feed: [{ post: linkedPost(kind) }] }) }));
  await page.route('**/xrpc/app.bsky.feed.getPostThread?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ thread: {
    $type: 'app.bsky.feed.defs#threadViewPost', post: linkedPost(kind), replies: [],
  } }) }));
  await openTestFeed(page, control);
  await expect(firstPost(page)).toBeVisible();
  return { control, webLoads: () => webLoads };
}

async function expectToolbarAssets(toolbar: Locator) {
  const images = toolbar.locator('img');
  expect(await images.count()).toBeGreaterThan(1);
  await expect.poll(() => images.evaluateAll(elements => elements.every(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
}

async function expectPanelAtRest(page: Page) {
  await expect.poll(async () => {
    const bounds = await panels(page).last().boundingBox();
    return bounds ? bounds.x + bounds.width : Infinity;
  }).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
}

test('UTF8 rich text opens mentions in sheets and hashtags as a real Bluesky search', async ({ page }) => {
  const { control } = await setup(page, 'facets');
  await expect(firstPost(page).locator('.post-text')).toHaveText('🦔 Hello @paneltester.bsky.social #slidingpanels reference');
  const mention = firstPost(page).getByRole('link', { name: '@paneltester.bsky.social', exact: true });
  await expect(mention).toHaveAttribute('href', `https://bsky.app/profile/${encodeURIComponent(author.did)}`);
  await mention.click();
  await expect(panels(page)).toHaveCount(1);
  await expect(panels(page).last()).toHaveAttribute('aria-label', 'Profile');
  await expect(panels(page).last().getByText(author.description, { exact: true })).toBeVisible();
  expect(control.requests.some(request => request.endpoint === 'app.bsky.actor.getProfile')).toBe(true);
  await page.getByRole('button', { name: 'Close Profile', exact: true }).click();
  await firstPost(page).getByRole('link', { name: '#slidingpanels', exact: true }).click();
  await expect(panels(page)).toHaveCount(1);
  await expect(panels(page).last()).toHaveAttribute('aria-label', '#slidingpanels');
  await expect(panels(page).last().locator('.post-card')).toContainText('Panel test post 70.');
  await expect(firstPost(page).locator('.post-text')).toHaveText('🦔 Hello @paneltester.bsky.social #slidingpanels reference');
  expect(control.requests.some(request => request.endpoint === 'app.bsky.feed.searchPosts')).toBe(true);
});

test('facet links and external cards open embedded pages with working reload and original toolbar assets', async ({ page }, testInfo) => {
  const fixture = await setup(page, 'external');
  await expect(firstPost(page).locator('.timeline-external-preview img')).toBeVisible();
  await expect(firstPost(page).locator('.timeline-external-preview')).toContainText('A preserved design reference.');
  await expect.poll(() => firstPost(page).locator('.timeline-external-preview img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1200);
  await firstPost(page).getByRole('link', { name: /Original sliding panels/ }).click();
  await expect(panels(page)).toHaveCount(1);
  const browser = panels(page).last();
  await expect(browser).toHaveAttribute('aria-label', 'Original sliding panels');
  await expect(browser.frameLocator('iframe').getByRole('heading', { name: 'Preserved sliding panels reference' })).toBeVisible();
  await expect(browser.locator('iframe')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expectToolbarAssets(browser.locator('.link-panel__toolbar'));
  const original = browser.locator('.link-panel__toolbar').getByRole('link', { name: 'Open original page in browser', exact: true });
  await expect(original).toHaveAttribute('href', webUrl);
  await expect(original).toHaveAttribute('rel', /noopener/);
  await expectPanelAtRest(page);
  await page.screenshot({ path: `research/verification/${testInfo.project.name}-web-panel.png` });
  const loadsBefore = fixture.webLoads();
  await browser.getByRole('button', { name: 'Reopen original page', exact: true }).click();
  await expect.poll(fixture.webLoads).toBeGreaterThan(loadsBefore);
  await expect(browser.frameLocator('iframe').getByRole('heading')).toBeVisible();
  await page.getByRole('button', { name: 'Close Original sliding panels', exact: true }).click();
  await expect(panels(page)).toHaveCount(0);

  await setup(page, 'facets');
  await firstPost(page).getByRole('link', { name: 'reference', exact: true }).click();
  await expect(panels(page)).toHaveCount(1);
  await expect(panels(page).last()).toHaveAttribute('aria-label', 'reference');
  await expect(panels(page).last().locator('iframe')).toHaveAttribute('src', webUrl);
});

test('timeline thumbnails open a gallery and detail thumbnails preserve selected photo, keys and zoom', async ({ page }, testInfo) => {
  await setup(page, 'images');
  await expect(firstPost(page).getByRole('img', { name: 'Panel reference image 2', exact: true })).toBeVisible();
  await firstPost(page).getByRole('link', { name: 'Panel reference image 1', exact: true }).click();
  await expect(panels(page)).toHaveCount(1);
  await expect(panels(page).last().getByRole('status')).toHaveText('1 of 2');
  await page.getByRole('button', { name: 'Close Photos', exact: true }).click();
  await firstPost(page).locator('.post-text').click();
  await expect(panels(page)).toHaveCount(1);
  await panels(page).last().getByRole('link', { name: 'Panel reference image 2', exact: true }).click();
  await expect(panels(page)).toHaveCount(2);
  const photos = page.getByRole('region', { name: 'Image viewer' });
  await expect(photos.getByRole('status')).toHaveText('2 of 2');
  await expect(photos.getByRole('img', { name: 'Panel reference image 2', exact: true })).toBeVisible();
  await expect.poll(() => photos.locator('.media-panel__image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1200);
  await expect(photos.getByRole('button', { name: 'Next image', exact: true })).toBeDisabled();
  await expectToolbarAssets(photos.locator('.link-panel__toolbar'));
  await expectPanelAtRest(page);
  await page.screenshot({ path: `research/verification/${testInfo.project.name}-photo-panel.png` });
  await expect(photos.getByRole('link', { name: 'Open original image in browser', exact: true })).toHaveAttribute('href', imageUrl(2));
  const viewport = photos.locator('.media-panel__viewport');
  await viewport.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(photos.getByRole('status')).toHaveText('1 of 2');
  await expect(photos.getByRole('button', { name: 'Previous image', exact: true })).toBeDisabled();
  await expect(photos.locator('.media-panel__caption')).toHaveText('Panel reference image 1');
  await photos.getByRole('button', { name: 'Expand photo pane', exact: true }).click();
  await expect(photos.getByRole('button', { name: 'Exit fullscreen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toBeVisible();
  await expect(viewport).toHaveAttribute('data-zoom', '1.000');
  await expectToolbarAssets(photos.locator('.link-panel__toolbar'));
  await viewport.focus();
  await photos.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect(photos.getByRole('status')).toHaveText('2 of 2');
  await expect(photos.getByRole('button', { name: 'Exit fullscreen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Photos — fullscreen' })).toHaveCount(0);
  await expect(panels(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Close Photos', exact: true }).click();
  await expect(panels(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Close Conversation', exact: true }).click();
  await expect(panels(page)).toHaveCount(0);
});

test('a failed full size image explains the failure and retains an accessible original-image escape', async ({ page }) => {
  await setup(page, 'broken');
  await firstPost(page).getByRole('link', { name: 'Panel reference image 1', exact: true }).click();
  const photos = page.getByRole('region', { name: 'Image viewer' });
  await expect(photos.getByText('This image could not be loaded.', { exact: false })).toBeVisible();
  await expect(photos.getByRole('link', { name: 'Open the original image', exact: true })).toHaveAttribute('href', 'https://panel-media.example/broken-1');
  await photos.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect(photos.getByRole('status').first()).toHaveText('2 of 2');
  await expect(photos.getByRole('link', { name: 'Open the original image', exact: true })).toHaveAttribute('href', 'https://panel-media.example/broken-2');
});

for (const viewport of [{ width: 1024, height: 768, webWidth: 830 }, { width: 768, height: 1024, webWidth: 574 }]) {
  test(`a conversation embeds its URL beneath the original post and prunes descendants at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await setup(page, 'external');
    await firstPost(page).locator('.post-conversation-opener').click();
    await expect(panels(page)).toHaveCount(1);
    await expectPanelAtRest(page);
    const conversation = panels(page).first();
    await expect.poll(async () => (await conversation.boundingBox())!.width).toBe(476);
    await conversation.getByRole('button', { name: "View Panel Tester's profile", exact: true }).first().click();
    await expect(panels(page)).toHaveCount(2);
    await expectPanelAtRest(page);
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
    await conversation.getByRole('link', { name: /Original sliding panels/ }).click();
    await expect(panels(page)).toHaveCount(1);
    await expectPanelAtRest(page);
    const embedded = panels(page).first();
    await expect(embedded.locator('.post-text')).toHaveText(post(0).record.text);
    await expect(embedded.getByRole('button', { name: "View Panel Tester's profile", exact: true })).toBeVisible();
    await expect(embedded.frameLocator('iframe').getByRole('heading', { name: 'Preserved sliding panels reference' })).toBeVisible();
    await expect.poll(async () => (await embedded.boundingBox())!.width).toBe(viewport.webWidth);
    await expect(embedded.locator('.post-actions')).toHaveCount(1);
    await expect(embedded.getByRole('button', { name: 'Like, 3 likes', exact: true })).toBeVisible();
    await expect(embedded.locator('.thread-reply')).toHaveCount(0);
    await embedded.getByRole('button', { name: 'Show conversation', exact: true }).click();
    await expect(panels(page)).toHaveCount(1);
    await expect(panels(page).first().locator('iframe')).toHaveCount(0);
    await expect.poll(async () => (await panels(page).first().boundingBox())!.width).toBe(476);
  });
}
