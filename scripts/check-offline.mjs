import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { finalizePwa } from './build-sw.mjs';

async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${args[0]} exited ${code}`)));
  });
}

const directory = await mkdtemp(join(tmpdir(), 'panes-offline-'));
try {
  for (const base of ['/', '/panels/']) {
    await run(['node_modules/vite/bin/vite.js', 'build', `--base=${base}`, '--outDir', directory, '--emptyOutDir']);
    await finalizePwa(directory);
    await run(['scripts/verify-offline-browsers.mjs', directory, base]);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
