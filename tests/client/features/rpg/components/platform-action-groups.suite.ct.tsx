import { rpgNpcSlug } from "@orb/contracts/rpg";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { RpgActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/rpg/components/_action-groups-stories/RpgActionGroupsStory";
// Actor names have no schema maximum; these exercise both normal word wrapping and an unbroken identity.
const ACTORS = ["Alexandria of the Seven Lanterns, Keeper of the Drowned Archive", "AlexandriaOfTheSevenLanternsKeeperOfTheDrownedArchive"];
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("known-character resting and confirmation controls fit, and cancellation preserves the actor", async ({ mount, page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const principal = await root.principalFor(root.ownerId);
      const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
      await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
      for (const name of ACTORS) {
        expect(
          await caller.rpg.patchActor({
            chatId,
            targetRef: { kind: "npc", npcKey: rpgNpcSlug(name) },
            ops: [{ op: "setIdentityText", field: "name", text: name }],
          }),
        ).toEqual({ ok: true });
      }
      const before = await caller.rpg.getTrackerView({ chatId });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "chat.getChat",
          "chat.listMessages",
          "rpg.getGame",
          "rpg.getTrackerView",
          "rpg.revealHidden",
        ]),
      );
      await mount<typeof RpgActionGroupsStory>(STORY, { chatId, width: regime.width, appearance: regime.appearance });
      await page.getByRole("button", { name: "Show known characters", exact: true }).click();
      for (const name of ACTORS) {
        const promote = page.getByRole("button", { name: `Promote ${name} to the room's characters`, exact: true });
        const dismiss = page.getByRole("button", { name: `Dismiss ${name}`, exact: true });
        const resting = await actionGroupGeometry(promote.locator(".."), [promote, dismiss]);
        await testInfo.attach(`resting-${rpgNpcSlug(name)}`, { body: JSON.stringify(resting), contentType: "application/json" });
        expect(resting.inlineOverflow).toBeLessThanOrEqual(1);
        const host = page.getByRole("group", { name: "Scene action host", exact: true });
        expect((await actionGroupGeometry(host, [promote, dismiss])).inlineOverflow).toBeLessThanOrEqual(1);
        await promote.focus();
        await page.keyboard.press("Enter");
        const cancel = page.getByRole("button", { name: `Cancel promoting ${name}`, exact: true });
        const confirmPromote = page.getByRole("button", { name: `Confirm promoting ${name}`, exact: true });
        const promoting = await actionGroupGeometry(cancel.locator(".."), [cancel, confirmPromote]);
        expect(promoting.inlineOverflow).toBeLessThanOrEqual(1);
        expect((await actionGroupGeometry(host, [cancel, confirmPromote])).inlineOverflow).toBeLessThanOrEqual(1);
        const promotingCopy = page.getByText(
          `Give ${name} a character card and a seat in this room? Everything tracked on them comes along; their mood and their stance toward you do not.`,
          { exact: true },
        );
        expect((await actionGroupGeometry(host, [promotingCopy])).inlineOverflow).toBeLessThanOrEqual(1);
        const floor = await resolvedLength(page, "var(--size-control-sm)", cancel);
        for (const box of [...resting.controls, ...promoting.controls]) {
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        await cancel.focus();
        await page.keyboard.press("Tab");
        await expect(confirmPromote).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Enter");
        await expect(promote).toBeVisible();
        await expect(promote).toBeFocused();
        await dismiss.focus();
        await page.keyboard.press("Enter");
        const keep = page.getByRole("button", { name: `Keep ${name}`, exact: true });
        const confirmDismiss = page.getByRole("button", { name: `Confirm dismissing ${name}`, exact: true });
        const dismissing = await actionGroupGeometry(keep.locator(".."), [keep, confirmDismiss]);
        expect(dismissing.inlineOverflow).toBeLessThanOrEqual(1);
        expect((await actionGroupGeometry(host, [keep, confirmDismiss])).inlineOverflow).toBeLessThanOrEqual(1);
        expect(
          (await actionGroupGeometry(host, [page.getByText(`Forget ${name} and everything tracked on them?`, { exact: true })])).inlineOverflow,
        ).toBeLessThanOrEqual(1);
        for (const box of dismissing.controls) {
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        await keep.focus();
        await page.keyboard.press("Tab");
        await expect(confirmDismiss).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Enter");
        await expect(dismiss).toBeVisible();
        await expect(dismiss).toBeFocused();
      }
      expect(await caller.rpg.getTrackerView({ chatId })).toEqual(before);
    });
  });
}
