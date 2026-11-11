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
import { themeImportLeftoverTitle, themeImportLeftoverToggleName } from "#client/features/config/lib/theme-import-copy.ts";
import type { LooksImportStory } from "./_looks-import-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_looks-import-stories/LooksImportStory";
const PROCEDURES = ["settings.getUserSettings", "settings.listThemes", "settings.importThemeFile"] as const;
const NOTE = '[data-slot="theme-import-leftovers"]';

// A raw SillyTavern theme: a readable surface plus two keys no theme field takes. The key names are SillyTavern's own spellings.
const LEFTOVERS = { ["custom_css"]: "#chat { color: red; }", ["font_scale"]: 1.2 };
const ST_THEME = { name: "Azure", ["blur_tint_color"]: "rgb(16, 32, 64)", ...LEFTOVERS };
// An Orbweaver export: the row's own bytes, which no leftovers can come from.
const NATIVE_THEME = { name: "Native", override: { background: "oklch(0.2493 0.0645 262.64)" }, css: null };
const ST_LANDED_NAME = "Azure (SillyTavern)";

async function importFile(page: Page, name: string, theme: object): Promise<void> {
  await importText(page, name, JSON.stringify(theme));
}

async function importText(page: Page, name: string, text: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}

test("a SillyTavern theme that left settings behind reports their count, with the names behind a disclosure", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  await mount<typeof LooksImportStory>(STORY, {});

  await importFile(page, "azure.json", ST_THEME);

  // The note names the landed theme and the count.
  const note = page.locator(NOTE);
  await expect(note).toContainText(themeImportLeftoverTitle(ST_LANDED_NAME, Object.keys(LEFTOVERS).length));
  // The names are one disclosure away, not on the page until it is opened.
  const names = Object.keys(LEFTOVERS).join(", ");
  await expect(note.getByText(names, { exact: true })).toBeHidden();
  await note.getByRole("button", { name: themeImportLeftoverToggleName(false), exact: true }).click();
  await expect(note.getByText(names, { exact: true })).toBeVisible();
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
