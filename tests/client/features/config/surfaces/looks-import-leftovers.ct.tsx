// A single imported theme file reports the settings it carried that Orbweaver did not bring over, in a note beside the
// grid that stays after the success toast: the count in its heading, the setting names behind a disclosure. A file that
// left nothing behind shows no note, and the next import replaces the last note, a refused one included. The server is the real settings verb on
// a corpus root, so the leftovers are what production computed for the file.
// @subject packages/client/src/features/config/components/appearance-looks-section.tsx
// @subject packages/client/src/features/config/components/theme-import-leftovers.tsx
import { watchToastMounts } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { APPEARANCE_SIZING_SUBCATEGORY } from "#client/features/app-shell/lib/appearance-sizing-model.ts";
import {
  THEME_IMPORT_ACTION,
  THEME_IMPORT_GROUP_NOTE,
  THEME_IMPORT_OUTCOME,
  themeImportAppearanceLine,
  themeImportLeftoverTitle,
  themeImportLeftoverToggleName,
} from "#client/features/config/lib/theme-import-copy.ts";
import type { LooksImportStory } from "./_looks-import-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_looks-import-stories/LooksImportStory";
const PROCEDURES = ["settings.getUserSettings", "settings.listThemes", "settings.importThemeFile"] as const;
const NOTE = '[data-slot="theme-import-leftovers"]';

// A raw SillyTavern theme: a readable surface plus one key of each kind the note groups. `custom_css` has no counterpart here,
// `font_scale` is the viewer's Text size in Appearance, and `main_text_color` is a text colour too faint on that surface to keep.
// The key names are SillyTavern's own spellings.
const LEFTOVERS = { ["custom_css"]: "#chat { color: red; }", ["font_scale"]: 1.2, ["main_text_color"]: "rgb(24, 40, 76)" };
const ST_THEME = { name: "Azure", ["blur_tint_color"]: "rgb(16, 32, 64)", ...LEFTOVERS };
// The label the viewer finds `font_scale`'s setting under in Appearance.
const FONT_SCALE_LABEL = APPEARANCE_SIZING_SUBCATEGORY.settings?.find((setting) => setting.key === "fontScale")?.label ?? "";
// An Orbweaver export: the row's own bytes, which no leftovers can come from.
const NATIVE_THEME = { name: "Native", override: { background: "oklch(0.2493 0.0645 262.64)" }, css: null };
const ST_LANDED_NAME = "Azure (SillyTavern)";

async function importFile(page: Page, name: string, theme: object): Promise<void> {
  await importText(page, name, JSON.stringify(theme));
}

async function importText(page: Page, name: string, text: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}

test("a SillyTavern theme that left settings behind says what to do about each group, with the raw names behind a disclosure", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  await mount<typeof LooksImportStory>(STORY, {});

  await importFile(page, "azure.json", ST_THEME);

  // The note names the landed theme and the count, says the rest imported, and says there is something to set.
  const note = page.locator(NOTE);
  await expect(note).toContainText(themeImportLeftoverTitle(ST_LANDED_NAME, Object.keys(LEFTOVERS).length, true));
  await expect(note).toContainText(`${THEME_IMPORT_OUTCOME.created} ${THEME_IMPORT_ACTION.needed}`);
  // Each group has its own line: the display setting by the label it wears in Appearance, then the two that need nothing.
  await expect(note).toContainText(themeImportAppearanceLine([FONT_SCALE_LABEL]));
  await expect(note).toContainText(THEME_IMPORT_GROUP_NOTE["no-equivalent"]);
  await expect(note).toContainText(THEME_IMPORT_GROUP_NOTE["faint-colour"]);
  // The raw names are one disclosure away, not on the page until it is opened.
  const names = Object.keys(LEFTOVERS).join(", ");
  await expect(note.getByText(names, { exact: true })).toBeHidden();
  await note.getByRole("button", { name: themeImportLeftoverToggleName(false), exact: true }).click();
  await expect(note.getByText(names, { exact: true })).toBeVisible();
});

test("a theme you already have is reported as reused, and its note never claims an import", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const rpc = await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  await mount<typeof LooksImportStory>(STORY, {});

  // The control: the first import made the theme, so the second is the reuse the note must word differently.
  await importFile(page, "azure.json", ST_THEME);
  await expect(page.locator(NOTE)).toContainText(THEME_IMPORT_OUTCOME.created);
  await importFile(page, "azure.json", ST_THEME);
  await expect.poll(() => rpc.count("settings.importThemeFile")).toBe(2);

  const note = page.locator(NOTE);
  await expect(note).toContainText(themeImportLeftoverTitle(ST_LANDED_NAME, Object.keys(LEFTOVERS).length, false));
  await expect(note).toContainText(THEME_IMPORT_OUTCOME.reused);
  await expect(note).not.toContainText(THEME_IMPORT_OUTCOME.created);
});

test("a file with nothing left behind shows no note, and a later import clears an earlier one", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const rpc = await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  await mount<typeof LooksImportStory>(STORY, {});

  // The control: the first import raises the note, so its absence below can only be the second import clearing it.
  await importFile(page, "azure.json", ST_THEME);
  await expect(page.locator(NOTE)).toBeVisible();

  await importFile(page, "native.json", NATIVE_THEME);
  await expect(page.locator(NOTE)).toHaveCount(0);
  expect(rpc.count("settings.importThemeFile")).toBe(2);
});

test("a refused import clears the note of the import before it, and the refusal is said where it already is", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const rpc = await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  const toastMounts = await watchToastMounts(page);
  await mount<typeof LooksImportStory>(STORY, {});

  // The control: the first import raises the note and its success toast.
  await importFile(page, "azure.json", ST_THEME);
  await expect(page.locator(NOTE)).toBeVisible();
  await expect.poll(toastMounts).toBe(1);

  // Text no theme parser reads: the real verb refuses it, and its refusal is the second toast.
  await importText(page, "broken.json", "{ not a theme");
  await expect.poll(toastMounts).toBe(2);
  expect(rpc.count("settings.importThemeFile")).toBe(2);
  await expect(page.locator(NOTE)).toHaveCount(0);
});
