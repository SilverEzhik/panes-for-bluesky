/** Local content storage. Credentials never belong in this database. */
const DATABASE = 'panels-local';
const VERSION = 2;
const SNAPSHOTS = 'snapshots';
const DRAFTS = 'drafts';
const LIFETIMES = 'account-lifetimes';
const MAX_SNAPSHOTS = 30;
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;

export interface AccountLifetime { did: string; epoch: string }
interface LifetimeRecord extends AccountLifetime { active: boolean }
export interface OfflineRecord<T> { data: T; savedAt: number; revision: string }
interface StoredRecord<T> extends OfflineRecord<T> { key: string }
export type StorageResult = { ok: true; revision: string } | { ok: false; reason: 'unavailable' | 'invalidated' | 'conflict' };
const unavailable: StorageResult = { ok: false, reason: 'unavailable' };
const invalidated: StorageResult = { ok: false, reason: 'invalidated' };
const listeners = new Set<(did: string, epoch: string | null) => void>();
let channel: BroadcastChannel | undefined;
function notifications(): BroadcastChannel | undefined {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('panels-account-lifetimes');
    channel.onmessage = (event: MessageEvent<{ did: string; epoch: string | null }>) => {
      if (typeof event.data?.did === 'string') listeners.forEach((listener) => listener(event.data.did, event.data.epoch));
    };
  }
  return channel;
}
export function subscribeAccountInvalidation(listener: (did: string, epoch: string | null) => void): () => void {
  listeners.add(listener);
  notifications();
  return () => { listeners.delete(listener); };
}
function announce(did: string, epoch: string | null, local = true) {
  if (local) listeners.forEach((listener) => listener(did, epoch));
  notifications()?.postMessage({ did, epoch });
}

let database: Promise<IDBDatabase | null> | undefined;
function openDatabase(): Promise<IDBDatabase | null> {
  if (database) return database;
  database = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      for (const name of [SNAPSHOTS, DRAFTS, LIFETIMES]) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: name === LIFETIMES ? 'did' : 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      db.onclose = () => { database = undefined; };
      resolve(db);
    };
    request.onerror = () => { database = undefined; resolve(null); };
    // A blocked upgrade may finish later. Do not abandon it and leak its connection.
  });
  return database;
}

/** All account writes and erasure lock the lifetime store in the same transaction. */
async function transaction<T>(stores: string[], mode: IDBTransactionMode, failure: T,
  operation: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  try {
    const db = await openDatabase();
    if (!db) return failure;
    return await new Promise<T>((resolve) => {
      const tx = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
      let value = failure;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => resolve(failure);
      tx.onerror = () => { /* onabort reports failed commits; never acknowledge a request alone. */ };
      try { operation(tx, (next) => { value = next; }); }
      catch { tx.abort(); }
    });
  } catch { return failure; }
}

export async function activateAccountLifetime(did: string): Promise<AccountLifetime | null> {
  let previous: LifetimeRecord | undefined;
  const lifetime = { did, epoch: crypto.randomUUID() };
  const result = await transaction<AccountLifetime | null>([LIFETIMES], 'readwrite', null, (tx, done) => {
    const store = tx.objectStore(LIFETIMES);
    const request = store.get(did);
    request.onsuccess = () => {
      previous = request.result as LifetimeRecord | undefined;
      store.put({ ...lifetime, active: true });
      done(lifetime);
    };
  });
  if (result && previous?.active) announce(did, previous.epoch, false);
  return result;
}

/** Initializes existing installations once; a revoked lifetime requires explicit login. */
export function getAccountLifetime(did: string): Promise<AccountLifetime | null> {
  return transaction<AccountLifetime | null>([LIFETIMES], 'readwrite', null, (tx, done) => {
    const store = tx.objectStore(LIFETIMES);
    const request = store.get(did);
    request.onsuccess = () => {
      const existing = request.result as LifetimeRecord | undefined;
      if (existing) { done(existing.active ? { did, epoch: existing.epoch } : null); return; }
      const lifetime = { did, epoch: crypto.randomUUID() };
      store.put({ ...lifetime, active: true });
      done(lifetime);
    };
  });
}

function accountKey(key: string): boolean { return key.startsWith('account:') || key.startsWith('did:'); }
function keyMatches(key: string, lifetime: AccountLifetime): boolean {
  return key.startsWith(`account:${lifetime.did}:`) || key.startsWith(`${lifetime.did}:`);
}
function guard(tx: IDBTransaction, key: string, lifetime: AccountLifetime | null | undefined, accept: () => void, reject: () => void) {
  if (!accountKey(key)) { accept(); return; }
  if (!lifetime || !keyMatches(key, lifetime)) { reject(); return; }
  const request = tx.objectStore(LIFETIMES).get(lifetime.did);
  request.onsuccess = () => {
    const current = request.result as LifetimeRecord | undefined;
    if (current?.active && current.epoch === lifetime.epoch) accept(); else reject();
  };
}

function read<T>(storeName: string, key: string, lifetime?: AccountLifetime | null): Promise<OfflineRecord<T> | null> {
  return transaction<OfflineRecord<T> | null>([storeName, LIFETIMES], 'readonly', null, (tx, done) => {
    guard(tx, key, lifetime, () => {
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => {
        const value = request.result as StoredRecord<T> | undefined;
        if (value && !(storeName === SNAPSHOTS && Date.now() - value.savedAt > MAX_AGE)) {
          done({ data: value.data, savedAt: value.savedAt, revision: value.revision ?? '' });
        }
      };
    }, () => done(null));
  });
}

function write<T>(storeName: string, key: string, data: T, lifetime?: AccountLifetime | null, expectedRevision?: string | null): Promise<StorageResult> {
  return transaction<StorageResult>([storeName, LIFETIMES], 'readwrite', unavailable, (tx, done) => {
    guard(tx, key, lifetime, () => {
      const store = tx.objectStore(storeName);
      const save = () => {
        const revision = crypto.randomUUID();
        store.put({ key, data, savedAt: Date.now(), revision } satisfies StoredRecord<T>);
        done({ ok: true, revision });
        if (storeName === SNAPSHOTS) {
          const records = store.getAll();
          records.onsuccess = () => {
            const sorted = (records.result as StoredRecord<unknown>[]).sort((a, b) => b.savedAt - a.savedAt);
            sorted.forEach((record, index) => {
              if (index >= MAX_SNAPSHOTS || Date.now() - record.savedAt > MAX_AGE) store.delete(record.key);
            });
          };
        }
      };
      if (storeName === DRAFTS) {
        const request = store.get(key);
        request.onsuccess = () => {
          const current = request.result as StoredRecord<T> | undefined;
          if ((current ? current.revision ?? '' : null) !== expectedRevision) done({ ok: false, reason: 'conflict' });
          else save();
        };
      } else save();
    }, () => done(invalidated));
  });
}

export const saveOfflineSnapshot = <T>(key: string, data: T, lifetime?: AccountLifetime | null): Promise<StorageResult> => write(SNAPSHOTS, key, data, lifetime);
export const readOfflineSnapshot = <T>(key: string, lifetime?: AccountLifetime | null): Promise<OfflineRecord<T> | null> => read<T>(SNAPSHOTS, key, lifetime);
export const saveOfflineDraft = <T>(key: string, data: T, lifetime: AccountLifetime | null, expectedRevision: string | null): Promise<StorageResult> => write(DRAFTS, key, data, lifetime, expectedRevision);
export const readOfflineDraft = <T>(key: string, lifetime: AccountLifetime | null): Promise<OfflineRecord<T> | null> => read<T>(DRAFTS, key, lifetime);
export function deleteOfflineDraft(key: string, lifetime: AccountLifetime | null, expectedRevision: string): Promise<StorageResult> {
  return transaction<StorageResult>([DRAFTS, LIFETIMES], 'readwrite', unavailable, (tx, done) => {
    guard(tx, key, lifetime, () => {
      const store = tx.objectStore(DRAFTS);
      const request = store.get(key);
      request.onsuccess = () => {
        const current = request.result as StoredRecord<unknown> | undefined;
        if (!current || (current.revision ?? '') !== expectedRevision) { done({ ok: false, reason: 'conflict' }); return; }
        store.delete(key);
        done({ ok: true, revision: expectedRevision });
      };
    }, () => done(invalidated));
  });
}

function eraseMatching(tx: IDBTransaction, storeName: string, did: string) {
  const request = tx.objectStore(storeName).openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (typeof cursor.key === 'string' && (cursor.key.startsWith(`account:${did}:`) || cursor.key.startsWith(`${did}:`))) cursor.delete();
    cursor.continue();
  };
}

/** Revocation and erasure are atomic: a queued writer can never resurrect this epoch. */
export async function clearAccountLocalContent(did: string): Promise<StorageResult> {
  let previous: string | null = null;
  const result = await transaction<StorageResult>([SNAPSHOTS, DRAFTS, LIFETIMES], 'readwrite', unavailable, (tx, done) => {
    const store = tx.objectStore(LIFETIMES);
    const request = store.get(did);
    request.onsuccess = () => {
      previous = (request.result as LifetimeRecord | undefined)?.epoch ?? null;
      const epoch = crypto.randomUUID();
      store.put({ did, epoch, active: false });
      eraseMatching(tx, SNAPSHOTS, did);
      eraseMatching(tx, DRAFTS, did);
      done({ ok: true, revision: epoch });
    };
  });
  announce(did, previous);
  return result;
}

/** Explicit whole-installation erasure also revokes every active writer. */
export async function clearLocalContent(): Promise<StorageResult> {
  const revoked: AccountLifetime[] = [];
  const result = await transaction<StorageResult>([SNAPSHOTS, DRAFTS, LIFETIMES], 'readwrite', unavailable, (tx, done) => {
    tx.objectStore(SNAPSHOTS).clear();
    tx.objectStore(DRAFTS).clear();
    const request = tx.objectStore(LIFETIMES).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const current = cursor.value as LifetimeRecord;
      revoked.push(current);
      cursor.update({ ...current, epoch: crypto.randomUUID(), active: false });
      cursor.continue();
    };
    done({ ok: true, revision: crypto.randomUUID() });
  });
  if (result.ok) revoked.forEach(({ did, epoch }) => announce(did, epoch));
  return result;
}
