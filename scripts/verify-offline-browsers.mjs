import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';

// Build with BASE_URL=/panels/ first. Unlike browser offline emulation, shutting
// down a real server also exercises Firefox's normal service worker path.
const directory = resolve(process.argv[2] || 'dist');
const base = process.argv[3] || '/panels/';
const reportScope = base === '/' ? 'root' : 'subpath';
assert.ok(base.startsWith('/') && base.endsWith('/'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const results = [];

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (!pathname.startsWith(base)) throw new Error('outside scope');
      const relative = decodeURIComponent(pathname.slice(base.length)) || 'index.html';
      const file = resolve(directory, relative);
      if (!file.startsWith(directory + sep)) throw new Error('outside directory');
      const bytes = await readFile(file);
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', vary: 'Origin' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end('Missing file'); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(30_000);
    let online = true;
    await context.route('**/xrpc/**', (route) => online
      ? route.fulfill({ contentType: 'application/json', body: '{"feed":[]}', headers: { 'access-control-allow-origin': '*' } })
      : route.abort());
    await page.goto(origin + base);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((done) => navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }));
    });
    await page.reload();
    await page.locator('.sidebar').waitFor();
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const names = await caches.keys();
      const urls = (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))).flat();
      return { scope: registration.scope, names, urls };
    });
    assert.equal(state.scope, origin + base);
    assert.equal(state.names.length, 1);
    assert.ok(state.urls.length > 3);
    assert.ok(state.urls.every((url) => url.startsWith(origin + base)));
    assert.ok(state.urls.every((url) => !url.includes('/xrpc/')));
    online = false;
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await page.reload();
    await page.locator('.sidebar').waitFor();
    assert.match(await page.title(), /Panes/);
    assert.ok(await page.evaluate(() => document.styleSheets.length > 0), 'offline CSS must load');
    const brokenArt = await page.locator('img[src*="assets/original"]').evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src));
    assert.deepEqual(brokenArt, []);
    await page.screenshot({ path: `research/verification/${name}-${reportScope}-offline.png` });
    results.push({ engine: name, scope: base, precachedFiles: state.urls.length, apiResponsesCached: false, serverStoppedReloadPassed: true, offlineStylesLoaded: true, brokenOriginalImages: brokenArt });
    console.log(`${name}: ${base} shell, ${state.urls.length} cached files, API cache exclusion, and real server-off reload verified.`);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}
await writeFile(`research/verification/pwa-${reportScope}-offline.json`, JSON.stringify({
  checkedAt: new Date().toISOString(),
  workerSha256: createHash('sha256').update(await readFile(resolve(directory, 'sw.js'))).digest('hex'),
  results,
}, null, 2) + '\n');
