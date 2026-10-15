/* Replaced with the exact build's asset list by scripts/build-sw.mjs. */
const BUILD = '__PANEL_BUILD__';
const FILES = /*__PANEL_FILES__*/ [];
const OPTIONAL_FILES = /*__PANEL_OPTIONAL_FILES__*/ [];
const PREFIX = 'panels-shell-';
const CACHE = `${PREFIX}${BUILD}`;
const assetUrls = new Set(FILES.map((file) => new URL(file, self.registration.scope).href));
const optionalUrls = new Set(OPTIONAL_FILES.map((file) => new URL(file, self.registration.scope).href));
const shellUrl = new URL('index.html', self.registration.scope).href;
let preparation;
let updateTask;

async function fetchBounded(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Fetch resolves at headers. Keep the deadline through the entire chunk body,
    // retaining the original Response for both the browser and Cache Storage.
    await response.clone().arrayBuffer();
    return response;
  } finally { clearTimeout(timeout); }
}

self.addEventListener('install', (event) => {
  // Stable icon/artwork URLs must not populate a new release from stale HTTP cache.
  event.waitUntil((async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll([...assetUrls].map((url) => new Request(url, { cache: 'reload', signal: controller.signal })));
    } finally { clearTimeout(timeout); }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const scopePrefix = `${PREFIX}${new URL(self.registration.scope).pathname}:`;
    const names = (await caches.keys()).filter((name) => name.startsWith(scopePrefix) && name !== CACHE);
    // Keep the preceding release for requests already in flight while tabs reload.
    await Promise.all(names.slice(0, -1).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function prepareUpdate() {
  if (preparation) return;
  const clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter((client) => client.url.startsWith(self.registration.scope));
  const token = `${Date.now()}-${Math.random()}`;
  let finish;
  const ready = new Promise((resolve) => { finish = resolve; });
  preparation = { token, phase: 'prepare', pending: new Set(clients.map((client) => client.id)), finish };
  const timeout = setTimeout(() => finish(false), 15000);
  for (const client of clients) client.postMessage({ type: 'PREPARE_UPDATE', token });
  if (!clients.length) finish(true);
  const accepted = await ready;
  clearTimeout(timeout);
  preparation = undefined;
  if (!accepted) {
    for (const client of clients) client.postMessage({ type: 'UPDATE_BLOCKED', message: 'Update paused. Save or close unfinished work in every Panes tab, then try again.' });
    return;
  }
  // Recheck membership: a newly opened tab did not consent to this update.
  const current = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter((client) => client.url.startsWith(self.registration.scope));
  if (current.some((client) => !clients.some((known) => known.id === client.id))) {
    for (const client of current) client.postMessage({ type: 'UPDATE_BLOCKED', message: 'Another Panes tab opened. Try the update again.' });
    return;
  }
  // Message delivery and controllerchange need not be ordered across task sources.
  // Wait until every tab confirms that its reload listener is armed.
  let commitFinish;
  const committed = new Promise((resolve) => { commitFinish = resolve; });
  preparation = { token, phase: 'commit', pending: new Set(current.map((client) => client.id)), finish: commitFinish };
  const commitTimeout = setTimeout(() => commitFinish(false), 15000);
  for (const client of current) client.postMessage({ type: 'COMMIT_UPDATE', token });
  if (!current.length) commitFinish(true);
  const commitAccepted = await committed;
  clearTimeout(commitTimeout);
  preparation = undefined;
  if (!commitAccepted) {
    for (const client of current) client.postMessage({ type: 'UPDATE_BLOCKED', message: 'A Panes tab stopped responding. Close it and try the update again.' });
    return;
  }
  await self.skipWaiting();
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    if (!updateTask) updateTask = prepareUpdate().finally(() => { updateTask = undefined; });
    event.waitUntil(updateTask);
  }
  if (preparation && event.data?.type === (preparation.phase === 'prepare' ? 'UPDATE_ACK' : 'UPDATE_COMMIT_ACK') && event.data.token === preparation.token && preparation.pending.has(event.source?.id)) {
    if (event.data.ready !== true) preparation.finish(false);
    else {
      preparation.pending.delete(event.source.id);
      if (!preparation.pending.size) preparation.finish(true);
    }
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate') {
    // A controlled tab stays on this release until all tabs accept the update.
    event.respondWith((async () => {
      const shell = await caches.open(CACHE).then((cache) => cache.match(shellUrl));
      if (shell) return shell;
      // An evicted shell must not silently run a different release under this worker.
      return new Response('Panes offline files are unavailable. Reconnect and close all Panes tabs, then reopen the app.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    })());
    return;
  }
  if (assetUrls.has(url.href) || optionalUrls.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match(request, { ignoreVary: true });
      if (saved) return saved;
      try {
        const response = await fetchBounded(new Request(request, { cache: 'reload' }));
        // Only the build's explicit same-origin optional chunks may enter runtime cache.
        if (optionalUrls.has(url.href)) {
          try { await cache.put(request, response.clone()); } catch { /* Storage is best effort; network playback still works. */ }
        }
        return response;
      } catch { return Response.error(); }
    })());
  }
});
