// A single imported theme file reports the settings it carried that Orbweaver did not bring over, in a note beside the
// grid that stays after the success toast: the count in its heading, each reason group under its own sentence, and the raw
// setting names behind a disclosure, grouped the same way. A file that
// left nothing behind shows no note, and the next import replaces the last note, a refused one included. The server is the real settings verb on
// a corpus root, so the leftovers are what production computed for the file.
// @subject packages/client/src/features/config/components/appearance-looks-section.tsx
// @subject packages/client/src/features/config/components/theme-import-leftovers.tsx
import { configSettingLabel } from "@orb/client/state";
import type { ThemeLeftoverReasonKind } from "@orb/contracts/portability";
import { THEME_LEFTOVER_REASON_KINDS } from "@orb/contracts/portability";
import { boxOf, computedStyle, LAYOUT_SUBPIXEL_PX, resolvedLength, watchToastMounts } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { APPEARANCE_SIZING_SUBCATEGORY } from "#client/features/app-shell/lib/appearance-sizing-model.ts";
import { CONFIG_CUSTOMIZE_LOOK_NAME } from "#client/features/config/lib/config-control-names.ts";
import {
  THEME_IMPORT_NOTHING_TO_DO,
  THEME_IMPORT_OUTCOME,
  themeImportGroupLine,
  themeImportGroupNamesLabel,
  themeImportLeftoverTitle,
  themeImportLeftoverToggleName,
} from "#client/features/config/lib/theme-import-copy.ts";
import type { LooksImportStory } from "./_looks-import-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_looks-import-stories/LooksImportStory";
const PROCEDURES = ["settings.getUserSettings", "settings.listThemes", "settings.importThemeFile"] as const;
const NOTE = '[data-slot="theme-import-leftovers"]';
const GROUP = '[data-slot="theme-import-group"]';
const NAMES = '[data-slot="theme-import-names"]';

// A raw SillyTavern theme: a readable surface plus the keys of each kind the note groups. `custom_css` has no counterpart here,
// `font_scale` and `chat_width` are the viewer's own Appearance settings, and `main_text_color` is a text colour too faint on that
// surface to keep. The key names are SillyTavern's own spellings.
const LEFTOVER_KEYS = {
  appearance: ["font_scale", "chat_width"],
  "no-equivalent": ["custom_css"],
  "faint-colour": ["main_text_color"],
} as const satisfies Record<ThemeLeftoverReasonKind, readonly string[]>;
const LEFTOVERS = { ["custom_css"]: "#chat { color: red; }", ["font_scale"]: 1.2, ["chat_width"]: 60, ["main_text_color"]: "rgb(24, 40, 76)" };
const ST_THEME = { name: "Azure", ["blur_tint_color"]: "rgb(16, 32, 64)", ...LEFTOVERS };
// Where the viewer finds those two settings in Appearance, in the order the file lists them: both in Sizing & motion, which sits
// behind the "Customize this look" disclosure.
const APPEARANCE_PLACES = [
  { label: configSettingLabel(APPEARANCE_SIZING_SUBCATEGORY, "fontScale"), section: APPEARANCE_SIZING_SUBCATEGORY.label, folded: true },
  { label: configSettingLabel(APPEARANCE_SIZING_SUBCATEGORY, "chatWidthPct"), section: APPEARANCE_SIZING_SUBCATEGORY.label, folded: true },
] as const;
// A file whose only leftover needs nothing from the person.
const NO_ACTION_THEME = { name: "Plain", ["blur_tint_color"]: "rgb(16, 32, 64)", ["custom_css"]: "#chat { color: red; }" };
// An Orbweaver export: the row's own bytes, which no leftovers can come from.
const NATIVE_THEME = { name: "Native", override: { background: "oklch(0.2493 0.0645 262.64)" }, css: null };
const ST_LANDED_NAME = "Azure (SillyTavern)";

async function importFile(page: Page, name: string, theme: object): Promise<void> {
  await importText(page, name, JSON.stringify(theme));
}

async function importText(page: Page, name: string, text: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}

test("a SillyTavern theme that left settings behind says each group under its own sentence, with the raw names behind a disclosure grouped the same way", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  await mount<typeof LooksImportStory>(STORY, {});

  await importFile(page, "azure.json", ST_THEME);

  // The note names the landed theme and the count, and says the rest imported. A display setting is among the leftovers, so the
  // action is the Appearance group's line alone: the outcome line carries no second instruction.
  const note = page.locator(NOTE);
  await expect(note).toContainText(`4 SillyTavern settings in “${ST_LANDED_NAME}” weren't brought over`);
  await expect(note.getByText(THEME_IMPORT_OUTCOME.created, { exact: true })).toBeVisible();
  // Each reason group has its own sentence, with its own subject and count: the display settings by the labels the Appearance
  // controls wear, the others by how many of them there are.
  await expect(note.locator(GROUP)).toHaveCount(THEME_LEFTOVER_REASON_KINDS.length);
  // The display settings line says where each one is: the section that holds it, and the disclosure that section sits behind.
  const where = note.locator(`${GROUP}[data-kind="appearance"]`);
  await expect(where).toContainText(APPEARANCE_SIZING_SUBCATEGORY.label);
  await expect(where).toContainText(CONFIG_CUSTOMIZE_LOOK_NAME);
  for (const kind of THEME_LEFTOVER_REASON_KINDS) {
    await expect(note.locator(`${GROUP}[data-kind="${kind}"]`)).toHaveText(themeImportGroupLine(kind, LEFTOVER_KEYS[kind].length, APPEARANCE_PLACES));
  }
  // The raw names are one disclosure away, and inside it each group's names sit under that group's heading.
  await expect(note.locator(NAMES)).toBeHidden();
  await note.getByRole("button", { name: themeImportLeftoverToggleName(false), exact: true }).click();
  for (const kind of THEME_LEFTOVER_REASON_KINDS) {
    const names = note.locator(`${NAMES}[data-kind="${kind}"]`);
    await expect(names).toBeVisible();
    await expect(names.getByText(themeImportGroupNamesLabel(kind), { exact: true })).toBeVisible();
    await expect(names.getByText(LEFTOVER_KEYS[kind].join(", "), { exact: true })).toBeVisible();
  }
});

test.describe("on a wide desktop pane", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the note's heading is no smaller than its explanation, its toggle is as wide as its label, and its key list holds the prose measure", async ({
    mount,
    page,
  }) => {
    await using root = await createCorpusHarness();
    await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
    await mount<typeof LooksImportStory>(STORY, {});

    await importFile(page, "azure.json", ST_THEME);

    const note = page.locator(NOTE);
    const heading = note.getByText(themeImportLeftoverTitle(ST_LANDED_NAME, Object.values(LEFTOVER_KEYS).flat().length, true), { exact: true });
    const explanation = note.getByText(THEME_IMPORT_OUTCOME.created, { exact: true });
    await expect(heading).toBeVisible();
    await expect(explanation).toBeVisible();
    const headingSize = Number.parseFloat(await computedStyle(heading, "font-size"));
    const explanationSize = Number.parseFloat(await computedStyle(explanation, "font-size"));
    // The control: both sizes are real, so the comparison is between two painted steps and not two empty reads.
    expect(explanationSize).toBeGreaterThan(0);
    expect(headingSize).toBeGreaterThanOrEqual(explanationSize);

    // A small action takes the width of its label, not the row: its box equals the box the same trigger takes shrink-wrapped.
    const toggle = note.getByRole("button", { name: themeImportLeftoverToggleName(false), exact: true });
    const shrunk = await toggle.evaluate((node) => {
      const probe = node.cloneNode(true);
      if (!(probe instanceof HTMLElement) || node.parentElement === null) {
        throw new Error("The toggle must be an element inside its disclosure");
      }
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.alignSelf = "flex-start";
      node.parentElement.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    });
    const row = await boxOf(note);
    expect(shrunk).toBeLessThan(row.width);
    expect((await boxOf(toggle)).width).toBeCloseTo(shrunk, 0);

    await toggle.click();
    const names = note.locator(`${NAMES}[data-kind="appearance"]`).getByText(LEFTOVER_KEYS.appearance.join(", "), { exact: true });
    await expect(names).toBeVisible();
    const measure = await resolvedLength(page, `var(${TOKENS["reading.measure-prose"].cssVar})`, names);
    // The control: the pane is wider than the measure, so only the cap can hold the list to it.
    expect(row.width).toBeGreaterThan(measure);
    expect((await boxOf(names)).width).toBeLessThanOrEqual(measure + LAYOUT_SUBPIXEL_PX);
  });
});

test("a file whose leftovers need nothing from the person says so once, with no set-it-yourself line", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  await mount<typeof LooksImportStory>(STORY, {});

  await importFile(page, "plain.json", NO_ACTION_THEME);

  const note = page.locator(NOTE);
  await expect(note.getByText(`${THEME_IMPORT_OUTCOME.created} ${THEME_IMPORT_NOTHING_TO_DO}`, { exact: true })).toBeVisible();
  // One group, and it is the one that needs nothing: a one-key group says so in the singular.
  await expect(note.locator(GROUP)).toHaveCount(1);
  await expect(note.locator(`${GROUP}[data-kind="no-equivalent"]`)).toHaveText(themeImportGroupLine("no-equivalent", 1, []));
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
  await expect(note).toContainText("4 SillyTavern settings in this file aren't part of a theme here");
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
