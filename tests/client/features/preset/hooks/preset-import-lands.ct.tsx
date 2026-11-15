// A SillyTavern preset imported from the Presets band ends on the imported preset: a search that would hide its row
// clears, and the row is the selected one. Importing the same file again reuses that preset and selects it again.
// @subject packages/client/src/features/preset/hooks/use-preset-list-header.tsx
// @subject packages/client/src/features/preset/components/preset-import-dialog.tsx

import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { PRESET_IMPORT_NAME, PRESET_IMPORT_TITLE, PRESET_SEARCH_NAME } from "#client/features/preset/lib/preset-names.ts";
import type { PresetImportStory } from "./_preset-import-stories.tsx";

const STORY = "tests/client/features/preset/hooks/_preset-import-stories/PresetImportStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "preset.list",
  "preset.previewFile",
  "preset.importFile",
  "connection.providersAvailable",
  "connection.list",
] as const;
const OTHER_PRESET = "Northern campaign profile";
const FILE_NAME = "Flame Complete.json";
const IMPORTED = "Flame Complete";
// SillyTavern wire text is snake_case by spec, so the preset is raw JSON.
const PRESET_FILE = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
});

test.use({ viewport: { width: 1280, height: 900 } });

async function importFile(page: Page): Promise<void> {
  await page.getByRole("button", { name: PRESET_IMPORT_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: PRESET_IMPORT_TITLE, exact: true });
  await dialog.locator('input[type="file"]').setInputFiles({ name: FILE_NAME, mimeType: "application/json", buffer: Buffer.from(PRESET_FILE) });
  const submit = dialog.getByRole("button", { name: PRESET_IMPORT_NAME, exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toBeHidden();
}

test("an import started under a search for another preset ends on the imported preset, and a re-import selects it again", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const other = await caller.preset.create({ name: OTHER_PRESET, kind: "generation" });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof PresetImportStory>(STORY, {});
  const search = page.getByRole("textbox", { name: PRESET_SEARCH_NAME, exact: true });
  const importedRow = page.getByRole("button", { name: IMPORTED, exact: true });
  await search.fill(OTHER_PRESET);
  await expect(page.getByRole("button", { name: other.name, exact: true })).toBeVisible();

  await importFile(page);

  await expect(search).toHaveValue("");
  await expect(importedRow).toHaveAttribute("aria-current", "true");
  const landed = (await caller.preset.list()).filter(({ name }) => name === IMPORTED);
  expect(landed).toHaveLength(1);

  await search.fill(OTHER_PRESET);
  await importFile(page);

  await expect(search).toHaveValue("");
  await expect(importedRow).toHaveCount(1);
  await expect(importedRow).toHaveAttribute("aria-current", "true");
  expect((await caller.preset.list()).filter(({ name }) => name === IMPORTED)).toEqual(landed);
});
