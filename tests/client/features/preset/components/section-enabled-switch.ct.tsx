// @subject packages/client/src/features/preset/components/prompt-assembly/section-row.tsx
// @subject packages/client/src/features/preset/components/prompt-assembly/section-drill-in.tsx
// A section's enable switch keeps one stable name for the section, on its rack row and in its drill-in; `aria-checked` alone carries the state.

import { presetDetailSchema } from "@orb/contracts/preset";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { editActionName } from "@orb/ui/lib";
import { headerCopy, isPivotSection, sectionEnabledSwitchName } from "#client/features/preset/lib/assembly-model.ts";
import { PRESET_EDITOR_VIEW_LABELS } from "#client/features/preset/lib/preset-names.ts";
import { AUTOSAVE_SAVED_TEXT } from "#client/forms/editor/autosave-status-names.ts";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

const STORY = "tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory";
const READS = [
  "settings.getUserSettings",
  "sessions.me",
  "preset.get",
  "plugin.listMacros",
  "preset.list",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
  "preset.update",
] as const;

test("two sections are found by their stable names on the rack and in the drill-in, and a flip moves only aria-checked", async ({ corpus, mount, page }) => {
  const library = corpus.libraryRelations;
  if (library === undefined) {
    throw new Error("The committed corpus omitted the preset library");
  }
  await using root = await createCorpusHarness();
  const presetId = presetDetailSchema.shape.id.parse(library.reads.presetDetail.output.id);
  const caller = await root.internalCallerFor(root.ownerId);
  const sections = (await caller.preset.get({ id: presetId })).config.sections.filter((section) => !isPivotSection(section));
  const [kept, flipped] = sections.filter((section) => section.enabled);
  if (kept === undefined || flipped === undefined) {
    throw new Error("The corpus preset needs two enabled sections that can be switched off");
  }
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof PresetListLifetimeStory>(STORY, { presetId });
  await expect(page.getByText(AUTOSAVE_SAVED_TEXT, { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.prompt, exact: true }).click();

  const keptSwitch = page.getByRole("switch", { name: sectionEnabledSwitchName(kept), exact: true });
  const flippedSwitch = page.getByRole("switch", { name: sectionEnabledSwitchName(flipped), exact: true });
  await expect(keptSwitch).toHaveAttribute("aria-checked", "true");
  await expect(flippedSwitch).toHaveAttribute("aria-checked", "true");
  await flippedSwitch.click();
  await expect(flippedSwitch).toHaveAttribute("aria-checked", "false");
  await expect(keptSwitch).toHaveAttribute("aria-checked", "true");

  // The drill-in's echo of the same flag answers to the same name and reads the state the rack just wrote.
  await page.getByRole("button", { name: editActionName(headerCopy(flipped).label), exact: true }).click();
  const echo = page.getByRole("switch", { name: sectionEnabledSwitchName(flipped), exact: true });
  await expect(echo).toHaveAttribute("aria-checked", "false");
  await echo.click();
  await expect(echo).toHaveAttribute("aria-checked", "true");
});
