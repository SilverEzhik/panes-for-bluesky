import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';

/** Bind the browser run to bytes served by its fresh, test-owned production server. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const index = await fetch(baseURL);
  if (!index.ok) throw new Error(`Test server returned ${index.status}`);
  const html = await index.text();
  const paths = ['index.html', ...new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1].replace(/^\//, '')))];
  for (const file of await readdir(resolve('dist/assets'))) {
    if (/\.(?:js|css)$/.test(file) && !paths.includes(`assets/${file}`)) paths.push(`assets/${file}`);
  }
  const files: Record<string, string> = {};
  for (const path of paths) {
    const response = await fetch(new URL(path === 'index.html' ? '/' : path, baseURL));
    if (!response.ok) throw new Error(`Test server missing ${path}`);
    const served = new Uint8Array(await response.arrayBuffer());
    const disk = await readFile(resolve('dist', path));
    if (hash(served) !== hash(disk)) throw new Error(`Served build differs from dist: ${path}`);
    files[path] = hash(served);
  }
  await mkdir('research/verification', { recursive: true });
  await writeFile('research/verification/served-build.json', JSON.stringify({ capturedAt: new Date().toISOString(), baseURL, freshTestOwnedServer: true, files }, null, 2) + '\n');
}
