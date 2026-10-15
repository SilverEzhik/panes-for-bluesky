import { test, expect } from '@playwright/test';
import { BlueskyClient, PublicationUncertainError } from '../src/lib/bluesky';

// Exercise the real SDK/client in Node with a deterministic fetch transport. No live writes.
const did = 'did:plc:zyxwvutsrqponmlkjihgfedc';
const labeler = 'did:plc:ar7c4by46qjdydhdevvrndac';
const cid = 'bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test.describe('SDK authentication lifecycle without real accounts', () => {
  let originalFetch: typeof fetch;
  let originalStorage: PropertyDescriptor | undefined;
  let stored: Map<string, string>;
  let calls: string[];
  let override: (endpoint: string, request: Request) => Promise<Response | undefined>;
  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    stored = new Map(); calls = [];
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); },
    } });
    override = async () => undefined;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const endpoint = new URL(request.url).pathname.split('/xrpc/')[1];
      calls.push(endpoint);
      const response = await override(endpoint, request);
      if (response) return response;
      if (endpoint === 'com.atproto.server.createSession' || endpoint === 'com.atproto.server.refreshSession') return json({ did, handle: 'me.bsky.social', accessJwt: 'access', refreshJwt: 'refresh', active: true });
      if (endpoint === 'com.atproto.server.getSession') return json({ did, handle: 'me.bsky.social', active: true });
      if (endpoint === 'com.atproto.server.deleteSession') return json({});
      if (endpoint === 'app.bsky.actor.getPreferences') return json({ preferences: [] });
      if (endpoint === 'app.bsky.labeler.getServices') return json({ views: [] });
      if (endpoint === 'app.bsky.actor.getProfile') return json({ did, handle: 'me.bsky.social', displayName: 'Me' });
      if (endpoint === 'app.bsky.feed.getFeed') return json({ feed: [] });
      throw new Error(`Unmocked SDK endpoint ${endpoint}`);
    };
  });
  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  test('session-only credentials survive a transient read failure and refresh', async () => {
    localStorage.setItem = () => { throw new Error('Storage unavailable'); };
    const client = new BlueskyClient();
    await client.login('me.bsky.social', 'fake');
    override = async endpoint => endpoint === 'app.bsky.feed.getFeed' ? json({ error: 'UpstreamFailure' }, 503) : undefined;
    await expect(client.publicFeed()).rejects.toThrow();
    expect(client.session?.connection).toBe('offline');
    override = async () => undefined;
    await client.reconnect();
    expect(client.session?.connection).toBe('verified');
    expect(calls).toContain('com.atproto.server.refreshSession');
    expect(calls).not.toContain('app.bsky.actor.putPreferences');
    await client.logout();
  });

  test('restore hydration cannot join its own restoration after a concurrent read fails', async () => {
    const client = new BlueskyClient();
    await client.login('me.bsky.social', 'fake');
    const preferencesStarted = deferred<void>();
    const releasePreferences = deferred<void>();
    override = async endpoint => {
      if (endpoint === 'app.bsky.actor.getPreferences') { preferencesStarted.resolve(); await releasePreferences.promise; return json({ preferences: [] }); }
      if (endpoint === 'app.bsky.feed.getFeed') return json({ error: 'UpstreamFailure' }, 503);
      return undefined;
    };
    const restoring = client.reconnect();
    await preferencesStarted.promise;
    await expect(client.publicFeed()).rejects.toThrow();
    releasePreferences.resolve();
    const outcome = await Promise.race([restoring.then(() => 'settled'), new Promise(resolve => setTimeout(() => resolve('cycle'), 300))]);
    expect(outcome).toBe('settled');
    override = async () => undefined;
    await client.reconnect();
    expect(client.session?.connection).toBe('verified');
    await client.logout();
  });

  test('logout during facet resolution prevents the old account publication', async () => {
    const client = new BlueskyClient();
    await client.login('me.bsky.social', 'fake');
    const started = deferred<void>(); const release = deferred<void>();
    override = async endpoint => {
      if (endpoint === 'com.atproto.identity.resolveHandle') { started.resolve(); await release.promise; return json({ did }); }
      return undefined;
    };
    const pending = client.publish('Hi @someone.bsky.social');
    const rejection = expect(pending).rejects.toThrow(/active account changed/);
    await started.promise;
    await client.logout();
    release.resolve();
    await rejection;
    expect(calls.filter(endpoint => endpoint === 'com.atproto.repo.createRecord')).toHaveLength(0);
  });

  test('commit then lost response reconciles the same record on explicit retry', async () => {
    const client = new BlueskyClient();
    await client.login('me.bsky.social', 'fake');
    let committed: { uri: string; cid: string; value: unknown } | undefined;
    override = async (endpoint, request) => {
      if (endpoint === 'com.atproto.repo.createRecord') {
        const body = await request.json();
        committed = { uri: `at://${did}/${body.collection}/${body.rkey}`, cid, value: body.record };
        throw new TypeError('Failed to fetch');
      }
      if (endpoint === 'com.atproto.repo.getRecord') return committed ? json(committed) : json({ error: 'RecordNotFound' }, 400);
      return undefined;
    };
    const attempt = client.createPublishAttempt('One post only');
    await expect(client.publish(attempt.text, undefined, attempt)).rejects.toBeInstanceOf(PublicationUncertainError);
    expect(attempt.dispatched).toBe(true);
    const restoredAttempt = JSON.parse(JSON.stringify(attempt));
    const post = await client.publish(attempt.text, undefined, restoredAttempt);
    expect(post.uri).toBe(`at://${did}/app.bsky.feed.post/${attempt.rkey}`);
    expect(post.text).toBe(attempt.text);
    expect(calls.filter(endpoint => endpoint === 'com.atproto.repo.createRecord')).toHaveLength(1);
    expect(calls.filter(endpoint => endpoint === 'com.atproto.repo.getRecord')).toHaveLength(1);
    await client.logout();
  });

  test('custom label definitions apply subscribed hide rules', async () => {
    const author = { did: 'did:plc:abcdefghijklmnopqrstuvwx', handle: 'other.bsky.social' };
    override = async endpoint => {
      if (endpoint === 'app.bsky.actor.getPreferences') return json({ preferences: [
        { $type: 'app.bsky.actor.defs#contentLabelPref', label: 'custom-review', labelerDid: labeler, visibility: 'hide' },
      ] });
      if (endpoint === 'app.bsky.labeler.getServices') return json({ views: [{
        $type: 'app.bsky.labeler.defs#labelerViewDetailed', uri: `at://${labeler}/app.bsky.labeler.service/self`, cid,
        creator: { did: labeler, handle: 'moderation.bsky.app' }, indexedAt: '2026-10-15T12:00:00Z',
        policies: { labelValues: ['custom-review'], labelValueDefinitions: [{ identifier: 'custom-review', severity: 'alert', blurs: 'content', defaultSetting: 'hide', locales: [] }] },
      }] });
      if (endpoint === 'app.bsky.feed.getFeed') return json({ feed: [{ post: {
        uri: `at://${author.did}/app.bsky.feed.post/test`, cid, author, indexedAt: '2026-10-15T12:00:00Z',
        record: { $type: 'app.bsky.feed.post', text: 'Moderated', createdAt: '2026-10-15T12:00:00Z' },
        labels: [{ src: labeler, uri: `at://${author.did}/app.bsky.feed.post/test`, val: 'custom-review', cts: '2026-10-15T12:00:00Z' }],
      } }] });
      return undefined;
    };
    const client = new BlueskyClient();
    await client.login('me.bsky.social', 'fake');
    const feed = await client.publicFeed();
    expect(feed.items[0].moderation.hidden).toBe(true);
    expect(feed.items[0].moderation.warning).not.toBe('Label definitions unavailable');
    await client.logout();
  });
  test('a response after logout cannot commit account data or publication UI', async () => {
    const client = new BlueskyClient();
    await client.login('me.bsky.social', 'fake');
    const started = deferred<void>(); const release = deferred<void>();
    override = async (endpoint, request) => {
      if (endpoint === 'com.atproto.repo.createRecord') {
        const body = await request.json(); started.resolve(); await release.promise;
        return json({ uri: `at://${did}/app.bsky.feed.post/${body.rkey}`, cid });
      }
      return undefined;
    };
    const attempt = client.createPublishAttempt('Already dispatched');
    const pending = client.publish(attempt.text, undefined, attempt);
    const rejected = expect(pending).rejects.toThrow(/active account changed/);
    await started.promise; await client.logout(); release.resolve(); await rejected;
    expect(client.session).toBeNull();
    expect(attempt.confirmed?.text).toBe('Already dispatched');
  });

  test('explicit retry after authoritative absence reuses its original record key', async () => {
    const client = new BlueskyClient();
    await client.login('me.bsky.social', 'fake');
    const keys: string[] = [];
    override = async (endpoint, request) => {
      if (endpoint === 'com.atproto.repo.getRecord') return json({ error: 'RecordNotFound' }, 400);
      if (endpoint === 'com.atproto.repo.createRecord') {
        const body = await request.json(); keys.push(body.rkey);
        if (keys.length === 1) throw new TypeError('Failed to fetch');
        return json({ uri: `at://${did}/app.bsky.feed.post/${body.rkey}`, cid });
      }
      return undefined;
    };
    const attempt = client.createPublishAttempt('Retry same identity');
    await expect(client.publish(attempt.text, undefined, attempt)).rejects.toBeInstanceOf(PublicationUncertainError);
    await client.publish(attempt.text, undefined, attempt);
    expect(keys).toEqual([attempt.rkey, attempt.rkey]);
    await client.logout();
  });

  test('standalone profile and follow notification enforce account labels', async () => {
    const client = new BlueskyClient();
    await client.login('me.bsky.social', 'fake');
    const other = 'did:plc:abcdefghijklmnopqrstuvwx';
    const author = { did: other, handle: 'other.bsky.social', displayName: 'Hidden name',
      avatar: 'https://example.invalid/avatar.png', banner: 'https://example.invalid/banner.png',
      labels: [{ src: labeler, uri: other, val: '!hide', cts: '2026-10-15T12:00:00Z' }] };
    override = async endpoint => {
      if (endpoint === 'app.bsky.actor.getProfile') return json(author);
      if (endpoint === 'app.bsky.notification.listNotifications') return json({ notifications: [{
        uri: `at://${other}/app.bsky.graph.follow/test`, cid, author, reason: 'follow',
        record: { $type: 'app.bsky.graph.follow', subject: did, createdAt: '2026-10-15T12:00:00Z' },
        isRead: false, indexedAt: '2026-10-15T12:00:00Z',
      }] });
      return undefined;
    };
    const profile = await client.profile(other);
    expect(profile.moderation?.noOverride).toBe(true);
    expect(profile.avatar).toBeUndefined();
    expect(profile.banner).toBeUndefined();
    expect((await client.notifications()).items).toEqual([]);
    await client.logout();
  });

  test('the transport deadline covers a stalled JSON body after headers', async () => {
    const client = new BlueskyClient();
    const bodyAborted = deferred<void>();
    let timerCleared = false;
    let fireDeadline: (() => void) | undefined;
    const originalTimeout = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    // Capture just the production request deadline. Fire it deterministically only
    // after fetch has delivered headers and the response body is being consumed.
    globalThis.setTimeout = ((callback: () => void, delay?: number, ...args: unknown[]) => {
      if (delay === 20_000) {
        fireDeadline = callback;
        deadlineTimer = originalTimeout(() => {}, 20_000);
        return deadlineTimer;
      }
      return originalTimeout(callback, delay, ...args);
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
      if (timer === deadlineTimer) timerCleared = true;
      originalClear(timer);
    }) as typeof clearTimeout;
    const bodyStarted = deferred<void>();
    override = async (endpoint, request) => {
      if (endpoint !== 'app.bsky.feed.getFeed') return undefined;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"feed":'));
          request.signal.addEventListener('abort', () => {
            controller.error(request.signal.reason);
            bodyAborted.resolve();
          }, { once: true });
        },
        pull() { bodyStarted.resolve(); },
      }), { headers: { 'content-type': 'application/json' } });
    };
    try {
      const pending = client.publicFeed();
      const rejected = expect(pending).rejects.toThrow();
      await bodyStarted.promise;
      // One turn lets timedFetch receive headers; the pre-fix implementation
      // clears its deadline here even though neither JSON parsing nor IO finished.
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(timerCleared).toBe(false);
      expect(fireDeadline).toBeDefined();
      fireDeadline!();
      await bodyAborted.promise;
      await rejected;
      expect(timerCleared).toBe(true);
    } finally {
      fireDeadline?.();
      if (deadlineTimer) originalClear(deadlineTimer);
      globalThis.setTimeout = originalTimeout;
      globalThis.clearTimeout = originalClear;
    }
  });

  test('complete streamed JSON and XRPC error status survive body deadline buffering', async () => {
    const client = new BlueskyClient();
    const streamed = (parts: string[], status: number) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    }), { status, headers: { 'content-type': 'application/json', 'x-test-response': 'preserved' } });
    override = async endpoint => endpoint === 'app.bsky.feed.getFeed'
      ? streamed(['{"feed":', '[],"cursor":"next"}'], 200) : undefined;
    expect(await client.publicFeed()).toEqual({ items: [], cursor: 'next' });
    override = async endpoint => endpoint === 'app.bsky.feed.getFeed'
      ? streamed(['{"error":"RateLimitExceeded",', '"message":"Wait for rate limit"}'], 429) : undefined;
    await expect(client.publicFeed()).rejects.toMatchObject({ status: 429, error: 'RateLimitExceeded', message: 'Wait for rate limit' });
  });

});
