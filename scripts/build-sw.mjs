import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Run after Vite has emitted its static files. Paths stay relative to the SW scope. */
export async function finalizePwa(outDir = 'dist') {
  const directory = resolve(outDir);
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const next = resolve(path, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.name !== 'sw.js' && !entry.name.endsWith('.map')) files.push(relative(directory, next).split(sep).join('/'));
    }
  }
  await walk(directory);
  files.sort();
  const emittedText = (await Promise.all(files.filter((file) => /\.(?:html|css|js)$/.test(file)).map((file) => readFile(resolve(directory, file), 'utf8')))).join('\n');
  // Original files stay on disk for provenance; only artwork actually named by
  // the emitted UI belongs in the offline app shell (including literal branches).
  const essential = files.filter((file) => !file.startsWith('assets/original/') || emittedText.includes(file.slice('assets/original/'.length)));
  const optional = essential.filter((file) => /^assets\/hls[^/]*\.js$/.test(file));
  const required = essential.filter((file) => !optional.includes(file));
  const swPath = resolve(directory, 'sw.js');
  let sw = await readFile(swPath, 'utf8');
  if (!sw.includes("'__PANEL_BUILD__'") || !sw.includes('/*__PANEL_FILES__*/ []')) throw new Error('Worker already finalized: run Vite build before finalizing again.');
  const hash = createHash('sha256');
  hash.update(sw);
  for (const file of essential) {
    hash.update(file);
    hash.update(await readFile(resolve(directory, file)));
  }
  const build = hash.digest('hex').slice(0, 16);
  // Include scope so two deployments sharing an origin cannot delete each other's caches.
  sw = sw.replace("'__PANEL_BUILD__'", "`${new URL(self.registration.scope).pathname}:" + build + "`");
  sw = sw.replace('/*__PANEL_FILES__*/ []', JSON.stringify(required));
  sw = sw.replace('/*__PANEL_OPTIONAL_FILES__*/ []', JSON.stringify(optional));
  await writeFile(swPath, sw);
  return { build, files: required.length, optionalFiles: optional.length, archivedFiles: files.length - essential.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await finalizePwa(process.argv[2] || 'dist');
  console.log(`PWA shell ${result.build}: ${result.files} static files precached.`);
}
