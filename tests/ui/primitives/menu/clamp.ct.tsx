import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { MenuClampStory } from "./_clamp-stories.tsx";

interface Clamp {
  readonly maxHeight: number;
  readonly available: number;
  readonly chromeRow: number;
}

/** The popup's own max block size against the space Base UI left it and the chrome row token, all as resolved. */
function clampOf(popup: Locator): Promise<Clamp> {
  return popup.evaluate((element) => {
    const style = getComputedStyle(element);
    const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const chrome = style.getPropertyValue("--dimension-chrome-row").trim();
    return {
      maxHeight: Number.parseFloat(style.maxHeight),
      available: Number.parseFloat(style.getPropertyValue("--available-height")),
      chromeRow: chrome.endsWith("rem") ? Number.parseFloat(chrome) * rootFont : Number.parseFloat(chrome),
    };
  });
}

test("the default clamp runs to the viewport edge and belowChrome stops one chrome row short of it", async ({ mount, page }) => {
  await mount<typeof MenuClampStory>("tests/ui/primitives/menu/_clamp-stories/MenuClampStory");
  const popup = page.getByRole("menu");

  await page.getByRole("button", { name: "Viewport clamp", exact: true }).click();
  await expect(popup).toBeVisible();
  const plain = await clampOf(popup);
  expect(plain.chromeRow).toBeGreaterThan(0);
  expect(Math.abs(plain.maxHeight - plain.available)).toBeLessThan(1);
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();

  await page.getByRole("button", { name: "Below the chrome", exact: true }).click();
  await expect(popup).toBeVisible();
  const bounded = await clampOf(popup);
  expect(Math.abs(bounded.maxHeight - (bounded.available - bounded.chromeRow))).toBeLessThan(1);
});
