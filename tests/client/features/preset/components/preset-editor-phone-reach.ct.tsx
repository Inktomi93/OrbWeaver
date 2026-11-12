// @subject packages/client/src/features/preset/surfaces/preset-editor-surface.tsx
// @subject packages/client/src/features/preset/components/preset-editor-header.tsx
// The preset editor's header controls and view strip wrap or scroll inside the pane. At the largest browser text on a phone the pane
// holds its own width: nothing in it ends past the pane, so it never scrolls sideways.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize, sidewaysReach } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESET_EDITOR_NAME } from "#client/features/preset/lib/preset-names.ts";
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
] as const;
const PHONE = { width: 390, height: 844 };
const TEXT_SIZES = PLATFORM_TEXT_SCALES;

test.describe("a 390px phone", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  for (const text of TEXT_SIZES) {
    test(`the editor pane does not scroll sideways at ${String(text * 100)}% browser text`, async ({ mount, page }) => {
      await using _textSize = await setPlatformTextSize(page, text);
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const appearance = appearanceSettingsSchema.parse({});
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: null } });
      const preset = await caller.preset.create({ name: "Northern campaign generation profile", kind: "generation" });
      await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof PresetActionGroupsStory>(STORY, { width: PHONE.width, appearance, subject: "editor", presetId: preset.id });
      const editor = page.getByRole("region", { name: PRESET_EDITOR_NAME, exact: true });
      await expect(editor.getByRole("heading", { name: preset.name, exact: true })).toBeVisible();
      await expect(editor.locator('[data-slot="autosave-status"]')).toHaveText("Saved");
      const reach = await editor.evaluate(sidewaysReach);
      expect(reach.scrolls, reach.wideners.join("\n")).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    });
  }
});
