// The actual preset editor restores the originating chevron after a section drill-in, including its pivot.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
for (const { width, height, density } of [
  { width: 1280, height: 900, density: "comfortable" },
  { width: 390, height: 844, density: "comfortable" },
  { width: 390, height: 844, density: "compact" },
]) {
  const viewport = { width, height };
  test.describe(`${width}x${height}/${density}`, () => {
    test.use({ viewport, hasTouch: viewport.width === 390, isMobile: viewport.width === 390 });
    test("Back restores section and Actions template origins without stealing initial list focus", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const appearance = appearanceSettingsSchema.parse({ density });
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
      const actions = page.getByRole("tab", { name: "Actions", exact: true });
      await actions.click();
      await expect(actions).toBeFocused();
      for (const name of ["Edit Response", "Edit Rewrite"]) {
        const trigger = page.getByRole("button", { name, exact: true });
        await trigger.focus();
        await trigger.press("Enter");
        const back = page.getByRole("button", { name: "Back to actions", exact: true });
        await expect(back).toBeFocused();
        await back.press("Enter");
        await expect(trigger).toBeFocused();
        await expect(trigger).toBeInViewport({ ratio: 1 });
        await page.screenshot({ path: test.info().outputPath(`${name.toLowerCase().replaceAll(" ", "-")}-focus.png`) });
        const filter = page.getByRole("textbox", { name: "Filter templates", exact: true });
        await filter.fill("no-template-matches-this-filter");
        await expect(page.getByText('No template matches "no-template-matches-this-filter"', { exact: false })).toBeVisible();
        await filter.clear();
        await expect(trigger).toBeVisible();
        await expect(filter).toBeFocused();
      }
    });
  });
}
