// The actual preset editor restores the originating chevron after a section drill-in, including its pivot.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: viewport.width === 390, isMobile: viewport.width === 390 });
    test("Back restores ordinary section and Chat history pivot focus without stealing initial rack focus", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const appearance = appearanceSettingsSchema.parse({});
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      const preset = await caller.preset.create({ name: "Pivot focus witness", kind: "generation" });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "preset.list",
          "preset.get",
          "preset.resolveEffective",
          "connection.resolveChatCapability",
          "connection.providersAvailable",
          "connection.list",
        ]),
      );
      await mount<typeof PresetActionGroupsStory>(STORY, { width: viewport.width, appearance, subject: "editor", presetId: preset.id });
      const prompt = page.getByRole("tab", { name: "Prompt", exact: true });
      await prompt.click();
      const pivot = page.getByRole("button", { name: "Edit Chat history", exact: true });
      await expect(pivot).toBeVisible();
      await expect(prompt).toBeFocused();
      const ordinary = page.getByRole("button", { name: /^Edit (?!Chat history$)/u }).first();
      for (const trigger of [ordinary, pivot]) {
        await trigger.focus();
        await page.keyboard.press("Enter");
        const back = page.getByRole("button", { name: "Back to rack", exact: true });
        await expect(back).toBeFocused();
        await back.press("Enter");
        await expect(trigger).toBeFocused();
      }
    });
  });
}
