import { expect, test as base } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mockBluesky, post } from './fixtures';

const test = base.extend<{ media: { playlist: string; requests: string[]; setAvailable: (value: boolean) => void } }>({
  media: async ({}, use) => {
    const requests: string[] = [];
    let available = true;
    // Native WebKit's media stack uses its own network path, outside page.route.
    const server = createServer(async (request, response) => {
      const filename = new URL(request.url!, 'http://localhost').pathname.slice(1);
      if (!/^(playlist\.m3u8|segment\d{2}\.ts)$/.test(filename)) {
        response.writeHead(404).end();
        return;
      }
      requests.push(filename);
      if (!available) {
        response.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end();
        return;
      }
      const body = await readFile(new URL(`./media/${filename}`, import.meta.url));
      response.writeHead(200, {
        'Content-Type': filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
        'Content-Length': body.length,
        'Access-Control-Allow-Origin': '*',
      });
      response.end(body);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await use({ playlist: `http://127.0.0.1:${(server.address() as AddressInfo).port}/playlist.m3u8`, requests, setAvailable: value => { available = value; } });
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
});

test('HLS video loads fragments only after Play and decodes frames', async ({ page, media }, testInfo) => {
  await mockBluesky(page);
  await page.route('https://poster.example.test/video.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="blue"/></svg>' }));
  const videoPost = {
    ...post(0),
    embed: {
      $type: 'app.bsky.embed.video#view',
      cid: 'bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
      playlist: media.playlist,
      thumbnail: 'https://poster.example.test/video.svg',
      alt: 'A generated color pattern with a test tone',
      aspectRatio: { width: 160, height: 90 },
    },
  };
  await page.route('**/xrpc/app.bsky.feed.getFeed?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ feed: [{ post: videoPost }] }),
  }));
  await page.route('**/xrpc/app.bsky.feed.getPostThread?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ thread: { $type: 'app.bsky.feed.defs#threadViewPost', post: videoPost, replies: [] } }),
  }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Watch video', exact: true })).toBeVisible();
  await expect(page.locator('.timeline-video-preview img')).toBeVisible();
  await expect.poll(() => page.locator('.timeline-video-preview img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(160);
  await expect(page.locator('video')).toHaveCount(0);
  expect(media.requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Watch video', exact: true }).click();
  await expect(page.locator('.stack-panel')).toHaveCount(1);
  const video = page.getByLabel('A generated color pattern with a test tone', { exact: true });
  await expect(video).toBeVisible();
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await expect(video).toBeInViewport();
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video).toHaveAttribute('controls', '');
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => Boolean(node.currentSrc))).toBe(true);
  // The hls.js path may fetch a manifest, but never media segments before Play.
  expect(media.requests.filter(path => path.endsWith('.ts'))).toHaveLength(0);
  await video.evaluate((node: HTMLVideoElement) => { node.muted = true; void node.play(); });
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.25);
  expect(media.requests.some(path => path.endsWith('.ts'))).toBe(true);
  const playback = await video.evaluate((node: HTMLVideoElement) => ({
    time: node.currentTime,
    readyState: node.readyState,
    width: node.videoWidth,
    height: node.videoHeight,
    nativeHls: Boolean(node.canPlayType('application/vnd.apple.mpegurl')),
    source: node.currentSrc.startsWith('blob:') ? 'MediaSource' : 'native',
    error: node.error?.message,
  }));
  expect(playback.width).toBe(160);
  expect(playback.height).toBe(90);
  expect(playback.error).toBeUndefined();
  expect(playback.source).toBe(playback.nativeHls ? 'native' : 'MediaSource');
  await testInfo.attach('HLS playback evidence', { body: JSON.stringify({ playback, mediaRequests: media.requests }, null, 2), contentType: 'application/json' });
  // A fully hidden sheet stays mounted, but playback must stop and must not
  // resume just because it becomes visible again. This exercises PanelStack's
  // inert/aria-hidden contract independently of drag geometry.
  const position = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
  await video.evaluate(node => node.closest('.stack-panel')!.setAttribute('inert', ''));
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
  const suspendedRequests = media.requests.length;
  await page.waitForTimeout(350);
  expect(media.requests.length).toBe(suspendedRequests);
  await video.evaluate(node => node.closest('.stack-panel')!.removeAttribute('inert'));
  expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
  expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThanOrEqual(position);
  await video.evaluate((node: HTMLVideoElement) => { void node.play(); });
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(position + 0.1);
  await video.evaluate((node: HTMLVideoElement) => node.pause());
  // Native video keyboard input must not bubble to the post's open action.
  await video.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stack-panel')).toHaveCount(1);
});


test('failed HLS can be retried after the stream becomes available', async ({ page, media }) => {
  await mockBluesky(page);
  media.setAvailable(false);
  const value = { ...post(), embed: {
    $type: 'app.bsky.embed.video#view',
    cid: 'bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
    playlist: media.playlist, alt: 'Recoverable video',
  } };
  await page.route('**/xrpc/app.bsky.feed.getFeed?*', route => route.fulfill({ json: { feed: [{ post: value }] } }));
  await page.route('**/xrpc/app.bsky.feed.getPostThread?*', route => route.fulfill({ json: { thread: { $type: 'app.bsky.feed.defs#threadViewPost', post: value, replies: [] } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Watch video', exact: true }).click();
  const video = page.getByLabel('Recoverable video', { exact: true });
  await expect(video).toBeVisible();
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
  await expect(video).toBeInViewport();
  // A failed manifest may already have destroyed MediaSource and cleared src.
  // Native HLS still needs Play to initiate its preload=none request.
  await video.evaluate((node: HTMLVideoElement) => { node.muted = true; void node.play().catch(() => {}); });
  await expect(page.getByRole('button', { name: 'Retry video', exact: true })).toBeVisible({ timeout: 25_000 });
  media.setAvailable(true);
  await page.getByRole('button', { name: 'Retry video', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry video', exact: true })).toHaveCount(0);
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => Boolean(node.currentSrc))).toBe(true);
  await video.evaluate((node: HTMLVideoElement) => { void node.play().catch(() => {}); });
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.25);
});

test('a playing video pauses when its phone sheet moves offscreen and requires explicit resume', async ({ page, media }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBluesky(page);
  const value = { ...post(), embed: { $type: 'app.bsky.embed.video#view', cid: post().cid, playlist: media.playlist, alt: 'Visibility test video', aspectRatio: { width: 160, height: 90 } } };
  await page.route('**/xrpc/app.bsky.feed.getFeed?*', route => route.fulfill({ json: { feed: [{ post: value }] } }));
  await page.route('**/xrpc/app.bsky.feed.getPostThread?*', route => route.fulfill({ json: { thread: { $type: 'app.bsky.feed.defs#threadViewPost', post: value, replies: [] } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Watch video', exact: true }).click();
  const video = page.getByLabel('Visibility test video', { exact: true });
  const deck = page.locator('.panel-stack');
  const panel = page.locator('.stack-panel');
  await expect(video).toBeVisible();
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await expect(video).toBeInViewport();
  await video.evaluate((element: HTMLVideoElement) => { element.muted = true; void element.play(); });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(.25);
  await panel.focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await expect(video).not.toBeInViewport();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  const stoppedAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
  await page.waitForTimeout(350);
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(stoppedAt, 2);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await expect(video).toBeInViewport();
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await video.evaluate((element: HTMLVideoElement) => { void element.play(); });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(stoppedAt + .1);
  expect(await video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(160);
});
