import { expect, test } from '@playwright/test';
import { mockBluesky, post } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

test('a failed image retries in place and fullsize arrow keys pan instead of changing photos', async ({ page }) => {
  const control = await mockBluesky(page);
  let available = false;
  const imageUrl = 'https://media-retry.example/photo.svg';
  await page.route('https://media-retry.example/**', route => available
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="blue"/></svg>' })
    : route.fulfill({ status: 503, body: 'Temporarily unavailable' }));
  const value = { ...post(), embed: { $type: 'app.bsky.embed.images#view', images: [1, 2].map(number => ({ thumb: imageUrl, fullsize: `${imageUrl}?image=${number}`, alt: `Photo ${number}` })) } };
  await page.route('**/xrpc/app.bsky.feed.getFeed?*', route => route.fulfill({ json: { feed: [{ post: value }] } }));
  await openTestFeed(page, control);
  await page.getByRole('link', { name: 'Photo 1', exact: true }).click();
  const viewer = page.getByRole('region', { name: 'Image viewer' });
  await expect(viewer.getByRole('button', { name: 'Retry image' })).toBeVisible();
  available = true;
  await viewer.getByRole('button', { name: 'Retry image' }).click();
  await expect.poll(() => viewer.locator('.media-panel__image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1600);
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const viewport = viewer.locator('.media-panel__viewport');
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => viewport.evaluate(node => -Number(node.getAttribute('data-pan-x')))).toBeGreaterThan(0);
  await expect(viewer.getByRole('status')).toHaveText('1 of 2');
  await viewer.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect(viewer.getByRole('status')).toHaveText('2 of 2');
});
