import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const result = { timestamp: new Date().toISOString(), baseUrl: process.env.PANES_URL || 'http://localhost:5173', errors };
function apiResponse(endpoint) {
  return page.waitForResponse(response => new URL(response.url()).pathname === `/xrpc/${endpoint}` && response.request().method() === 'GET', { timeout: 45000 });
}
async function verifiedBody(responsePromise) {
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`Live API returned ${response.status()} for ${new URL(response.url()).pathname}`);
  return response.json();
}
async function waitForVisibleImages() {
  await page.waitForFunction(() => [...document.images].filter(image => {
    const box = image.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
  }).every(image => image.complete), { timeout: 20000 });
}
try {
  await page.goto(result.baseUrl);
  await page.locator('.timeline .feed-picker-row').filter({ has: page.getByText('Science', { exact: true }) }).click({ timeout: 45000 });
  await page.locator('.feed-results .post-card').first().waitFor({ timeout: 45000 });
  result.livePosts = await page.locator('.feed-results .post-card').count();
  await mkdir('research/verification', { recursive: true });
  await waitForVisibleImages();
  result.brokenVisibleImages = await page.evaluate(() => [...document.images].filter(image => {
    const box = image.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth && !image.naturalWidth;
  }).length);
  await page.screenshot({ path: 'research/verification/live-desktop.png' });
  const profileRead = apiResponse('app.bsky.actor.getProfile');
  const authorFeedRead = apiResponse('app.bsky.feed.getAuthorFeed');
  await page.locator('.feed-results .post-card .post-author').first().click();
  const [profile, authorFeed] = await Promise.all([verifiedBody(profileRead), verifiedBody(authorFeedRead)]);
  await page.locator('.classic-profile-identity h2').waitFor({ timeout: 30000 });
  await page.locator('.profile-scroll [role="status"]').waitFor({ state: 'hidden', timeout: 30000 });
  result.profile = profile.handle;
  result.authorFeedRecords = authorFeed.feed?.length ?? 0;
  result.profileError = await page.locator('.profile-scroll .inline-error').count();
  await waitForVisibleImages();
  await page.screenshot({ path: 'research/verification/live-profile.png' });
  await page.getByRole('button', { name: 'Close Profile', exact: true }).click();
  const threadRead = apiResponse('app.bsky.feed.getPostThread');
  await page.locator('.feed-results .post-conversation-opener').first().click();
  const thread = await verifiedBody(threadRead);
  result.threadUri = thread.thread?.post?.uri;
  await page.locator('.post-dateline').waitFor({ timeout: 30000 });
  await page.locator('.detail-scroll .loading-state').waitFor({ state: 'hidden', timeout: 30000 });
  result.threadError = await page.locator('.detail-scroll .inline-error').count();
  await page.screenshot({ path: 'research/verification/live-thread.png' });
  await page.getByRole('button', { name: 'Close Conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Search Bluesky' }).fill('Bluesky');
  const searchRead = apiResponse('app.bsky.feed.searchPosts');
  await page.locator('.search-bar').getByRole('button', { name: 'Search', exact: true }).click();
  const search = await verifiedBody(searchRead);
  result.searchRecords = search.posts?.length ?? 0;
  await page.locator('.timeline .post-card').first().waitFor({ timeout: 45000 });
  result.searchPosts = await page.locator('.timeline .post-card').count();
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForVisibleImages();
  await page.screenshot({ path: 'research/verification/live-phone.png' });
  result.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  result.pass = result.livePosts > 0 && result.searchPosts > 0 && result.searchRecords > 0 && Boolean(result.profile) && Boolean(result.threadUri) && !result.profileError && !result.threadError && !errors.length && !result.horizontalOverflow && !result.brokenVisibleImages;
} catch (error) { result.failure = String(error); result.pass = false; }
finally {
  await mkdir('research/verification', { recursive: true });
  await writeFile('research/verification/live-smoke.json', JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
