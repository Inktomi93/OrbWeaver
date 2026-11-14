// @subject packages/client/src/features/preset/components/template-drill-in.tsx
// A template's drill-in names its kind by the display word the list's group kicker uses, never the raw wire word.

import { TEMPLATE_DEFS } from "@orb/contracts/preset";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { editActionName } from "@orb/ui/lib";
import { PRESET_EDITOR_VIEW_LABELS, presetTemplateEditorName } from "#client/features/preset/lib/preset-names.ts";
import { TEMPLATE_KIND_LABEL } from "#client/features/preset/lib/template-rows.ts";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
// A kind whose display word differs from its wire word, on a label no other template shares, so one Edit door names it.
const WITNESS = TEMPLATE_DEFS.find(
  (def) => TEMPLATE_KIND_LABEL[def.kind] !== def.kind && TEMPLATE_DEFS.filter(({ label }) => label === def.label).length === 1,
);
if (WITNESS === undefined) {
  throw new Error("No template has a display word that differs from its kind and a label of its own");
}

test("the drill-in header's kind chip reads the display word, not the wire word", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Drill-in kind witness", kind: "generation" });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "preset.list",
      "preset.get",
      "plugin.listMacros",
      "preset.resolveEffective",
      "connection.resolveChatCapability",
      "connection.providersAvailable",
      "connection.list",
    ]),
  );
  await mount<typeof PresetActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}), subject: "editor", presetId: preset.id });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.actions, exact: true }).click();
  await page.getByRole("button", { name: editActionName(WITNESS.label), exact: true }).click();
  const drill = page.getByRole("region", { name: presetTemplateEditorName(WITNESS.label), exact: true });
  await expect(drill.getByText(TEMPLATE_KIND_LABEL[WITNESS.kind], { exact: true })).toBeVisible();
  await expect(drill.getByText(WITNESS.kind, { exact: true })).toHaveCount(0);
});
