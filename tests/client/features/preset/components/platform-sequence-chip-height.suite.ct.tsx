// A sequence chip's Remove button sits at the chip control step, so the chip is one control tall at a fine and a coarse pointer.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { settledBox } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, createCorpusHarness } from "@orb/testkit/node/composed";
import { removeActionName } from "@orb/ui/lib";
import { TOKENS } from "@orb/ui/tokens";
import { PRESET_STOP_SEQUENCE_NOUN, sequenceAddName, sequenceChipSubject } from "#client/features/preset/lib/preset-names.ts";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "preset.list",
  "preset.get",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
  "settings.updateUserSettingsSection",
  "preset.create",
  // Adding a chip edits the preset, and its autosave can reach the wire before the case ends.
  "preset.update",
] as const;
const POINTERS = [
  { name: "fine", viewport: { width: 1280, height: 900 }, coarse: false },
  { name: "coarse", viewport: { width: 390, height: 844 }, coarse: true },
] as const;

for (const pointer of POINTERS) {
  test.describe(`${pointer.name} pointer`, () => {
    test.use({ viewport: pointer.viewport, hasTouch: pointer.coarse, isMobile: pointer.coarse });

    test("a stop sequence chip's Remove button is as tall as its text field's control step", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const appearance = appearanceSettingsSchema.parse({});
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      // A local-server connection: only those declare the stop-sequence control.
      const principal = await root.principalFor(root.ownerId);
      const connection = await root.services.connection.create({
        principal,
        providerId: "custom-openai",
        credentialId: null,
        baseUrl: CORPUS_PROVIDER_ENDPOINT,
        model: CORPUS_TEXT_MODEL,
        allowBackground: false,
        declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
      });
      await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
      const preset = await caller.preset.create({ name: "Sequences", kind: "generation" });
      await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof PresetActionGroupsStory>(STORY, { width: pointer.viewport.width, appearance, subject: "editor", presetId: preset.id });
      const add = page.getByRole("textbox", { name: sequenceAddName(PRESET_STOP_SEQUENCE_NOUN), exact: true });
      await add.scrollIntoViewIfNeeded();
      await add.fill("END");
      await add.press("Enter");
      const remove = page.getByRole("button", { name: removeActionName(sequenceChipSubject(PRESET_STOP_SEQUENCE_NOUN, "END")), exact: true });
      await expect(remove).toBeVisible();
      const chip = page.locator('[data-slot="badge"]', { has: remove });
      const removeBox = await settledBox(remove);
      // The token's pointer-conditional value: 28px under a mouse, 44px under a finger.
      const step = await remove.evaluate((element, variable) => {
        const probe = document.createElement("div");
        probe.style.blockSize = `var(${variable})`;
        element.append(probe);
        const height = probe.getBoundingClientRect().height;
        probe.remove();
        return height;
      }, TOKENS["size.touch-target"].cssVar);
      expect(removeBox.height, "Remove is the chip step").toBeCloseTo(step, 1);
      expect(removeBox.width, "Remove is square").toBeCloseTo(step, 1);
      const chrome = await chip.evaluate((element) => {
        const style = getComputedStyle(element);
        return ["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"].reduce(
          (sum, property) => sum + Number.parseFloat(style.getPropertyValue(property)),
          0,
        );
      });
      expect((await settledBox(chip)).height, "the chip is its Remove button plus its own padding and edge").toBeCloseTo(step + chrome, 1);
    });
  });
}
