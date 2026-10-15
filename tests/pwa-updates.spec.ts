import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname } from 'node:path';
import ts from 'typescript';
import { finalizePwa } from '../scripts/build-sw.mjs';

test.use({ serviceWorkers: 'allow' });

for (const base of ['/', '/panels/']) {
  test(`two releases keep shell/art coherent and coordinate tab drafts at ${base}`, async ({ browser }) => {
    const directory = await mkdtemp(resolve(tmpdir(), 'panes-updates-'));
    let release = 'A';
    let online = true;
    const requests: string[] = [];
    const source = (await readFile('src/pwa.ts', 'utf8')).replaceAll('import.meta.env.PROD', 'true').replaceAll('import.meta.env.BASE_URL', JSON.stringify(base));
    const pwa = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    for (const version of ['A', 'B']) {
      const output = resolve(directory, version);
      await mkdir(resolve(output, 'assets/original'), { recursive: true });
      await writeFile(resolve(output, 'assets/original/art.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text>${version}</text></svg>`);
      await writeFile(resolve(output, 'assets/original/unused.png'), 'archive');
      await writeFile(resolve(output, 'assets/hls-optional.js'), `export default '${version}'`);
      await writeFile(resolve(output, 'app.js'), `${pwa}\nregisterPwa();\nregisterPwaUpdateGuard(() => !window.blockUpdate);\nwindow.applyUpdate=applyPwaUpdate; window.pwaStatus=getPwaStatus;`);
      await writeFile(resolve(output, 'index.html'), `<!doctype html><title>Panes ${version}</title><h1>${version}</h1><img src="${base}assets/original/art.svg"><textarea></textarea><script>document.querySelector('textarea').value=localStorage.getItem('draft')||'';document.querySelector('textarea').oninput=e=>localStorage.setItem('draft',e.target.value)</script><script type="module" src="${base}app.js"></script>`);
      await writeFile(resolve(output, 'sw.js'), await readFile('public/sw.js'));
      await finalizePwa(output);
    }
    const server = createServer(async (request, response) => {
      requests.push(request.url || '');
      if (!online) { response.writeHead(503); response.end('server unavailable'); return; }
      try {
        const pathname = new URL(request.url!, 'http://localhost').pathname;
        if (!pathname.startsWith(base)) throw Error();
        const path = pathname.slice(base.length) || 'index.html';
        const bytes = await readFile(resolve(directory, release, path));
        const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' } as Record<string,string>)[extname(path)] || 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': type, 'Cache-Control': path.includes('original/') ? 'public,max-age=31536000,immutable' : 'no-cache' });
        response.end(bytes);
      } catch { response.writeHead(404); response.end(); }
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}${base}`;
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    try {
      const first = await context.newPage();
      await first.goto(url);
      await first.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(done => navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }));
      });
      const second = await context.newPage();
      await second.goto(url);
      await second.locator('textarea').fill('saved in the other tab');
      await second.evaluate(() => { (window as any).blockUpdate = true; });
      const installed = await first.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).map(r => r.url));
      expect(installed.some(path => path.includes('unused.png'))).toBe(false);
      expect(installed.some(path => path.includes('hls-optional'))).toBe(false);
      release = 'B';
      await first.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
      await expect.poll(() => first.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(true);
      await first.reload();
      await expect(first.locator('h1')).toHaveText('A');
      online = false; // Even an HTTP error must leave the cached shell intact.
      await first.reload();
      await expect(first.locator('h1')).toHaveText('A');
      online = true;
      await first.evaluate(() => (window as any).applyUpdate());
      await expect.poll(() => first.evaluate(() => (window as any).pwaStatus().updateError)).toContain('Update paused');
      await expect(second.locator('h1')).toHaveText('A');
      await second.evaluate(() => { (window as any).blockUpdate = false; });
      await first.evaluate(() => (window as any).applyUpdate());
      await expect(first.locator('h1')).toHaveText('B');
      await expect(second.locator('h1')).toHaveText('B');
      await expect(second.locator('textarea')).toHaveValue('saved in the other tab');
      expect(await first.evaluate(async base => (await fetch(`${base}assets/original/art.svg`)).text(), base)).toContain('>B<');
      // Optional code is fetched/cached only after a request; archives never are.
      await first.evaluate(async base => { await fetch(`${base}assets/hls-optional.js`); }, base);
      expect(requests.some(path => path.includes('unused.png'))).toBe(false);
      server.closeAllConnections();
      await new Promise<void>(done => server.close(() => done()));
      await first.reload();
      await expect(first.locator('h1')).toHaveText('B');
      expect(await first.evaluate(async base => (await fetch(`${base}assets/hls-optional.js`)).text(), base)).toContain("'B'");
    } finally {
      await context.close();
      server.closeAllConnections();
      await new Promise<void>(done => server.close(() => done()));
      await rm(directory, { recursive: true, force: true });
    }
  });
}
