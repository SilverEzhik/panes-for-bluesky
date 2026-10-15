# Astra deployment and reproducibility critique

Reviewed 2026-10-15. Scope: the current local/self-hosted Vite React PWA, its container, and portability of retained REA evidence. This review changed only this report; it did not install software, rebuild shared `dist/`, or publish anything.

The existing offline result is substantial: `research/verification/pwa-subpath-offline.json` records a stopped-server reload under `/panels/` in Chromium, Firefox and WebKit, all with offline styles, zero broken original images, 275 precached files and no cached API responses. Its recorded worker SHA-256 is `6afb7074ef941dd0ce0212987b0489246e6fe2e1d0b87c7aeb12a0959ac409e8`. I inspected this artifact, not reran that test. It establishes installation and offline reopening of one release; it does not establish behavior across releases, nginx cache headers, the Docker image, custom PDS CORS, or a physical iPad installation.

## 1. P1 — nginx marks stable artwork URLs immutable for a year

**Evidence:** `nginx.conf:14–16` applies `Cache-Control: public, max-age=31536000, immutable` to every `/assets/` path. The 265 original images are copied from `public/assets/original/` under stable filenames, unlike Vite's hashed JS/CSS. `docs/local-first.md:39` correctly limits its recommendation to hashed assets, but the supplied configuration does not implement that distinction. `public/sw.js:9–10` installs by calling `cache.addAll()` with plain URLs, without explicit HTTP-cache revalidation.

**Concrete failure:** correct or replace an existing original PNG and deploy a new build. A returning browser can retain the old image at its unchanged URL for a year. A new service-worker cache name does not itself force the underlying HTTP cache to refresh that URL. The build hash therefore need not describe the actual image bytes copied into that browser's new Cache Storage entry. This is a source-established configuration defect; a real nginx/browser two-release run remains necessary to measure the exact observed path.

**Remedy:** give `/assets/original/` revalidating headers and reserve immutable caching for hashed outputs, or fingerprint those artwork filenames. Also consider explicit revalidation/reload requests during precaching for mutable shell files. Do not remove long caching from genuinely hashed bundles merely to fix original artwork.

**Acceptance test:** serve A through the supplied nginx config, load one PNG, deploy B with different bytes at the same original URL, install/activate B, stop the server, and assert the cached and rendered image bytes are B. Assert response headers separately for a hashed JS bundle and a stable original PNG. The existing stopped-server test cannot detect stale bytes when the file remains decodable.

## 2. P1 — waiting for an update does not keep the page on that release

**Evidence:** `public/sw.js:35–39` uses network-first navigation, falling back to the currently active worker's cached `index.html` only when fetch rejects. `src/pwa.ts:29–33` sends activation only on the update action. Thus an active A worker can return B HTML on ordinary online reload while its offline fallback remains A. A newly referenced B bundle is outside A's `assetUrls` and bypasses A's cache interception. Meanwhile stable artwork URLs still match A's cache.

**Observed read-only reproduction:** evaluated the actual worker source in a Node VM, supplied an A cached shell and a B network response, dispatched the same navigation event online and after a simulated network failure. Result:

```json
{
  "activeWorker": "A",
  "onlineNavigation": "release B HTML",
  "offlineNavigation": "release A HTML"
}
```

This is a worker-policy reproduction, not a browser lifecycle test. It demonstrates release switching independent of the explicit activation action. A real browser test must arrange a second A tab so B remains waiting while the first tab reloads. Depending on release differences, users can see B code with A artwork, then revert to A code offline. The README's worker-waits statement is literally true, but it does not provide a consistent deferred application update.

**Remedy:** choose and document a consistent release policy. For the existing explicit-update UX, serve the active release's cached shell for controlled application navigations until activation, and keep its asset set coherent. Validate multi-tab activation before deleting older caches: other open tabs do not necessarily reload when a different tab presses Update.

**Acceptance test:** install A, retain two tabs and an unsent draft, publish B, verify B waits, reload one tab online, then stop the server and reload again. Before acceptance both should remain a coherent A; after acceptance they should transition predictably to B without losing the draft. Record script, CSS and artwork versions as well as worker state. Also exercise an HTTP 503 navigation: the current fallback runs only on rejected fetch, so a received 503 replaces the usable offline shell with the host's error document.

## 3. P2 — the included container is root-only; the subpath instructions do not compose with it

**Evidence:** `vite.config.ts:6` reads build-time `process.env.BASE_URL`. `Dockerfile:1–6` has no `ARG BASE_URL` or corresponding environment setup, and copies only the internally rebuilt output. `Dockerfile:10` puts that output directly at nginx's document root. `nginx.conf:8–15` configures only root-level `/sw.js`, `/index.html` and `/assets/`. The README places a subdirectory build immediately before the alternative container instructions without stating this limitation.

**Concrete failure:** first run `BASE_URL=/panels/ npm run build`, then `docker build -t panes .`: the image rebuilds with `/` and ignores the earlier subpath build (`dist` is excluded by `.dockerignore`). Supplying `BASE_URL` to `docker run` cannot alter already-built URLs. Serving that image only under a reverse-proxy `/panels/` mount therefore does not automatically produce the verified subpath deployment. Adding only a build argument is also incomplete: the server mount/fallback and header locations must match.

**Remedy:** explicitly label the supplied image root-only and give one complete subpath recipe, or implement a build argument plus matching nginx placement/configuration. Keep this a small static-serving change, without adding application infrastructure.

**Acceptance test:** build and run the actual root image, then the supported subpath variant. Check entry HTML, manifest resolution, JS MIME, worker scope, revalidation headers and a stopped-server reload. Add one unknown navigation URL if the server is advertised to offer SPA fallback. The existing temporary-server `/panels/` evidence does not validate this Docker configuration.

## 4. P2 — the development-mode worker guard does not remove a previous production worker

**Evidence:** `docs/local-first.md:12` says production-only registration means source edits cannot be hidden by a stale offline cache. `src/pwa.ts:42` merely returns in development; it does not unregister an installed worker. If a production build was previously served on the same origin/port/path, its registration and cache survive.

**Concrete failure:** use a fixed local port for preview and then use that same port for development. A still-controlling production worker can serve cached original artwork for stable matching URLs; network-first navigation also falls back to the old production shell if the dev server is unavailable. The dev app declining to register a worker does not revoke the old one. Default Vite dev/preview ports differ, so the ordinary README sequence is usually protected by different origins; the categorical guarantee remains misleading.

**Remedy:** document separate dev/preview origins and the one-time unregister procedure when reusing an origin. If implementing automatic development cleanup, scope it to this app's known registration/cache prefix, not every worker/cache on the origin.

**Acceptance test:** install production on one fixed port, stop it, run dev on that port with an intentionally changed original artwork file, and verify either deliberate cleanup or a documented warning. Confirm cleanup does not delete another subpath installation's caches.

## 5. P2 — REA artifacts are auditable, but the supplied rerun scripts are tied to one workstation

**Evidence:** `research/rea/mcp_native_fixed_probe.py:5–6,28` hardcodes `/home/debian` paths for Java, Ghidra, the REA launcher and analyzed executable. `mcp_native_probe.py` has the same assumptions; `mcp_probe.py:5,29` hardcodes the launcher and IPA. The scripts write directly over retained `mcp-*.json`, `.log` evidence. `research/reverse-engineering.md:9–11` records installed versions and paths; it does not turn them into a portable setup entrypoint. `.gitignore` excludes the IPA and extracted Payload, so a clean clone cannot run the probes merely by installing REA.

**Concrete failure:** run the claimed reproducible native client on a second checkout/user account: it cannot start the hardcoded launcher, and changing only that path still leaves tool and target paths invalid. Running on the original workstation overwrites existing evidence instead of creating a distinct run. This is an evidence reproduction problem, not a dependency of building or serving Panes; none of these tools should be added to the web container.

**Remedy:** accept explicit launcher/JDK/Ghidra/target/output paths, resolve checkout-relative inputs where appropriate, and fail early with readable missing-input errors. Document the retained IPA hash and legally/user-supplied input prerequisite. Preserve each research run in a new directory and record versions, artifact hashes and commands there. Keep the existing retained evidence unchanged.

**Acceptance test:** from a checkout under a different home directory, use caller-supplied tool and target paths; verify the analyzed executable hash before opening it and capture a small read-only procedure probe into a fresh output directory. Check that original evidence files remain byte-identical. Do not automatically redownload or redistribute the historical IPA.

## Additional boundaries to document or verify

- **Build reproducibility:** README uses `npm ci` and specifies Node 22.12+, matching the locked toolchain's higher Node requirement. `docs/local-first.md:8` instead uses `npm install`; `package.json` has no `engines` or package-manager declaration and permits `@vitejs/plugin-react: latest`. The lockfile currently pins resolution, so this is not evidence of a broken install. Prefer one documented `npm ci` workflow, an enforced Node range and a recorded npm version. Mutable `node:22-alpine` and `nginx:alpine` tags also mean the container is not bit-for-bit reproducible; pin digests if exact image reproduction becomes a requirement.
- **Preview versus production:** `npm run preview` is suitable for the documented local production-build check. Explicitly state that it is not the intended long-running production host; Vite itself makes this distinction in its [static deployment guide](https://vite.dev/guide/static-deploy.html). The supplied nginx image is the relevant production example.
- **HTTPS and installation:** the docs correctly state that remote LAN HTTP does not provide the same worker/install behavior as localhost. The Docker command exposes HTTP; on an iPad accessing the machine's LAN IP, a certificate/trusted HTTPS endpoint is still needed. Physical Safari Add to Home Screen remains an explicitly unverified acceptance check, not a demonstrated failure.
- **Custom PDS/CORS:** `src/lib/bluesky.ts:254–256` restricts login services to HTTPS except localhost/127.0.0.1. Browser fetch goes directly to that service; the static host cannot repair a custom PDS's missing browser CORS support. Document browser-compatible PDS requirements and test one successful allowed-origin preflight plus an intentionally denied preflight for a useful error. No real custom-PDS failure was reproduced in this review.
- **URLs:** root/subpath shell hosting is supported; do not infer shareable post/profile routes from nginx's SPA fallback. The app's single-document UI and existing subpath test establish neither navigation-state restoration from a deep URL nor link generation for it.

Recommended order: correct immutable headers, add the two-release/multi-tab update test and settle that policy, then clarify the container/dev instructions and make research replay portable. Preserve the existing real-server-off three-engine check as a release baseline.
