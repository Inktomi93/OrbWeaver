// VirtualList's own behaviour: the scope-reset handshake, the state-gated bottom fade and the unbounded-window tripwire.
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { EdgeFadeStory, ResetHandshakeStory, UnboundedStory } from "./_virtual-list-stories.tsx";

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
  await mount<typeof EdgeFadeStory>(`${STORIES}/EdgeFadeStory`, { count: 300, fadeEdge: true });
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
  await mount<typeof EdgeFadeStory>(`${STORIES}/EdgeFadeStory`, { count: 300, fadeEdge: false });
  await expect(page.locator(SCROLL)).toBeVisible();
  await expect(page.locator(SCROLL)).not.toHaveAttribute("data-more", /.*/);
});

test("no fade is held when every row already fits the window", async ({ mount, page }) => {
  await mount<typeof EdgeFadeStory>(`${STORIES}/EdgeFadeStory`, { count: 3, fadeEdge: true });
  await expect(page.locator(SCROLL).getByRole("listitem")).toHaveCount(3);
  await expect(page.locator(SCROLL)).not.toHaveAttribute("data-more", /.*/);
});

test("a list with no bounded height throws at mount", async ({ mount, page }) => {
  await mount<typeof UnboundedStory>(`${STORIES}/UnboundedStory`, { count: 1000 });
  await expect(page.locator('[data-slot="caught"]')).toBeVisible();
  await expect(page.locator(SCROLL)).toHaveCount(0);
});
