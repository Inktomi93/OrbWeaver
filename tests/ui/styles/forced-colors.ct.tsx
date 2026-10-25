// Forced colors drops every box-shadow and replaces every background, so the arm in client/styles/platform.css gives
// the focus indicator and the tab indicator a system colour. The palette here is Chromium's own emulation.
import { expect, test } from "@playwright/test";
import type { ForcedColorsStory } from "./_forced-colors-stories.tsx";

const STORY = "tests/ui/styles/_forced-colors-stories/ForcedColorsStory";
const CLEAN_MEDIA = { media: "screen", reducedMotion: "no-preference", colorScheme: "no-preference", forcedColors: "none", contrast: "no-preference" } as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ ...CLEAN_MEDIA, forcedColors: "active" });
});

test.afterEach(async ({ page }) => {
  // The page is reused across tests in a worker, and emulation survives it: state the whole media state, never one feature.
  await page.emulateMedia(CLEAN_MEDIA);
});

test("a keyboard-focused tab keeps a visible outline", async ({ mount, page }) => {
  await mount<typeof ForcedColorsStory>(STORY, {});
  await page.keyboard.press("Tab");
  const tab = page.getByRole("tab", { name: "Beta", exact: true });
  await expect(tab).toBeFocused();
  await expect(tab).toHaveCSS("outline-style", "solid");
  await expect(tab).not.toHaveCSS("outline-width", "0px");
});

test("the tab indicator is painted in a colour other than the canvas", async ({ mount, page }) => {
  await mount<typeof ForcedColorsStory>(STORY, {});
  const colours = await page.evaluate(() => ({
    canvas: getComputedStyle(document.body).backgroundColor,
    indicator: getComputedStyle(document.querySelector('[data-slot="tabs-indicator"]') as Element).backgroundColor,
  }));
  expect(colours.indicator).not.toBe(colours.canvas);
});
