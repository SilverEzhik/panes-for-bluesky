import { expect, type Page } from '@playwright/test';
import { author, fixtureCid, type ApiControl } from './fixtures';

export async function openTestFeed(page: Page, control: ApiControl) {
  control.respond('app.bsky.unspecced.getPopularFeedGenerators', () => ({ body: { feeds: [{
    $type: 'app.bsky.feed.defs#generatorView', uri: `at://${author.did}/app.bsky.feed.generator/test`, cid: fixtureCid,
    did: 'did:web:feeds.example.test', creator: author, displayName: 'Test feed', indexedAt: '2026-10-15T12:00:00.000Z',
  }] } }));
  await page.goto('/');
  await page.getByRole('region', { name: 'Choose a Bluesky feed' }).getByRole('button', { name: /Test feed/ }).click();
  await expect(page.locator('.feed-results .post-card').first()).toBeVisible();
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
}
