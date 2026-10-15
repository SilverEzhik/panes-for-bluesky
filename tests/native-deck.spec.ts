import { expect, test } from "@playwright/test";
import {
  advancePanelSpring,
  anchorForPanelOffset,
  layoutPanelDeck,
  nativeRound,
  nearestPanelSnap,
  panelSnapOffsets,
  projectPanelOffset,
  resolvePanelAnchor,
} from "../src/lib/panelPhysics";
import { nativeDeckOracle as native } from "./native-deck-oracle";
import { mockBluesky } from "./fixtures";

test("native ordered snap oracle and historical alignment suppression", () => {
  expect(panelSnapOffsets(native.portraitOne)).toEqual(
    native.portraitOne.snaps,
  );
  expect(panelSnapOffsets(native.portraitTwo)).toEqual(
    native.portraitTwo.snaps,
  );
  expect(panelSnapOffsets(native.portraitTwo, 476)).toEqual(
    native.portraitTwo.atRightAnchor,
  );
  expect(panelSnapOffsets(native.portraitTwo, 696)).toEqual(
    native.portraitTwo.atLeftAnchor,
  );
  expect(panelSnapOffsets(native.wideTie)).toEqual(native.wideTie.snaps);
  expect(nearestPanelSnap(native.wideTie.proposed, native.wideTie, 220)).toBe(
    native.wideTie.winner,
  );
  expect(
    nearestPanelSnap(native.wideTie.proposed, native.wideTie, 220, true),
  ).toBe(native.wideTie.winner);
  expect(nearestPanelSnap(219, native.portraitTwo, 220, true)).toBe(0);
});
test("native cumulative geometry and hidden cutoff oracle", () => {
  for (const [offset, expected] of [
    [952, native.layoutAt952],
    [1172, native.layoutAt1172],
  ] as const) {
    const layout = layoutPanelDeck(offset, native.portraitTwo);
    expect(layout.positions.map((x) => x + layout.sidebarWidth)).toEqual(
      expected.detailX,
    );
    expect(layout.hidden).toEqual(expected.hidden);
    expect(layout.timelineHidden).toBe(expected.timelineHidden);
  }
  const deep = {
    viewportWidth: 768,
    feedWidth: 476,
    widths: Array.from({ length: 100 }, () => 476),
  };
  const layout = layoutPanelDeck(696 + 476 * 98, deep);
  expect(layout.hidden.filter(Boolean)).toHaveLength(98);
  expect(layout.positions[99]).toBe(476);
});
test("native working spring oracle, release projection, roundf sign", () => {
  let position = 0,
    velocity = 0;
  for (const [x, v] of native.spring) {
    ({ position, velocity } = advancePanelSpring(position, velocity, 100));
    expect(position).toBeCloseTo(x, 8);
    expect(velocity).toBeCloseTo(v, 8);
  }
  expect(projectPanelOffset(220, 1)).toBe(276);
  expect(nativeRound(-1.5)).toBe(-2);
  expect(nativeRound(1.5)).toBe(2);
});
test("resize preserves logical right versus left alignment", () => {
  const right = anchorForPanelOffset(476, native.portraitTwo),
    left = anchorForPanelOffset(696, native.portraitTwo);
  expect(
    resolvePanelAnchor(right, { ...native.portraitTwo, viewportWidth: 1024 }),
  ).toBe(220);
  expect(
    resolvePanelAnchor(left, { ...native.portraitTwo, viewportWidth: 1024 }),
  ).toBe(696);
});
test("historical deck anchor survives viewport resize and expands through native zero", async ({
  page,
}) => {
  await mockBluesky(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".feed-scroll .post-card").first().click();
  const panel = page.locator(".stack-panel");
  await panel
    .getByRole("button", { name: "View Panel Tester's profile", exact: true })
    .first()
    .click();
  await expect(panel).toHaveCount(2);
  await panel.last().focus();
  await page.keyboard.press("Alt+ArrowLeft");
  const deck = page.locator(".panel-stack");
  const anchor = Number(await deck.getAttribute("data-native-offset"));
  await page.setViewportSize({ width: 1023, height: 768 });
  await expect(deck).toHaveAttribute("data-native-offset", String(anchor));
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(deck).toHaveAttribute("data-native-offset", "0");
  await expect(page.locator(".sidebar")).toHaveCSS("width", "292px");
});

test("small-screen baseline exposes a full readable timeline and retains both navigation anchors", () => {
  const phone = {
    viewportWidth: 390,
    feedWidth: 330,
    widths: [],
    sidebarWidth: 292,
    railWidth: 60,
    compactRoot: true,
  };
  expect(panelSnapOffsets(phone)).toEqual([0, 232]);
  expect(resolvePanelAnchor({ kind: "compact" }, phone)).toBe(232);
  const compact = layoutPanelDeck(232, phone);
  expect(compact.sidebarWidth).toBe(60);
  expect(compact.timelineWidth).toBe(330);
  expect(compact.timelineOffset).toBe(0);
  expect(layoutPanelDeck(0, phone).sidebarWidth).toBe(292);
  expect(
    panelSnapOffsets({ ...phone, viewportWidth: 768, compactRoot: false }),
  ).toEqual([0]);
});

test("phone initial navigation is compact without details and resize preserves expanded context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockBluesky(page);
  await page.goto("/");
  const deck = page.locator(".panel-stack");
  await expect(deck).toHaveAttribute("data-native-offset", "232");
  await expect(page.locator(".sidebar")).toHaveCSS("width", "60px");
  await expect(page.locator(".timeline")).toHaveCSS("width", "330px");
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await expect(deck).toHaveAttribute("data-native-offset", "0");
  await page.setViewportSize({ width: 400, height: 844 });
  await expect(deck).toHaveAttribute("data-native-offset", "0");
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  await expect(deck).toHaveAttribute("data-native-offset", "232");
});

test("a buttonless mouse move cancels a missed outside release before sampling its coordinates", async ({
  page,
}) => {
  await mockBluesky(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".feed-scroll .post-card").first().click();
  const panel = page.locator(".stack-panel");
  await panel
    .getByRole("button", { name: "View Panel Tester's profile", exact: true })
    .first()
    .click();
  const deck = page.locator(".panel-stack");
  await expect(deck).toHaveAttribute("data-native-offset", "696");
  await deck.evaluate((element) =>
    document.addEventListener(
      "pointerdown",
      (event) => {
        (element as HTMLElement).dataset.testPointerId = String(
          event.pointerId,
        );
      },
      { capture: true, once: true },
    ),
  );
  await page.mouse.move(600, 22);
  await page.mouse.down();
  await page.mouse.move(620, 22);
  await page.mouse.move(650, 22);
  await page.mouse.move(950, 22);
  await expect(deck).toHaveAttribute("data-native-offset", "366");
  await deck.evaluate((element) =>
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: Number((element as HTMLElement).dataset.testPointerId),
        pointerType: "mouse",
        isPrimary: true,
        buttons: 0,
        clientX: 0,
        clientY: -86,
      }),
    ),
  );
  await expect(deck).toHaveAttribute("data-native-offset", "220");
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await page.mouse.up();
  await page.mouse.move(800, 22);
  await expect(deck).toHaveAttribute("data-native-offset", "220");
  await expect(panel).toHaveCount(2);
});

test('Tab reveals a right-side sheet through its native anchor without scrolling ancestors', async ({ page }) => {
  await mockBluesky(page);
  await page.goto('/');
  await page.locator('.feed-scroll .post-text').first().click();
  const deck = page.locator('.panel-stack');
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await page.locator('.stack-panel').last().getByRole('button', { name: "View Panel Tester's profile", exact: true }).first().click();
  await expect(page.locator('.stack-panel')).toHaveCount(2);
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await page.locator('.stack-panel').last().focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(deck).not.toHaveClass(/panel-stack--moving/);
  await expect(deck).toBeFocused();
  const closeProfile = page.getByRole('button', { name: 'Close Profile', exact: true });
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press('Tab');
    await expect(deck).not.toHaveClass(/panel-stack--moving/);
    const active = await page.evaluate(() => {
      const element = document.activeElement!;
      const bounds = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label'), visible: bounds.width > 0 && bounds.x >= 0 && bounds.right <= innerWidth };
    });
    expect(active.visible).toBe(true);
    if (active.label === 'Close Profile') break;
  }
  await expect(closeProfile).toBeFocused();
  await expect(deck).toHaveAttribute('data-native-offset', '696');
  expect(await page.evaluate(() => ['html', 'body', '.app-shell', '.workspace', '.panel-stack'].map(selector => {
    const element = document.querySelector(selector)!;
    return [element.scrollLeft, element.scrollTop];
  }))).toEqual([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
});
