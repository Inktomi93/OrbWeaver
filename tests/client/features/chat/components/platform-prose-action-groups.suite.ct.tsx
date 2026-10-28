import { PROSE_SLOTS, USER_PROSE_SLOT_IDS } from "@orb/contracts/prose";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { ProseActionGroupsStory } from "./_prose-action-groups-stories.tsx";

const STORY = "tests/client/features/chat/components/_prose-action-groups-stories/ProseActionGroupsStory";
const SLOT_ID = USER_PROSE_SLOT_IDS.find((id) => PROSE_SLOTS[id].version > 1);
if (SLOT_ID === undefined) {
  throw new Error("The prose action case requires a revised user-home slot");
}
const SLOT = PROSE_SLOTS[SLOT_ID];
const TEXT = "Preserve this author's wording while reviewing a newer built-in version.";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });

    for (const action of ["keep", "clear"] as const) {
      const expectedText = action === "keep" ? TEXT : "";
      const expectedOverride = action === "keep" ? { text: TEXT, baseVersion: SLOT.version } : undefined;
      const actionName = action === "keep" ? "Keep mine" : "Use the new wording";
      test(`stale prose actions remain contained and ${action} preserves its command`, async ({ mount, page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
        await using root = await createServerHarness({ startJobs: false });
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        await caller.settings.updateUserSettingsSection({ section: "prose", patch: { [SLOT_ID]: { text: TEXT, baseVersion: SLOT.version - 1 } } });
        const calls = await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.updateUserSettingsSection"]));
        await mount<typeof ProseActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
        const card = page.getByRole("group", { name: SLOT.title, exact: true });
        const useNew = card.getByRole("button", { name: "Use the new wording", exact: true });
        const keep = card.getByRole("button", { name: "Keep mine", exact: true });
        await useNew.focus();
        await page.keyboard.press("Tab");
        await expect(keep).toBeFocused();
        const group = keep.locator("..");
        const geometry = await actionGroupGeometry(group, [useNew, keep]);
        await testInfo.attach("actual-prose-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
        expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
        expect(
          (await actionGroupGeometry(page.getByRole("group", { name: "Prose action host", exact: true }), [useNew, keep])).inlineOverflow,
        ).toBeLessThanOrEqual(1);
        const floor = await resolvedLength(page, "var(--size-control-sm)", group);
        for (const box of geometry.controls) {
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        if (action === "clear") {
          await page.keyboard.press("Shift+Tab");
        }
        await expect(card.getByRole("button", { name: actionName, exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect
          .poll(() => calls.lastInput("settings.updateUserSettingsSection"))
          .toMatchObject({
            section: "prose",
            patch: { [SLOT_ID]: expectedOverride ?? null },
          });
        await expect(card.getByRole("textbox", { name: SLOT.title, exact: true })).toHaveValue(expectedText);
        await expect.poll(async () => (await caller.settings.getUserSettings()).config.prose[SLOT_ID]).toEqual(expectedOverride);
      });
    }
  });
}
