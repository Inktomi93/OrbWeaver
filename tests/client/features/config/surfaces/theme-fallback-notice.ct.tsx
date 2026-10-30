import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { TONE_FALLBACK_SCOPE } from "../../../../ui/content/theme-scope/fallback-cases.ts";
import type { FirstBootStory } from "./_first-boot-stories.tsx";

// The theme editor names the contrast bound its theme's own colours made the app relax, reached the way an author edits
// a theme: Settings → Appearance → a new theme → its Background and Accent pickers.

let root: Awaited<ReturnType<typeof createFirstBootHarness>>;

test.beforeEach(async ({ mount, page }) => {
  root = await createFirstBootHarness();
  await page.emulateMedia({ reducedMotion: "reduce" });
  // The first edit mints a theme: its reads and autosave must belong to the same fresh root.
  await routeTrpc(
    page,
    serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [
      "sessions.me",
      "settings.getUserSettings",
      "settings.listThemes",
      "settings.getAppSettingsWithOverrides",
      "settings.duplicateTheme",
      "settings.updateTheme",
    ]),
  );
  await mount<typeof FirstBootStory>("tests/client/features/config/surfaces/_first-boot-stories/FirstBootStory", {
    group: "appearance",
    phone: false,
    width: 900,
  });
  await page.getByRole("button", { name: /^New theme/u }).click();
});

test.afterEach(async () => {
  await root[Symbol.asyncDispose]();
});

async function pickColor(page: Page, field: string, value: string): Promise<void> {
  await page.getByRole("button", { name: field, exact: true }).click();
  await page
    .getByRole("dialog", { name: `${field} color picker` })
    .getByRole("textbox", { name: "Hex" })
    .fill(value);
  await page.keyboard.press("Escape");
}

const notice = (page: Page): Locator => page.locator('[data-slot="theme-fallback-notice"]');

test("a theme whose accent shares no ink with its solid steps names the relaxed bound, and a fix clears it", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Background", exact: true })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  await pickColor(page, "Background", TONE_FALLBACK_SCOPE.toneBackground);
  await pickColor(page, "Accent", TONE_FALLBACK_SCOPE.toneAccent);
  await expect(notice(page).locator('[data-fallback="tone"]')).toHaveCount(1);
  await pickColor(page, "Background", "oklch(0.98 0.004 75)");
  await expect(notice(page)).toHaveCount(0);
});
