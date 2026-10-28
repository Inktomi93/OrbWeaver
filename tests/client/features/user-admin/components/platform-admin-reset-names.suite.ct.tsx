import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { AdminResetNamesStory } from "./_admin-action-groups-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-action-groups-stories/AdminResetNamesStory";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;
const RESET_NAMES = [
  "Reset to defaults: Media & trust",
  "Reset to defaults: Multi-user",
  "Reset to defaults: Operations",
  "Reset to defaults: Memory tuning",
  "Reset to defaults: Rate limits",
  "Reset to defaults: System tuning",
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("section resets have distinct names and keyboard activation clears only the selected override keys", async ({ page, mount }, testInfo) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      const floor = await caller.settings.getAppSettingsWithOverrides();
      await caller.settings.updateAppSettings({
        partial: {
          maxImageBytes: floor.resolved.maxImageBytes,
          discreetLogin: true,
          corpusAutoindex: false,
          memoryDefaults: { keywordMatch: true },
          rateLimits: { login: floor.resolved.rateLimits.login },
          promptCacheMinDepth: 2,
        },
      });
      const seeded = await caller.settings.getAppSettingsWithOverrides();
      await page.route("**/api/auth/config", async (route) => {
        const response = await root.http.request("/api/auth/config");
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      });
      const calls = await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "settings.getAppSettingsWithOverrides",
          "settings.updateAppSettings",
          "admin.listUsers",
          "share.status",
          "share.signInMode",
        ]),
      );
      await mount<typeof AdminResetNamesStory>(STORY, { width: regime.width, appearance: regime.appearance });
      const pane = page.locator('[data-slot="admin-reset-host"]');
      await expect(pane.getByRole("textbox", { name: "Prompt-cache depth floor (0–20)", exact: true })).toBeVisible();
      await expect(pane.getByRole("button", { name: /^Reset to defaults/ })).toHaveCount(6);
      for (const name of RESET_NAMES) {
        await expect(pane.getByRole("button", { name, exact: true })).toHaveCount(1);
      }
      const reset = pane.getByRole("button", { name: "Reset to defaults: System tuning", exact: true });
      await reset.scrollIntoViewIfNeeded();
      await reset.focus();
      await expect(reset).toBeFocused();
      await testInfo.attach(`admin-reset-names-${regime.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      await page.keyboard.press("Enter");
      await expect(reset).toHaveCount(0);
      const after = await caller.settings.getAppSettingsWithOverrides();
      const cleared = {
        promptTransformDeadlineMs: null,
        catalogRefreshIntervalMs: null,
        imageVariantQuality: null,
        maxDatabankBytes: null,
        promptCacheMinDepth: null,
      };
      expect(after.overrides).toEqual({ ...seeded.overrides, ...cleared });
      expect(calls.inputs("settings.updateAppSettings")).toEqual([{ partial: cleared }]);
      await expect(pane.getByRole("button", { name: /^Reset to defaults/ })).toHaveCount(5);
      const rateReset = pane.getByRole("button", { name: "Reset to defaults: Rate limits", exact: true });
      await rateReset.scrollIntoViewIfNeeded();
      await rateReset.focus();
      await page.keyboard.press("Enter");
      await expect(rateReset).toHaveCount(0);
      expect((await caller.settings.getAppSettingsWithOverrides()).overrides).toEqual({ ...seeded.overrides, ...cleared, rateLimits: null });
      expect(calls.inputs("settings.updateAppSettings")).toEqual([{ partial: cleared }, { partial: { rateLimits: null } }]);
    });
  });
}
