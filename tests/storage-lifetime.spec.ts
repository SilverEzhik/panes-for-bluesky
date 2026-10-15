import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type * as StorageApi from '../src/lib/offline';

type TestWindow = Window & { storageApi: typeof StorageApi; delayedWrite?: Promise<StorageApi.StorageResult>; releaseWrite?: () => void; invalidations?: string[] };
const source = ts.transpileModule(readFileSync('src/lib/offline.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function storagePage(page: Page) {
  await page.route('**/storage-test', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage transaction tests</title>' }));
  await page.goto('/storage-test');
  await page.evaluate(async (code) => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    (window as TestWindow).storageApi = await import(url);
    URL.revokeObjectURL(url);
  }, source);
}

test('queued writes from a revoked account cannot resurrect content, even after same-DID login', async ({ page }) => {
  await storagePage(page);
  const result = await page.evaluate(async () => {
    const win = window as TestWindow;
    const api = win.storageApi;
    const old = (await api.activateAccountLifetime('did:plc:one'))!;
    await api.saveOfflineSnapshot('bluesky-public-v1:discover', { text: 'public' });
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; }).then(() => api.saveOfflineDraft('account:did:plc:one:compose', 'late secret', old, null));
    const erased = await api.clearAccountLocalContent(old.did);
    const revoked = await api.getAccountLifetime(old.did);
    const fresh = (await api.activateAccountLifetime(old.did))!;
    release();
    return {
      erased, revoked, delayed: await delayed,
      draft: await api.readOfflineDraft('account:did:plc:one:compose', fresh),
      public: await api.readOfflineSnapshot('bluesky-public-v1:discover'),
      snapshot: await api.saveOfflineSnapshot('account:did:plc:one:v1:home', { text: 'late' }, old),
    };
  });
  expect(result.erased.ok).toBe(true);
  expect(result.revoked).toBeNull();
  expect(result.delayed).toEqual({ ok: false, reason: 'invalidated' });
  expect(result.snapshot).toEqual({ ok: false, reason: 'invalidated' });
  expect(result.draft).toBeNull();
  expect(result.public?.data).toEqual({ text: 'public' });
});

test('two windows receive invalidation and durable fencing rejects the late writer', async ({ page, context }) => {
  const other = await context.newPage();
  await storagePage(page);
  await storagePage(other);
  const lifetime = await page.evaluate(() => (window as TestWindow).storageApi.activateAccountLifetime('did:plc:one'));
  await other.evaluate(async (lease) => {
    const win = window as TestWindow;
    win.invalidations = [];
    win.storageApi.subscribeAccountInvalidation((did, epoch) => win.invalidations!.push(`${did}:${epoch}`));
    win.delayedWrite = new Promise<void>((resolve) => { win.releaseWrite = resolve; })
      .then(() => win.storageApi.saveOfflineDraft('account:did:plc:one:compose', 'late draft', lease, null));
  }, lifetime);
  await page.evaluate(() => (window as TestWindow).storageApi.clearAccountLocalContent('did:plc:one'));
  await expect.poll(() => other.evaluate(() => (window as TestWindow).invalidations)).toEqual([`${lifetime!.did}:${lifetime!.epoch}`]);
  expect(await other.evaluate(async () => {
    const win = window as TestWindow;
    win.releaseWrite!();
    return win.delayedWrite;
  })).toEqual({ ok: false, reason: 'invalidated' });
});

test('revision comparison prevents a published draft from erasing newer text', async ({ page }) => {
  await storagePage(page);
  const result = await page.evaluate(async () => {
    const api = (window as TestWindow).storageApi;
    const lifetime = await api.activateAccountLifetime('did:plc:one');
    const key = 'account:did:plc:one:compose';
    const first = await api.saveOfflineDraft(key, 'published text', lifetime, null);
    if (!first.ok) throw new Error('First save failed');
    const second = await api.saveOfflineDraft(key, 'newer unsent text', lifetime, first.revision);
    const deletion = await api.deleteOfflineDraft(key, lifetime, first.revision);
    const overwrite = await api.saveOfflineDraft(key, 'stale composer', lifetime, first.revision);
    return { second, deletion, overwrite, retained: await api.readOfflineDraft<string>(key, lifetime) };
  });
  expect(result.second.ok).toBe(true);
  expect(result.deletion).toEqual({ ok: false, reason: 'conflict' });
  expect(result.overwrite).toEqual({ ok: false, reason: 'conflict' });
  expect(result.retained?.data).toBe('newer unsent text');
});

test('aborted commit reports failed save and does not acknowledge a revision', async ({ page }) => {
  await storagePage(page);
  expect(await page.evaluate(async () => {
    const api = (window as TestWindow).storageApi;
    const lifetime = await api.activateAccountLifetime('did:plc:one');
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const result = original.apply(this, args);
      if (this.name === 'drafts') this.transaction.abort();
      return result;
    };
    try { return await api.saveOfflineDraft('account:did:plc:one:compose', 'unsaved', lifetime, null); }
    finally { IDBObjectStore.prototype.put = original; }
  })).toEqual({ ok: false, reason: 'unavailable' });
});
