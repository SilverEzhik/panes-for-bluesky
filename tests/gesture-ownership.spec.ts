import { expect, test, type Page } from '@playwright/test';
import { mockBluesky, post } from './fixtures';
import { openTestFeed } from './viewer-fixtures';

const photo = (page: Page) => page.locator('.media-panel__viewport');
const deck = (page: Page) => page.locator('.panel-stack');
const offset = async (page: Page) => Number(await deck(page).getAttribute('data-native-offset'));

async function setup(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const control = await mockBluesky(page);
  await page.route('https://ownership-photo.example.test/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#267ca7"/></svg>',
  }));
  control.respond('app.bsky.feed.getFeed', () => ({ body: { feed: [{ post: {
    ...post(), embed: { $type: 'app.bsky.embed.images#view', images: [1, 2, 3].map(index => ({
      thumb: `https://ownership-photo.example.test/${index}.svg`,
      fullsize: `https://ownership-photo.example.test/${index}.svg`, alt: `Ownership photo ${index}`,
    })) },
  } }] } }));
  await openTestFeed(page, control);
  await page.getByRole('link', { name: 'Ownership photo 1', exact: true }).click();
  await expect(photo(page)).toBeInViewport();
  await expect(page.locator('.feed-results')).toBeInViewport();
  await expect(deck(page)).not.toHaveClass(/panel-stack--moving/);
  await expect.poll(() => photo(page).locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1600);
}

// Keep time explicit: a slow/headless frame must not turn these samples into
// separate physical gestures. Rendering assertions still wait for real DOM commits.
async function burst(page: Page, samples: { target: 'source' | 'photo'; x: number; y?: number; ctrl?: boolean }[]) {
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const read = () => page.evaluate(() => {
    const stack = document.querySelector<HTMLElement>('.panel-stack')!;
    const image = document.querySelector<HTMLElement>('.media-panel__viewport')!;
    return { offset: Number(stack.dataset.nativeOffset), pan: Number(image.dataset.panX), zoom: Number(image.dataset.zoom),
      moving: stack.classList.contains('panel-stack--moving') };
  });
  const changed = (value: Awaited<ReturnType<typeof read>>) => JSON.stringify([value.offset, value.pan, value.zoom]);
  const result: Awaited<ReturnType<typeof read>>[] = [];
  let previous = changed(await read());
  for (const sample of samples) {
    await page.evaluate(value => {
      const target = document.querySelector<HTMLElement>(value.target === 'photo' ? '.media-panel__viewport' : '.stack-panel__header')!;
      const box = target.getBoundingClientRect();
      const clientX = Math.max(1, Math.min(innerWidth - 1, box.left + box.width / 2)), clientY = box.top + box.height / 2;
      target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX, clientY }));
      target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: value.x, deltaY: value.y ?? 0,
        ctrlKey: value.ctrl ?? false, clientX, clientY }));
    }, sample);
    await page.clock.runFor(32);
    await expect.poll(async () => changed(await read())).not.toBe(previous);
    const state = await read(); result.push(state); previous = changed(state);
  }
  await page.clock.resume();
  return result;
}

test('a deck wheel burst continues over photos and reverses without a premature snap or gallery navigation', async ({ page }) => {
  await setup(page);
  const before = await offset(page);
  const samples = await burst(page, [
    { target: 'source', x: -35 }, { target: 'photo', x: -35 },
    { target: 'photo', x: -35 }, { target: 'photo', x: 35 },
    { target: 'source', x: 35 },
  ]);
  expect(samples[0].offset).toBeLessThan(before - 10);
  expect(samples[1].offset).toBeLessThan(samples[0].offset - 10);
  expect(samples[2].offset).toBeLessThan(samples[1].offset - 10);
  expect(samples[3].offset).toBeGreaterThan(samples[2].offset + 10);
  expect(samples[4].offset).toBeGreaterThan(samples[3].offset + 10);
  for (const sample of samples) {
    expect(sample.moving).toBe(true);
    expect(sample.zoom).toBe(1);
    expect(sample.pan).toBe(0);
  }
  for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i].offset - samples[i - 1].offset)).toBeLessThan(60);
  await expect(deck(page)).not.toHaveClass(/panel-stack--moving/);
  await expect(page.getByRole('region', { name: 'Image viewer' }).getByRole('status')).toHaveText('1 of 3');
});

test('a zoomed-photo wheel burst keeps panning the photo after crossing to the source pane', async ({ page }) => {
  await setup(page);
  await photo(page).dblclick();
  await expect(photo(page)).toHaveAttribute('data-zoom', '2.500');
  const before = await offset(page);
  const samples = await burst(page, [
    { target: 'photo', x: 35 }, { target: 'source', x: 35 },
    { target: 'source', x: -35 }, { target: 'photo', x: -35 },
  ]);
  expect(samples[1].pan).toBeLessThan(samples[0].pan - 10);
  expect(samples[2].pan).toBeGreaterThan(samples[1].pan + 10);
  for (const sample of samples) { expect(sample.offset).toBe(before); expect(sample.zoom).toBe(2.5); }
  await expect(page.getByRole('region', { name: 'Image viewer' }).getByRole('status')).toHaveText('1 of 3');
});

test('switching from Ctrl-wheel to plain wheel gives the new burst to its starting pane', async ({ page }) => {
  await setup(page);
  await photo(page).dblclick();
  await expect(photo(page)).toHaveAttribute('data-zoom', '2.500');
  const before = await offset(page);
  const samples = await burst(page, [
    { target: 'photo', x: 0, y: 10, ctrl: true },
    { target: 'source', x: -35 }, { target: 'photo', x: -35 },
  ]);
  expect(samples[0].zoom).toBeGreaterThan(1);
  expect(samples[0].offset).toBe(before);
  expect(samples[1].offset).toBeLessThan(before - 10);
  expect(samples[2].offset).toBeLessThan(samples[1].offset - 10);
  expect(samples[2].zoom).toBe(samples[0].zoom);
  expect(samples[2].pan).toBe(samples[0].pan);
  await expect(deck(page)).not.toHaveClass(/panel-stack--moving/);
});

test('a mouse drag started on the source header keeps moving the deck across a photo', async ({ page }) => {
  await setup(page);
  const source = (await page.locator('.stack-panel__header').first().boundingBox())!;
  const image = (await photo(page).boundingBox())!;
  const start = { x: source.x + Math.min(80, source.width / 2), y: source.y + source.height / 2 };
  const end = { x: Math.min(1240, image.x + image.width / 2), y: image.y + 35 };
  const before = await offset(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  expect(await offset(page)).toBeLessThan(before - 30);
  await expect(deck(page)).toHaveClass(/panel-stack--moving/);
  await expect(photo(page)).toHaveAttribute('data-zoom', '1.000');
  await expect(photo(page)).toHaveAttribute('data-pan-x', '0.0');
  await page.mouse.up();
  await expect(deck(page)).not.toHaveClass(/panel-stack--moving/);
  await expect(page.getByRole('region', { name: 'Image viewer' }).getByRole('status')).toHaveText('1 of 3');
});
