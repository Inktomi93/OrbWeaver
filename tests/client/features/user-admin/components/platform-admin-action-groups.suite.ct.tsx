import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { AdminActionGroupsStory } from "./_admin-action-groups-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-action-groups-stories/AdminActionGroupsStory";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("admin Save, Saving and Reset keep their real write and floor semantics", async ({ mount, page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      const floor = await caller.settings.getAppSettingsWithOverrides();
      await caller.settings.updateAppSettings({ partial: { promptCacheMinDepth: 2 } });
      const hold = holdServed();
      const routes = await routeTrpc(page, {
        ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.getAppSettingsWithOverrides"]),
        ...serveCorpusProcedures(caller, ["settings.updateAppSettings"], () => hold),
      });
      try {
        await mount<typeof AdminActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
        const save = page.getByRole("button", { name: "Save", exact: true });
        const reset = page.getByRole("button", { name: "Reset to defaults: System tuning", exact: true });
        await expect(save).toBeDisabled();
        await expect(reset).toBeVisible();
        const field = page.getByRole("textbox", { name: "Prompt-cache depth floor (0–20)", exact: true });
        await field.fill("3");
        await field.press("Tab");
        await expect(save).toBeEnabled();
        await save.focus();
        await page.keyboard.press("Tab");
        await expect(reset).toBeFocused();
        let geometry = await actionGroupGeometry(page.locator('[data-slot="admin-action-host"]'), [save, reset]);
        expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
        await save.press("Enter");
        await hold.requested;
        const saving = page.getByRole("button", { name: "Saving…", exact: true });
        await expect(saving).toBeDisabled();
        await expect(reset).toBeDisabled();
        geometry = await actionGroupGeometry(page.locator('[data-slot="admin-action-host"]'), [saving, reset]);
        await testInfo.attach("admin-pending-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
        expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
        expect((await caller.settings.getAppSettingsWithOverrides()).overrides.promptCacheMinDepth).toBe(2);
        hold.release();
        await expect(save).toBeDisabled();
        await expect(reset).toBeEnabled();
        expect((await caller.settings.getAppSettingsWithOverrides()).overrides.promptCacheMinDepth).toBe(3);
        expect(routes.inputs("settings.updateAppSettings")).toEqual([{ partial: { promptCacheMinDepth: 3 } }]);
        await reset.click();
        await expect(reset).toHaveCount(0);
        await expect(save).toBeDisabled();
        const cleared = await caller.settings.getAppSettingsWithOverrides();
        expect(cleared.overrides.promptCacheMinDepth).toBeNull();
        expect(cleared.resolved.promptCacheMinDepth).toBe(floor.resolved.promptCacheMinDepth);
        await expect(field).toHaveValue(String(floor.resolved.promptCacheMinDepth));
      } finally {
        hold.release();
      }
    });
  });
}
