import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const result = { checkedAt: new Date().toISOString(), baseUrl: process.env.PANES_URL || 'http://localhost:5173', errors: [] };
page.on('pageerror', error => result.errors.push(error.message));
const waitApi = (endpoint, matches = () => true) => page.waitForResponse(response => new URL(response.url()).pathname === `/xrpc/${endpoint}` && response.request().method() === 'GET' && matches(new URL(response.url())), { timeout: 45000 });
async function body(pending) {
  const response = await pending;
  if (!response.ok()) throw new Error(`${response.status()} ${response.url()}`);
  return response.json();
}
async function settled() { await page.waitForFunction(() => !document.querySelector('.panel-stack--moving')); }
async function imagesReady() {
  await page.waitForFunction(() => [...document.images].filter(image => {
    const box = image.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
  }).every(image => image.complete), { timeout: 20000 });
}
try {
  const directoryRead = waitApi('app.bsky.unspecced.getPopularFeedGenerators');
  await page.goto(result.baseUrl);
  const directory = await body(directoryRead);
  result.directoryFeeds = directory.feeds?.length || 0;
  await page.locator('.timeline h1').filter({ hasText: /^Feeds$/ }).waitFor();
  result.rootTitle = await page.locator('.timeline h1').innerText();
  result.injectedDiscover = await page.getByRole('button', { name: /Bluesky Discover/ }).count();
  result.initialPanes = await page.locator('.stack-panel').count();
  const picker = page.getByRole('region', { name: 'Choose a Bluesky feed' });
  const row = picker.locator('.feed-picker-row').filter({ has: page.getByText('Science', { exact: true }) });
  await row.waitFor();
  await mkdir('research/verification', { recursive: true });
  await imagesReady();
  await page.screenshot({ path: 'research/verification/live-feeds-first-desktop.png' });
  const feedRead = waitApi('app.bsky.feed.getFeed');
  await row.click();
  const response = await feedRead;
  const feed = await body(Promise.resolve(response));
  result.selectedFeed = { name: 'Science', uri: new URL(response.url()).searchParams.get('feed'), records: feed.feed?.length || 0 };
  await page.locator('.stack-panel[aria-label="Science"] .feed-results').waitFor();
  await page.locator('.feed-results .loading-state').waitFor({ state: 'hidden', timeout: 30000 });
  await settled();
  result.paneTitles = await page.locator('.stack-panel__title').allTextContents();
  result.feedErrors = await page.locator('.feed-results .inline-error').count();
  result.previews = {
    images: await page.locator('.timeline-image-grid').count(), videos: await page.locator('.timeline-video-preview').count(),
    links: await page.locator('.timeline-external-preview').count(), quotes: await page.locator('.timeline-quote-preview').count(),
  };
  result.avatarRadius = await page.locator('.feed-results .avatar').first().evaluate(node => getComputedStyle(node).borderRadius);
  await imagesReady();
  await page.screenshot({ path: 'research/verification/live-feed-pane-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const closeNavigation = page.getByRole('button', { name: 'Close navigation', exact: true });
  if (await closeNavigation.isVisible()) await closeNavigation.click();
  await settled();
  await page.locator('.panel-stack').focus();
  await page.keyboard.press('Alt+ArrowRight');
  await settled(); await imagesReady();
  await page.screenshot({ path: 'research/verification/live-feed-pane-phone.png' });
  result.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.getByRole('button', { name: 'Close Science', exact: true }).click(); await settled();
  await picker.getByLabel('Search feeds').fill('astronomy');
  const searchRead = waitApi('app.bsky.unspecced.getPopularFeedGenerators', url => url.searchParams.get('query') === 'astronomy');
  await picker.getByRole('button', { name: 'Search', exact: true }).click();
  const search = await body(searchRead);
  result.searchedFeeds = search.feeds?.length || 0;
  await picker.locator('[role="status"]').waitFor({ state: 'hidden', timeout: 30000 });
  await page.screenshot({ path: 'research/verification/live-feeds-first-phone.png' });
  result.pickerOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  result.pass = result.rootTitle === 'Feeds' && result.initialPanes === 0 && result.injectedDiscover === 0 && result.directoryFeeds > 0 && result.paneTitles.join(',') === 'Science' && result.selectedFeed.records > 0 && result.searchedFeeds > 0 && result.avatarRadius === '50%' && !result.errors.length && !result.feedErrors && !result.horizontalOverflow && !result.pickerOverflow;
} catch (error) { result.failure = String(error); result.pass = false; }
finally {
  await mkdir('research/verification', { recursive: true });
  await writeFile('research/verification/live-feeds-first.json', JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
