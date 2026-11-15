// @subject packages/ui/src/primitives/list-row/parts.tsx
// The subtitle yields to its reveal line on a fine pointer's hover and on keyboard focus, never on a tap: a tap sets
// `:hover` and `:focus-within` on a phone, where the swap was never meant to exist.
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { SubtitleSwapStory } from "./_subtitle-swap-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_subtitle-swap-stories/SubtitleSwapStory";
const FINE_VIEWPORT = { width: 1024, height: 740 } as const;
const FAR_CORNER = { x: FINE_VIEWPORT.width - 4, y: FINE_VIEWPORT.height - 4 } as const;
const ROW = { name: "Swap row", exact: true } as const;

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 740 } });

  test("a tap leaves the subtitle in place and the reveal line hidden, and keyboard focus still swaps them", async ({ mount, page }) => {
    expect(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["pointer-coarse"])).toBe(true);
    const component = await mount<typeof SubtitleSwapStory>(STORY);
    const subtitle = component.locator('[data-slot="list-row-subtitle"]');
    const reveal = component.locator('[data-slot="list-row-subtitle-reveal"]');
    const row = component.getByRole("button", ROW);
    await expect(subtitle).toHaveCSS("visibility", "visible");
    await expect(reveal).toHaveCSS("visibility", "hidden");

    await row.tap();
    await expect(row).toBeFocused();
    await expect(subtitle).toHaveCSS("visibility", "visible");
    await expect(reveal).toHaveCSS("visibility", "hidden");

    await row.blur();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();
    await expect(subtitle).toHaveCSS("visibility", "hidden");
    await expect(reveal).toHaveCSS("visibility", "visible");
  });
});

test.describe("fine pointer", () => {
  test.use({ viewport: FINE_VIEWPORT });

  test("hover swaps the subtitle for the reveal line and leaving swaps back", async ({ mount, page }) => {
    expect(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["pointer-fine"])).toBe(true);
    const component = await mount<typeof SubtitleSwapStory>(STORY);
    const subtitle = component.locator('[data-slot="list-row-subtitle"]');
    const reveal = component.locator('[data-slot="list-row-subtitle-reveal"]');
    await expect(subtitle).toHaveCSS("visibility", "visible");
    await expect(reveal).toHaveCSS("visibility", "hidden");

    await component.getByRole("button", ROW).hover();
    await expect(subtitle).toHaveCSS("visibility", "hidden");
    await expect(reveal).toHaveCSS("visibility", "visible");

    // The row sits in the top-left of the page; the far corner is clear of it.
    await page.mouse.move(FAR_CORNER.x, FAR_CORNER.y);
    await expect(subtitle).toHaveCSS("visibility", "visible");
    await expect(reveal).toHaveCSS("visibility", "hidden");
  });
});
