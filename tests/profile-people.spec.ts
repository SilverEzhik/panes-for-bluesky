import { expect, test, type Page } from '@playwright/test';
import { author, me, me2, mockBluesky } from './fixtures';

const sheets = (page: Page) => page.locator('.stack-panel');
async function signIn(page: Page) {
  await page.locator('.sidebar-footer').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to Bluesky' });
  await dialog.getByLabel('Handle or email').fill(me.handle);
  await dialog.getByLabel('App password', { exact: true }).fill('test-app-password');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function openProfile(page: Page) {
  await page.locator('.feed-scroll').getByRole('button', { name: "View Panel Tester's profile", exact: true }).first().click();
  await expect(sheets(page).last().locator('.classic-profile-fields')).toBeVisible();
  await expect(page.locator('.panel-stack')).not.toHaveClass(/panel-stack--moving/);
}

test('profile pagination cannot overwrite a successful follow completed during its request', async ({ page }) => {
  const control = await mockBluesky(page);
  control.paginated = true;
  await page.goto('/');
  await signIn(page);
  await expect(page.locator('.feed-scroll .post-card')).toHaveCount(30);
  await openProfile(page);
  const panel = sheets(page).last();
  const more = control.defer('app.bsky.feed.getAuthorFeed', request => request.query.get('cursor') === 'page-2');
  await panel.getByRole('button', { name: 'Load more posts', exact: true }).click();
  await more.started;
  // Follow resolves while the earlier feed request still holds an old profile.
  await panel.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
  more.release();
  await expect(panel.locator('.post-card')).toHaveCount(59);
  await expect(panel.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
  expect(control.requests.filter(request => request.endpoint === 'com.atproto.repo.createRecord' && request.body.collection === 'app.bsky.graph.follow')).toHaveLength(1);
  expect(control.violations).toEqual([]);
});

test('following and followers open paginated people sheets and profiles recursively', async ({ page }) => {
  const control = await mockBluesky(page);
  control.respond('app.bsky.graph.getFollowers', request => ({ body: request.query.get('cursor') ? { subject: author, followers: [me, me2] } : { subject: author, followers: [me], cursor: 'people-2' } }));
  control.respond('app.bsky.graph.getFollows', () => ({ body: { subject: me2, follows: [author] } }));
  await page.goto('/');
  await expect(page.locator('.feed-scroll .post-card')).toHaveCount(30);
  await openProfile(page);
  await sheets(page).last().locator('.classic-profile-people button').filter({ hasText: 'Followers' }).click();
  await expect(sheets(page)).toHaveCount(2);
  const people = sheets(page).last();
  await expect(people.locator('.classic-person')).toHaveCount(1);
  await people.getByRole('button', { name: 'Load more people', exact: true }).click();
  await expect(people.locator('.classic-person')).toHaveCount(2);
  await people.getByRole('button', { name: "View Second Tester's profile", exact: true }).click();
  await expect(sheets(page)).toHaveCount(3);
  await expect(sheets(page).last().getByRole('heading', { name: 'Second Tester', exact: true })).toBeVisible();
  await sheets(page).last().locator('.classic-profile-people button').filter({ hasText: 'Following' }).click();
  await expect(sheets(page)).toHaveCount(4);
  await expect(sheets(page).last().getByRole('button', { name: "View Panel Tester's profile", exact: true })).toBeVisible();
  expect(control.requests.filter(request => request.endpoint === 'app.bsky.graph.getFollowers').map(request => request.query.get('cursor'))).toEqual([null, 'people-2']);
  expect(control.violations).toEqual([]);
});
