import { createCharacterSchema } from "@orb/contracts/character";
import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { RosterActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/roster-preset/components/_action-groups-stories/RosterActionGroupsStory";
const nameMaximum = createRosterPresetSchema.shape.name.maxLength;
if (nameMaximum === null) {
  throw new Error("The maximum-length roster case requires a bounded name");
}
const ROSTER_NAME = "R".repeat(nameMaximum);
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    for (const hosted of [false, true]) {
      test(`${hosted ? "hosted chat" : "library"} roster actions fit and delete cancellation preserves the roster`, async ({ mount, page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
        await using root = await createServerHarness({ startJobs: false });
        const caller = await root.internalCallerFor(root.ownerId);
        const card = await caller.character.create({
          input: createCharacterSchema.parse({ handle: "roster-action-member", name: "Roster member", description: "A member of the saved roster." }),
        });
        const roster = await caller.rosterPreset.create({
          input: createRosterPresetSchema.parse({ name: ROSTER_NAME, members: [{ kind: "character", characterId: card.id, position: 0 }] }),
        });
        const chatId = hosted ? (await caller.chat.startChat({ characterIds: [card.id], opening: "none" })).chat.id : null;
        await routeTrpc(
          page,
          serveCorpusProcedures(caller, [
            "sessions.me",
            "settings.getUserSettings",
            "rosterPreset.list",
            "chat.getChat",
            "automation.listRules",
            "automation.listRulePresets",
          ]),
        );
        await mount<typeof RosterActionGroupsStory>(STORY, { chatId, width: regime.width, appearance: regime.appearance });
        const row = page.locator('[data-slot="roster-row"]');
        const start = row.getByRole("button", { name: new RegExp(`^Start a chat with ${ROSTER_NAME}`) });
        const add = row.getByRole("button", { name: new RegExp(`^Add ${ROSTER_NAME} to this chat`) });
        const remove = row.getByRole("button", { name: `Delete ${ROSTER_NAME}`, exact: true });
        await expect(start).toBeEnabled();
        await expect(add).toHaveCount(hosted ? 1 : 0);
        const controls = hosted ? [start, add, remove] : [start, remove];
        const geometry = await actionGroupGeometry(start.locator(".."), controls);
        await testInfo.attach("actual-roster-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
        expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
        expect(
          (await actionGroupGeometry(page.getByRole("group", { name: "Saved roster action host", exact: true }), controls)).inlineOverflow,
        ).toBeLessThanOrEqual(1);
        const floor = await resolvedLength(page, "var(--size-control-sm)", row);
        for (const box of geometry.controls) {
          expect(box.width).toBeGreaterThanOrEqual(floor);
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        await start.focus();
        for (const control of controls.slice(1)) {
          await page.keyboard.press("Tab");
          await expect(control).toBeFocused();
        }
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("alertdialog", { name: "Delete this roster?", exact: true });
        const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
        await expect(cancel).toBeVisible();
        await cancel.focus();
        await page.keyboard.press("Enter");
        await expect(dialog).toBeHidden();
        await expect(remove).toBeFocused();
        expect((await caller.rosterPreset.get({ presetId: roster.id })).name).toBe(ROSTER_NAME);
      });
    }
  });
}
