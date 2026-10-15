import { test, expect, type Page } from '@playwright/test';
import { mockBluesky, me, fixtureCid } from './fixtures';

async function signIn(page: Page) {
  const api = await mockBluesky(page);
  await page.goto('/');
  await page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Handle or email').fill(me.handle);
  await dialog.getByLabel('App password', { exact: true }).fill('fake-app-password');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return api;
}
async function compose(page: Page) {
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'What’s happening?' });
  await expect(input).toBeEnabled();
  return input;
}
async function changeStoredDraft(page: Page, text: string) {
  await page.evaluate(async ({ did, text }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const q = indexedDB.open('panels-local'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const q = store.get(`${did}:compose`);
      q.onsuccess = () => store.put({ ...q.result, data: { text }, revision: crypto.randomUUID(), savedAt: Date.now() });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { did: me.did, text });
}

test('failed draft commit stays visible and cannot silently close; retry preserves text', async ({ page }) => {
  await signIn(page);
  const input = await compose(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).restoreDraftPut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'drafts') throw new DOMException('Disk is full', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await input.fill('Keep this text through storage failure.');
  await expect(page.getByRole('status').filter({ hasText: 'Draft could not be saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Close composer' }).click();
  await expect(input).toHaveValue('Keep this text through storage failure.');
  await page.evaluate(() => (window as any).restoreDraftPut());
  await page.getByRole('button', { name: 'Retry saving' }).click();
  await expect(page.locator('.draft-status')).toHaveAttribute('data-save-state', 'saved');
  await page.getByRole('button', { name: 'Close composer' }).click();
  await expect(await compose(page)).toHaveValue('Keep this text through storage failure.');
});

test('concurrent draft revision keeps local text and requires explicit conflict resolution', async ({ page }) => {
  await signIn(page);
  const input = await compose(page);
  await input.fill('First local revision');
  await expect(page.locator('.draft-status')).toHaveAttribute('data-save-state', 'saved');
  await changeStoredDraft(page, 'Text saved by another window');
  await input.fill('My newer unsaved text');
  await expect(page.locator('.draft-status')).toHaveAttribute('data-save-state', 'conflict');
  await expect(input).toHaveValue('My newer unsaved text');
  await page.getByRole('button', { name: 'Use saved draft' }).click();
  await expect(input).toHaveValue('Text saved by another window');
});

test('confirmed publication does not delete a newer draft revision', async ({ page }) => {
  const api = await signIn(page);
  const input = await compose(page);
  await input.fill('Publish this revision');
  const pending = api.defer('com.atproto.repo.createRecord', request => request.body?.collection === 'app.bsky.feed.post');
  await page.getByRole('dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await pending.started;
  await changeStoredDraft(page, 'Another window has newer private text');
  pending.release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(await compose(page)).toHaveValue('Another window has newer private text');
  expect(api.violations).toEqual([]);
});

test('ambiguous accepted publication survives reload and reconciles the same record without another create', async ({ page }) => {
  const api = await signIn(page);
  let accepted: { uri: string; cid: string; value: unknown } | undefined;
  api.respond('com.atproto.repo.createRecord', request => {
    if (request.body.collection !== 'app.bsky.feed.post') return;
    accepted = { uri: `at://${me.did}/app.bsky.feed.post/${request.body.rkey}`, cid: fixtureCid, value: request.body.record };
    return { status: 503, body: { error: 'UpstreamFailure', message: 'Response lost after commit' } };
  });
  api.respond('com.atproto.repo.getRecord', () => accepted ? { body: accepted } : undefined);
  const input = await compose(page);
  await input.fill('One immutable attempt after an uncertain response.');
  await page.getByRole('dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unconfirmed');
  await expect(input).toBeDisabled();
  await expect(page.locator('.draft-status')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await page.getByRole('button', { name: 'Check post', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const creates = api.requests.filter(request => request.endpoint === 'com.atproto.repo.createRecord' && request.body?.collection === 'app.bsky.feed.post');
  expect(creates).toHaveLength(1);
  expect(creates[0].body.rkey).toBeTruthy();
  expect(api.violations).toEqual([]);
});

test('explicit rejected publication keeps editable text and reports the rejection', async ({ page }) => {
  const api = await signIn(page);
  api.respond('com.atproto.repo.createRecord', () => ({ status: 400, body: { error: 'InvalidRecord', message: 'The service rejected this post.' } }));
  const input = await compose(page);
  await input.fill('Keep my rejected text.');
  await page.getByRole('dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('rejected');
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('Keep my rejected text.');
  await expect(page.locator('.draft-status')).toHaveAttribute('data-save-state', 'saved');
});
