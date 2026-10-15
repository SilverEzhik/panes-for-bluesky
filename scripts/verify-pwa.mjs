import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { finalizePwa } from './build-sw.mjs';

const directory = await mkdtemp(resolve(tmpdir(), 'panes-pwa-'));
try {
  await mkdir(resolve(directory, 'assets/original'), { recursive: true });
  await writeFile(resolve(directory, 'assets/original/unused.png'), 'archived');
  await writeFile(resolve(directory, 'assets/hls-optional.js'), 'export default 1');
  await writeFile(resolve(directory, 'index.html'), '<main>Panes</main>');
  await writeFile(resolve(directory, 'assets/app-123.js'), 'console.log("app")');
  await writeFile(resolve(directory, 'sw.js'), await readFile(new URL('../public/sw.js', import.meta.url)));
  const built = await finalizePwa(directory);
  assert.equal(built.files, 2);
  assert.equal(built.optionalFiles, 1);
  assert.equal(built.archivedFiles, 1);
  await assert.rejects(finalizePwa(directory), /already finalized/);
  const worker = await readFile(resolve(directory, 'sw.js'), 'utf8');
  assert.ok(!worker.includes('__PANEL_BUILD__'));
  assert.ok(!worker.includes('/*__PANEL_FILES__*/'));

  for (const pathname of ['/', '/panels/']) {
    const scope = `https://example.test${pathname}`;
    const eventHandlers = new Map();
    const cacheData = new Map();
    const deleted = [];
    const installed = [];
    const cache = {
      addAll: async (urls) => { urls.forEach((request) => { const url = request.url; assert.equal(request.cache, "reload"); installed.push(url); cacheData.set(url, new Response('cached shell')); }); },
      match: async (request) => cacheData.get(typeof request === 'string' ? request : request.url)?.clone(),
    };
    const old = `panels-shell-${pathname}:older`;
    const unrelated = 'panels-shell-/another-app/:keep';
    const fetches = [];
    let networkOnline = true;
    let claimed = false;
    let skipped = false;
    const sandbox = {
      URL, Response, Request, AbortController, setTimeout, clearTimeout,
      self: {
        registration: { scope },
        clients: { claim: async () => { claimed = true; }, matchAll: async () => [] },
        skipWaiting: () => { skipped = true; },
        addEventListener: (type, handler) => { eventHandlers.set(type, handler); },
      },
      caches: {
        open: async () => cache,
        keys: async () => [old, unrelated, `panels-shell-${pathname}:${built.build}`],
        delete: async (key) => { deleted.push(key); return true; },
      },
      fetch: async (request) => {
        fetches.push(request.url ?? request);
        if (!networkOnline) throw new TypeError('offline');
        return new Response('network');
      },
    };
    vm.runInNewContext(worker, sandbox);
    let pending;
    eventHandlers.get('install')({ waitUntil: (promise) => { pending = promise; } });
    await pending;
    assert.deepEqual(installed.sort(), [`${scope}assets/app-123.js`, `${scope}index.html`].sort());
    eventHandlers.get('activate')({ waitUntil: (promise) => { pending = promise; } });
    await pending;
    assert.equal(claimed, true);
    assert.deepEqual(deleted, [], 'keep the preceding release for in-flight requests');

    async function request(url, method = 'GET', mode = 'cors') {
      let response;
      eventHandlers.get('fetch')({ request: { url, method, mode }, respondWith: (promise) => { response = promise; } });
      return response ? await response : undefined;
    }
    assert.equal(await (await request(`${scope}assets/app-123.js`)).text(), 'cached shell');
    assert.equal(fetches.length, 0, 'precache serves built assets');
    assert.equal(await request('https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed'), undefined);
    assert.equal(await request(`${scope}xrpc/app.bsky.feed.getTimeline`), undefined);
    assert.equal(await request(`${scope}assets/app-123.js`, 'POST'), undefined);
    assert.equal(await request('https://cdn.bsky.app/avatar.jpeg'), undefined);
    assert.equal(await (await request(scope, 'GET', 'navigate')).text(), 'cached shell');
    assert.equal(fetches.length, 0, 'controlled navigation stays on the active shell even online');
    networkOnline = false;
    assert.equal(await (await request(`${scope}?saved=1`, 'GET', 'navigate')).text(), 'cached shell');
    eventHandlers.get('message')({ data: { type: 'ACTIVATE_UPDATE' }, waitUntil: promise => { pending = promise; } });
    await pending;
    assert.equal(skipped, true);
    cacheData.delete(`${scope}index.html`);
    assert.equal((await request(scope, 'GET', 'navigate')).status, 503, 'evicted shell produces a controlled recovery response');
  }
  // A chunk can return headers immediately but stall forever during its body.
  // Drive the actual worker fetch handler with a controllable stream and clock,
  // rather than waiting ten seconds or replacing fetchBounded with a test stub.
  for (const behavior of ['stalled-body', 'complete-body', 'http-error']) {
    const handlers = new Map();
    const timers = new Map();
    const writes = [];
    let timerId = 0;
    let signal;
    let streamController;
    const expected = 'export default "complete optional chunk";';
    const scope = 'https://example.test/panels/';
    const sandbox = {
      URL, Request, Response, AbortController,
      setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
      self: { registration: { scope }, addEventListener: (type, handler) => handlers.set(type, handler) },
      caches: { open: async () => ({
        match: async () => undefined,
        put: async (request, response) => writes.push({ url: request.url, body: await response.text() }),
      }) },
      fetch: async (_request, options) => {
        signal = options.signal;
        if (behavior === 'http-error') return new Response('unavailable', { status: 503 });
        return new Response(new ReadableStream({
          start(controller) {
            streamController = controller;
            controller.enqueue(new TextEncoder().encode(behavior === 'complete-body' ? expected : 'export '));
            if (behavior === 'complete-body') controller.close();
            else signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
          },
        }), { headers: { 'Content-Type': 'text/javascript', 'X-Release': 'fixture' } });
      },
    };
    vm.runInNewContext(worker, sandbox);
    let responsePromise;
    handlers.get('fetch')({
      request: new Request(`${scope}assets/hls-optional.js`),
      respondWith: promise => { responsePromise = promise; },
    });
    assert.ok(responsePromise, 'optional chunk is handled by the real worker');
    if (behavior === 'stalled-body') {
      // Let header fetch and stream cloning complete; no network/body deadline elapses.
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(streamController, 'headers and initial body bytes have arrived');
      assert.equal(timers.size, 1, 'deadline remains active after headers while body is incomplete');
      const [{ callback, delay }] = [...timers.values()];
      assert.equal(delay, 10000);
      callback();
    }
    const response = await responsePromise;
    assert.equal(timers.size, 0, 'deadline is cleared on every completion path');
    if (behavior === 'complete-body') {
      assert.equal(response.status, 200);
      assert.equal(response.bodyUsed, false, 'body verification must preserve the returned response');
      assert.equal(response.headers.get('X-Release'), 'fixture');
      assert.equal(await response.text(), expected);
      assert.deepEqual(writes, [{ url: `${scope}assets/hls-optional.js`, body: expected }], 'cache receives exactly the complete readable chunk');
      assert.equal(signal.aborted, false);
    } else {
      assert.equal(response.type, 'error', 'failed chunks return a network error');
      assert.deepEqual(writes, [], 'partial and HTTP-error chunks never enter Cache Storage');
      assert.equal(signal.aborted, behavior === 'stalled-body');
    }
  }
  console.log('PWA verified: build injection, root/subpath scopes, offline navigation, API bypass, isolated cache cleanup, explicit update, and optional-chunk body deadlines.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
