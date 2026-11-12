// VirtualList's own behaviour: the scope-reset handshake, the state-gated bottom fade, the growing window's floor and the
// unbounded-window tripwire.
import { resolvedLength } from "@orb/testkit/browser/spec";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { EdgeFadeStory, ResetHandshakeStory, ShortWindowStory, UnboundedStory } from "./_virtual-list-stories.tsx";
import { MANY_ROWS } from "./virtual-list-cases.ts";

const STORIES = "tests/ui/primitives/virtual-list/_virtual-list-stories";
const SCROLLED_PX = 1500;
const SCROLL = '[data-slot="virtual-list-scroll"]';

function scrollTopOf(page: Page): Promise<number> {
  return page.locator(SCROLL).evaluate((element) => element.scrollTop);
}

async function scrollTo(page: Page, top: number): Promise<void> {
  await page.locator(SCROLL).evaluate((element, target) => {
    element.scrollTop = target;
  }, top);
}

/** Two animation frames: long enough for a pending landing to have happened if it were going to. */
async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test("a changed scope key returns the list to the top, but only once its rows are ready", async ({ mount, page }) => {
  await mount<typeof ResetHandshakeStory>(`${STORIES}/ResetHandshakeStory`);
  await expect(page.locator(SCROLL)).toBeVisible();

  await scrollTo(page, SCROLLED_PX);
  await expect.poll(() => scrollTopOf(page)).toBe(SCROLLED_PX);

  // The new scope's key arrives while the previous scope's rows are still shown: the list must not jump yet.
  await page.getByRole("button", { name: "Switch scope, rows pending", exact: true }).click();
  await settleFrames(page);
  expect(await scrollTopOf(page)).toBe(SCROLLED_PX);

  await page.getByRole("button", { name: "Rows arrived", exact: true }).click();
  await expect.poll(() => scrollTopOf(page)).toBe(0);

  // A scope whose rows are ready at once resets without waiting.
  await scrollTo(page, SCROLLED_PX);
  await expect.poll(() => scrollTopOf(page)).toBe(SCROLLED_PX);
  await page.getByRole("button", { name: "Switch scope, rows ready", exact: true }).click();
  await expect.poll(() => scrollTopOf(page)).toBe(0);
});

test("the bottom fade is held while rows remain below the fold and lifts at the end", async ({ mount, page }) => {
  await mount<typeof EdgeFadeStory>(`${STORIES}/EdgeFadeStory`, { count: MANY_ROWS, fadeEdge: true });
  const scroller = page.locator(SCROLL);
  await expect(scroller).toHaveAttribute("data-more", "");
  const masked = await scroller.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.maskImage !== "none";
  });
  expect(masked).toBe(true);

  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(scroller).not.toHaveAttribute("data-more", /.*/);
  const maskedAtEnd = await scroller.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.maskImage !== "none";
  });
  expect(maskedAtEnd).toBe(false);

  await scrollTo(page, 0);
  await expect(scroller).toHaveAttribute("data-more", "");
});

test("no fade is held without the prop", async ({ mount, page }) => {
  await mount<typeof EdgeFadeStory>(`${STORIES}/EdgeFadeStory`, { count: MANY_ROWS, fadeEdge: false });
  await expect(page.locator(SCROLL)).toBeVisible();
  await expect(page.locator(SCROLL)).not.toHaveAttribute("data-more", /.*/);
});

test("no fade is held when the rows below the window are shorter than the fade itself", async ({ mount, page }) => {
  // Five 40px rows in a 190px window: 10px hidden, under the fade's 19px band.
  await mount<typeof EdgeFadeStory>(`${STORIES}/EdgeFadeStory`, { count: 5, fadeEdge: true, windowHeight: 190 });
  const scroller = page.locator(SCROLL);
  await expect(scroller.getByRole("listitem")).toHaveCount(5);
  expect(await scroller.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  await expect(scroller).not.toHaveAttribute("data-more", /.*/);
});

test("no fade is held when every row already fits the window", async ({ mount, page }) => {
  await mount<typeof EdgeFadeStory>(`${STORIES}/EdgeFadeStory`, { count: 3, fadeEdge: true });
  await expect(page.locator(SCROLL).getByRole("listitem")).toHaveCount(3);
  await expect(page.locator(SCROLL)).not.toHaveAttribute("data-more", /.*/);
});

test("a growing list under chrome taller than its parent keeps its floor of rows, and the parent scrolls to it", async ({ mount, page }) => {
  await mount<typeof ShortWindowStory>(`${STORIES}/ShortWindowStory`, { count: MANY_ROWS });
  const scroller = page.locator(SCROLL);
  const host = page.locator('[data-slot="short-host"]');
  const floor = await resolvedLength(page, `var(${TOKENS["height.scroll-sm"].cssVar})`, scroller);
  const box = await scroller.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(floor - 1);
  // The host scrolls the window into view; the list's own rows scroll inside it.
  expect(await host.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  const firstRow = scroller.getByRole("button", { name: "row-0", exact: true });
  await firstRow.focus();
  await expect(firstRow).toBeFocused();
  await expect(firstRow).toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(scroller.getByRole("button", { name: "row-1", exact: true })).toBeFocused();
});

test("a list with no bounded height throws the unbounded-window tripwire at mount", async ({ mount, page }) => {
  await mount<typeof UnboundedStory>(`${STORIES}/UnboundedStory`, { count: 1000 });
  const caught = page.locator('[data-slot="caught"]');
  await expect(caught).toHaveAttribute("data-tripwire", "true");
  await expect(caught).toHaveAttribute("data-seal", "VirtualList");
  await expect(page.locator(SCROLL)).toHaveCount(0);
});

test("a mount failure that is not the tripwire is told apart from it", async ({ mount, page }) => {
  await mount<typeof UnboundedStory>(`${STORIES}/UnboundedStory`, { count: 1000, unrelated: true });
  await expect(page.locator('[data-slot="caught"]')).toHaveAttribute("data-tripwire", "false");
  await expect(page.locator('[data-slot="caught"]')).not.toHaveAttribute("data-seal", /.*/);
});
