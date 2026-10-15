# Local use and self-hosting

This is a Vite + React browser app. It has no application server, hosted database, analytics, or paid service dependency. Bluesky API calls go directly from the browser to Bluesky or the account's chosen PDS. Browsing public content does not require an account or installation.

Use Node.js 22.12 or later, then install the locked dependencies:

```sh
npm ci
npm run dev
```

The Vite development server supports normal browser use. Service worker registration is limited to production builds. Keep development and preview on their different default ports. If reusing a production origin and port for development, unregister its Panes worker in browser developer tools first; declining registration does not remove an existing worker.

To test the installable, offline version locally:

```sh
npm run build
npm run preview
```

Open the preview URL shown in the terminal. After the first successful load, wait for the service worker to finish installing. Subsequent navigation can load the app shell without a network connection. Initial installation and fetching new content require a connection. The application remains usable as a normal tab without installation.

## Install on iPad

Open the app in Safari, then use Share → Add to Home Screen. The installed app uses standalone display and an iPad-compatible touch icon. Installation controls differ between browser versions; the browser owns these controls. On desktop, use the browser's install action if it offers one.

## Static hosting

Upload the contents of `dist/` to any static server. Use HTTPS for remote hosting; browsers also allow service workers on `localhost`. Plain HTTP on a LAN address does not provide install/offline support.

For hosting under a directory, build with its public path:

```sh
BASE_URL=/panels/ npm run build
```

Serve `dist/` at `/panels/`. Vite rewrites asset links; the manifest, worker scope, precache paths, and local icon links remain inside that directory. Keep the trailing slash. Static hosting needs to serve `index.html` for the application URL. The app uses a single document and does not require server-side rendering.

The included `nginx.conf` is a Docker build template. The image substitutes its base-path markers and places the built files at that same path. For root hosting:

```sh
docker build -t panes .
docker run --rm -p 8080:80 panes
```

For a directory deployment:

```sh
docker build --build-arg BASE_URL=/panels/ -t panes-subpath .
docker run --rm -p 8080:80 panes-subpath
```

Open `http://localhost:8080/panels/` for the second image. Setting `BASE_URL` on `docker run` cannot change built URLs. For a separate nginx installation, render the template's `__BASE_URL__` with the trailing-slash directory and `__BASE_NO_SLASH__` without it; for root, remove the no-slash redirect line. Do not serve the template verbatim. Use a trusted HTTPS endpoint when accessing from an iPad over the LAN: the HTTP container port alone does not provide remote install/offline support. `vite preview` is for local build checks, not the production hosting process.

Serve `sw.js` with `Cache-Control: no-cache`, `index.html` and `manifest.webmanifest` with revalidation, and hashed `assets/` files with a long immutable cache lifetime. Stable `assets/original/` artwork and `icons/` must revalidate rather than use immutable headers. Serve the manifest with `application/manifest+json` and JavaScript with a JavaScript MIME type. Do not put authentication or private API responses in a shared CDN cache.

The build runs `scripts/build-sw.mjs` after Vite. It hashes the worker and selected output, and injects the essential app-shell files into the worker. All 265 original decoded images remain on disk with their original provenance; only artwork filenames referenced by emitted HTML, CSS or JavaScript are precached. New dynamically assembled artwork names must be represented as full literal filenames so this build scan includes every branch. The optional HLS chunk is fetched and cached only when first requested; media streams and remote images remain network-only. Run the full build command whenever files change; copying a new file into `dist/` afterward will not add it to the offline shell.

## What stays on this device

The service worker stores only explicitly listed files emitted by the build: HTML, JavaScript, CSS, referenced original artwork, and icons. Precache requests bypass stale HTTP cache entries. Optional HLS code is cached on first use. It never adds API responses, arbitrary remote images, or authenticated requests to Cache Storage. Every API request goes to the network normally.

The `panels-local` IndexedDB database stores reading snapshots, remembered account identity, and unsent drafts. Custom-feed posts are keyed by feed URI and cursor; saved feeds and directory results also have reading snapshots. Remote thumbnails and video streams still require a connection. Reading snapshots retain a saved timestamp, expire after 14 days, and are limited to the latest 30 entries. They are a fallback when a request fails, not a source of new activity. Images hosted on Bluesky may be unavailable offline; bundled interface artwork remains available. Drafts can survive closing a compose window or restarting the browser, and are removed after successful posting.

Public reading uses a `bluesky-public-v1:` namespace. Signed-in timelines, notifications, profiles, conversations, and remembered display identity use an `account:<did>:` namespace. They remain on this device and are shown only for that account. Remembering an identity does not verify a session or authorize writes: online authentication remains necessary for posting, likes, reposts, or follows. A draft key includes the account DID so another account cannot restore its text. The exported `clearAccountLocalContent(did)` function removes one account's snapshots, identity, and drafts; `clearLocalContent()` removes all reading snapshots and drafts. Sign-out clears local account content. The browser's site-data controls also remove all local content and cached files.

Session persistence belongs to the Bluesky API module and is separate from this content database. Keep this host trusted: browser JavaScript served from the same origin can access local site storage. App passwords are sent directly to the account's PDS when signing in; the static host needs no Bluesky secrets.

Storage is best effort. Private browsing, browser eviction, quota limits, and manually clearing site data can remove offline content. Failed storage writes do not prevent network browsing or composing. No background worker publishes drafts, repeats writes, or queues social actions while offline; publication requires an explicit action with a working connection.

## Updates

A newly downloaded worker waits while the current version is open. Controlled navigations use the active release's cached HTML, including when the server returns an error, so an online reload cannot switch code before its worker activates. If browser eviction removes the shell, the app displays a reconnect/reopen response instead of silently mixing releases.

`subscribePwaStatus()` exposes `updateReady`, `updateApplying` and `updateError`. `applyPwaUpdate()` asks every open tab in this deployment to prepare. Components with unfinished work register `registerPwaUpdateGuard()`, save pending drafts and return whether reloading is safe. Any refusal or tab that fails to respond within 15 seconds pauses the update with a visible error. A tab opened during preparation also pauses the update. Once all tabs acknowledge, the worker tells them to reload on activation. A crashed or suspended tab may need to be closed before retrying.

Activation retains the preceding shell cache for requests in flight while tabs reload and removes older shell caches only for this deployment path. Separate subdirectory installations do not delete each other's caches. Optional same-origin chunk requests time out after ten seconds; private APIs and remote media bypass the worker. Browser storage eviction remains possible.

`getPwaStatus().offline` reflects the browser's connection signal. A connected device can still have an unreachable Bluesky server, so request errors and saved timestamps are also relevant. The UI should label restored snapshots as saved content rather than claim that they are current.

## Verify offline behavior

`node scripts/verify-pwa.mjs` checks the emitted worker's asset manifest, root and subdirectory scope handling, API bypass, cache cleanup, offline navigation fallback, and explicit update activation.

For a real browser check under a subdirectory, with the Playwright browser engines installed:

```sh
BASE_URL=/panels/ npm exec vite build -- --outDir /tmp/panes-subpath-dist --emptyOutDir
node scripts/build-sw.mjs /tmp/panes-subpath-dist
node scripts/verify-offline-browsers.mjs /tmp/panes-subpath-dist
```

This serves the build from a temporary local server, installs its worker in Chromium, Firefox, and WebKit, shuts down the server, and verifies that reloading still renders the app with cached original artwork. The two-release browser tests in `tests/pwa-updates.spec.ts` additionally exercise deferred activation, two tabs, a refusing draft guard, coherent stable artwork, optional HLS caching and offline reload after accepting an update at root and subdirectory scopes.

The stopped-server check also verifies that every precached URL is inside the deployment directory and that none is an API URL. Screenshots and `pwa-subpath-offline.json` are written to `research/verification/`. Browser engine emulation does not replace testing a physical iPad's gestures and installation flow.
