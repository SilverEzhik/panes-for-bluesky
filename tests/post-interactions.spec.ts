import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockBluesky, me, post as fixturePost } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

async function load(page: Page) {
  const control = await mockBluesky(page);
  await openTestFeed(page, control);
  await expect(page.locator('.feed-results .post-card')).toHaveCount(30);
}

async function pinch(post: Locator) {
  await post.evaluate(element => {
    const target = element.querySelector('.post-text')!;
    const emit = (type: string, id: number, x: number) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id,
      isPrimary: id === 1, clientX: x, clientY: 120,
    }));
    emit('pointerdown', 1, 100); emit('pointerdown', 2, 180);
    emit('pointermove', 1, 50); emit('pointermove', 2, 230);
    emit('pointerup', 1, 50); emit('pointerup', 2, 230);
  });
}

test('post conversation has a separate keyboard button without nesting its controls', async ({ page }) => {
  await load(page);
  const post = page.locator('.feed-results .post-card').first();
  await expect(post).not.toHaveAttribute('role', 'button');
  expect(await post.getAttribute('tabindex')).toBeNull();
  const opener = post.getByRole('button', { name: 'Open post by Panel Tester', exact: true });
  expect(await opener.locator('a,button,input,video').count()).toBe(0);
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stack-panel')).toHaveCount(2);
});

test('synthetic touch ownership rejects excluded controls, outside third contacts and late second fingers', async ({ page }) => {
  await load(page);
  const post = page.locator('.feed-results .post-card').first();
  const results = await post.evaluate(element => {
    const text = element.querySelector('.post-text')!;
    const button = element.querySelector('button')!;
    const outside = document.querySelector('.sidebar')!;
    type Point = { identifier: number; target: Element; clientX: number; clientY: number };
    // Synthetic TouchEvent-shaped events exercise ownership state on every engine;
    // they deliberately make no claim about native scrolling or zoom behavior.
    const send = (type: string, target: Element, points: Point[], cancelable = true) => {
      const event = new Event(type, { bubbles: true, cancelable });
      Object.defineProperty(event, 'touches', { value: points });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const a = { identifier: 1, target: text, clientX: 100, clientY: 120 };
    const b = { identifier: 2, target: text, clientX: 180, clientY: 120 };
    const results: boolean[] = [];
    for (const controlFirst of [true, false]) {
      const first = { ...a, target: controlFirst ? button : text };
      const second = { ...b, target: controlFirst ? text : button };
      send('touchstart', first.target, [first]);
      results.push(send('touchstart', second.target, [first, second]));
      send('touchmove', second.target, [{ ...first, clientY: 190 }, { ...second, clientY: 190 }]);
      send('touchend', first.target, []);
    }
    send('touchstart', text, [a, b]);
    const third = { ...a, identifier: 3, target: outside };
    results.push(send('touchstart', outside, [a, b, third]));
    send('touchmove', text, [{ ...a, clientX: 40 }, { ...b, clientX: 240 }, third]);
    send('touchend', text, []);
    send('touchstart', text, [a]);
    send('touchmove', text, [{ ...a, clientY: 150 }]);
    results.push(send('touchstart', text, [{ ...a, clientY: 150 }, b]));
    send('touchmove', text, [{ ...a, clientY: 230 }, { ...b, clientY: 230 }], false);
    send('touchend', text, []);
    return results;
  });
  expect(results).toEqual([false, false, false, false]);
  await expect(page.locator('.stack-panel')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pinch(post);
  await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
});

test('an owned Safari-shaped gesture follows its popup and releases at gestureend', async ({ page }) => {
  // Simulate desktop Safari capability detection; mobile tests keep native detection.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'GestureEvent', { configurable: true, value: class extends Event {} });
    let target: object | null = window;
    while (target) {
      if (Object.hasOwn(target, 'ontouchstart')) Reflect.deleteProperty(target, 'ontouchstart');
      target = Object.getPrototypeOf(target);
    }
  });
  await load(page);
  const text = page.locator('.feed-results .post-card .post-text').first();
  await text.evaluate(element => {
    for (const [type, scale] of [['gesturestart', 1], ['gesturechange', 1.4]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'scale', { value: scale });
      element.dispatchEvent(event);
    }
  });
  await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
  const prevented = await page.locator('.post-peek-backdrop').evaluate(element => {
    const emit = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'scale', { value: 1.8 });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return [emit('gesturechange'), emit('gestureend'), emit('gesturechange')];
  });
  expect(prevented).toEqual([true, true, false]);
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('Ctrl-wheel ownership releases when an ordinary wheel starts', async ({ page }) => {
  await load(page);
  await page.locator('.feed-results .post-card .post-text').first().evaluate(element => {
    element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -60 }));
  });
  await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
  expect(await page.locator('.post-peek-backdrop').evaluate(element => {
    const emit = (ctrlKey: boolean) => !element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey, deltaY: -20,
    }));
    return [emit(true), emit(false), emit(true)];
  })).toEqual([true, false, false]);
});

test('fresh native tap works immediately after a pinch; its compatibility click stays suppressed', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  try {
    await load(page);
    const post = page.locator('.feed-results .post-card').first();
    await pinch(post);
    await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toHaveCount(0);
    await post.locator('.post-text').dispatchEvent('click', { detail: 1 });
    await expect(page.locator('.stack-panel')).toHaveCount(1);
    // No timeout: a new native press distinguishes this from the completed gesture.
    await post.locator('.post-text').tap();
    await expect(page.locator('.stack-panel')).toHaveCount(2);
  } finally { await context.close(); }
});

test('pointer cancellation and blur discard gesture recognition', async ({ page }) => {
  await load(page);
  const post = page.locator('.feed-results .post-card').first();
  await post.evaluate(element => {
    const target = element.querySelector('.post-text')!;
    const emit = (type: string, id: number, x: number) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id, isPrimary: id === 1, clientX: x, clientY: 100,
    }));
    emit('pointerdown', 1, 100); emit('pointerdown', 2, 180);
    emit('pointercancel', 1, 100); emit('pointermove', 2, 250); emit('pointerup', 2, 250);
    emit('pointerdown', 1, 100); emit('pointerdown', 2, 180);
    window.dispatchEvent(new Event('blur'));
    emit('pointermove', 1, 40); emit('pointermove', 2, 240);
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pinch(post);
  await expect(page.getByRole('dialog', { name: 'Post actions for Panel Tester' })).toBeVisible();
});

test('protected detail media is mounted only after disclosure and removed on collapse', async ({ page }) => {
  const control = await mockBluesky(page);
  const protectedPost = {
    ...fixturePost(0),
    labels: [{ src: 'did:plc:ar7c4by46qjdydhdevvrndac', uri: fixturePost(0).uri, val: 'graphic-media', cts: '2026-10-15T12:00:00Z' }],
    embed: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 'https://media.example.test/protected.svg', fullsize: 'https://media.example.test/full.svg', alt: 'Protected test photo' }] },
  };
  let mediaRequests = 0;
  await page.route('https://media.example.test/**', async route => {
    mediaRequests++;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>' });
  });
  await page.route('**/xrpc/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/xrpc/')[1];
    if (endpoint === 'app.bsky.feed.getFeed' || endpoint === 'app.bsky.feed.getTimeline') return route.fulfill({ json: { feed: [{ post: protectedPost }] } });
    if (endpoint === 'app.bsky.actor.getPreferences') return route.fulfill({ json: { preferences: [
      { $type: 'app.bsky.actor.defs#adultContentPref', enabled: true },
      { $type: 'app.bsky.actor.defs#contentLabelPref', label: 'graphic-media', visibility: 'warn' },
    ] } });
    if (endpoint === 'app.bsky.feed.getPostThread') return route.fulfill({ json: { thread: { $type: 'app.bsky.feed.defs#threadViewPost', post: protectedPost, replies: [] } } });
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }).click();
  const login = page.getByRole('dialog', { name: 'Sign in to Bluesky' });
  await login.getByLabel('Handle or email').fill(me.handle);
  await login.getByLabel('App password', { exact: true }).fill('test-app-password');
  await login.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(login).toHaveCount(0);
  await openTestFeed(page, control);
  await page.locator('.feed-results .post-conversation-opener').first().click();
  const panel = page.locator('.stack-panel').last();
  const warning = panel.locator('details.content-warning').first();
  await expect(warning).toBeVisible();
  await expect(panel.locator('.post-images img')).toHaveCount(0);
  expect(mediaRequests).toBe(0);
  await warning.locator('summary').click();
  await expect(panel.getByAltText('Protected test photo')).toBeVisible();
  await expect.poll(() => mediaRequests).toBe(1);
  await warning.locator('summary').click();
  await expect(panel.locator('.post-images img')).toHaveCount(0);
});
