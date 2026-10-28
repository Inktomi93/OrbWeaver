import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { TabsFocusRevealStory } from "./_focus-reveal-stories.tsx";

const STORY = "tests/ui/primitives/tabs/_focus-reveal-stories/TabsFocusRevealStory";

async function expectRevealed(tab: Locator, clip: Locator): Promise<void> {
  await expect(tab).toBeFocused();
  const paint = await tab.evaluate((node) => ({
    visible: node.matches(":focus-visible"),
    halo: Math.max(
      0,
      ...getComputedStyle(node)
        .boxShadow.split(/,(?![^(]*\))/u)
        .map((layer) => {
          if (layer.includes("inset")) {
            return 0;
          }
          return Number.parseFloat(layer.match(/-?(?:\d*\.)?\d+px/gu)?.at(-1) ?? "0");
        }),
    ),
  }));
  expect(paint.visible).toBe(true);
  expect(paint.halo).toBeGreaterThan(0);
  await expectInlineContained(tab, clip, paint.halo);
}

async function expectInlineContained(tab: Locator, clip: Locator, halo = 0): Promise<void> {
  await expect(tab).toBeFocused();
  await expect
    .poll(async () => {
      const [tabBox, clipBox] = await Promise.all([tab.boundingBox(), clip.boundingBox()]);
      if (tabBox === null || clipBox === null) {
        throw new Error("The focused tab and actual clipping ancestor must render");
      }
      return Math.max(clipBox.x - tabBox.x + halo, tabBox.x + tabBox.width + halo - clipBox.x - clipBox.width);
    })
    .toBeLessThanOrEqual(1);
}

for (const coarse of [false, true]) {
  test.describe(coarse ? "coarse horizontal" : "fine horizontal", () => {
    test.use({ viewport: { width: 960, height: 900 }, hasTouch: coarse, isMobile: coarse });
    test("Home, End and arrows reveal the whole focused tab in the nearest clip without moving the workspace", async ({ mount, page }) => {
      await mount<typeof TabsFocusRevealStory>(STORY, { width: 300 });
      const workspace = page.getByRole("region", { name: "Scrolling workspace", exact: true });
      const clip = page.getByRole("region", { name: "Tab clip", exact: true });
      const first = page.getByRole("tab", { name: "Opening", exact: true });
      const next = page.getByRole("tab", { name: "Working notes", exact: true });
      const last = page.getByRole("tab", { name: "Final review", exact: true });
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight - window.innerHeight }));
      await first.focus();
      const verticalBefore = await workspace.evaluate((node) => node.scrollTop);
      const horizontalBefore = await workspace.evaluate((node) => node.scrollLeft);
      const pageBefore = await page.evaluate(() => window.scrollY);
      expect(verticalBefore).toBeGreaterThan(0);
      expect(pageBefore).toBeGreaterThan(0);
      expect(await clip.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
      await page.keyboard.press("End");
      await expectRevealed(last, clip);
      await expect(last).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("ArrowLeft");
      const disabled = page.getByRole("tab", { name: "Unavailable", exact: true });
      await expectRevealed(disabled, clip);
      await expect(disabled).toBeDisabled();
      await expect(disabled).toHaveAttribute("aria-selected", "false");
      await expect(last).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("ArrowLeft");
      await expectRevealed(next, clip);
      await page.keyboard.press("Home");
      await expectRevealed(first, clip);
      await page.keyboard.press("ArrowRight");
      await expectRevealed(next, clip);
      expect(await workspace.evaluate((node) => node.scrollTop)).toBe(verticalBefore);
      expect(await workspace.evaluate((node) => node.scrollLeft)).toBe(horizontalBefore);
      expect(await page.evaluate(() => window.scrollY)).toBe(pageBefore);
      await expect(page.getByRole("status", { name: "Final focus calls", exact: true })).toHaveText("1");
      await expect(page.getByRole("status", { name: "Final key calls", exact: true })).toHaveText("1");
      await expect(page.getByRole("tab", { name: "Unavailable", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Focus final through caller ref", exact: true }).click();
      await expectInlineContained(last, clip);
      expect(await last.evaluate((node) => node.matches(":focus-visible"))).toBe(false);
    });
  });
}

test.describe("manual activation", () => {
  test.use({ viewport: { width: 960, height: 900 }, hasTouch: false, isMobile: false });
  test("focus reveal leaves the selected panel and its reading scroll unchanged", async ({ mount, page }) => {
    await mount<typeof TabsFocusRevealStory>(STORY, { width: 300, manual: true });
    const first = page.getByRole("tab", { name: "Opening", exact: true });
    const last = page.getByRole("tab", { name: "Final review", exact: true });
    const panel = page.getByRole("tabpanel", { name: "Opening", exact: true });
    await first.focus();
    const before = await panel.evaluate((node) => {
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
      return node.scrollTop;
    });
    expect(before).toBeGreaterThan(0);
    await page.keyboard.press("End");
    await expectRevealed(last, page.getByRole("region", { name: "Tab clip", exact: true }));
    await expect(first).toHaveAttribute("aria-selected", "true");
    expect(await panel.evaluate((node) => node.scrollTop)).toBe(before);
  });
});

test.describe("caller focus cancellation", () => {
  test.use({ viewport: { width: 960, height: 900 }, hasTouch: false, isMobile: false });
  test("preventBaseUIHandler preserves caller ownership of focus without activating or revealing", async ({ mount, page }) => {
    await mount<typeof TabsFocusRevealStory>(STORY, { width: 300, cancelFocus: true });
    const clip = page.getByRole("region", { name: "Tab clip", exact: true });
    const before = await clip.evaluate((node) => node.scrollLeft);
    await page.getByRole("button", { name: "Focus final through caller ref", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Final review", exact: true })).toBeFocused();
    await expect(page.getByRole("tab", { name: "Opening", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("status", { name: "Final focus calls", exact: true })).toHaveText("1");
    expect(await clip.evaluate((node) => node.scrollLeft)).toBe(before);
  });
});

test.describe("physical RTL clip", () => {
  test.use({ viewport: { width: 960, height: 900 }, hasTouch: false, isMobile: false });
  test("Home and End reveal physical edges with native RTL scrollLeft", async ({ mount, page }) => {
    await mount<typeof TabsFocusRevealStory>(STORY, { width: 300, rtl: true });
    const first = page.getByRole("tab", { name: "Opening", exact: true });
    const last = page.getByRole("tab", { name: "Final review", exact: true });
    const clip = page.getByRole("region", { name: "Tab clip", exact: true });
    await first.focus();
    await page.keyboard.press("End");
    await expectRevealed(last, clip);
    expect(await clip.evaluate((node) => node.scrollLeft)).toBeLessThan(0);
    await page.keyboard.press("Home");
    await expectRevealed(first, clip);
  });
});

for (const vertical of [false, true]) {
  test.describe(vertical ? "vertical list" : "nonoverflow list", () => {
    test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });
    test("nonhorizontal-clipped focus keeps the clip's horizontal position", async ({ mount, page }) => {
      await mount<typeof TabsFocusRevealStory>(STORY, { width: 960, vertical });
      const clip = page.getByRole("region", { name: "Tab clip", exact: true });
      await page.getByRole("tab", { name: "Opening", exact: true }).focus();
      const before = await clip.evaluate((node) => node.scrollLeft);
      await page.keyboard.press("End");
      await expect(page.getByRole("tab", { name: "Final review", exact: true })).toBeFocused();
      expect(await clip.evaluate((node) => node.scrollLeft)).toBe(before);
    });
  });
}
