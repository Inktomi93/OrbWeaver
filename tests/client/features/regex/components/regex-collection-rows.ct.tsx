// CT: the regex LIBRARY GROUP (REGX2) — the two things a script library could not do before this wave.
//
//  · BULK EDIT. Selecting twenty scripts and switching them off meant twenty round trips through twenty
//    row switches, or the editor twenty times. The mode is entered from the band (host chrome, declared as
//    DATA by the contribution) and acted on by the bar under the rows (the owner's own verbs).
//  · THE PER-SCRIPT JSON DOOR. Sharing one script meant exporting a whole account backup, or the character
//    card that happened to carry it. Export is the row's kebab, import is the band — D121-D's anatomy.
//
// Everything is asserted through what a user can SEE and NAME (accessible names, the rendered row, the wire
// the affordance fires), never through the store or the hooks behind them.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { RegexLibraryGroupStory } from "../_ct-stories.tsx";

const BAND = /Regex scripts/;
/** The kebab's accessible name is `Actions for <name>`, so only a pattern addresses one row's menu. */
const STRIP_ACTIONS = /Actions for strip ooc/;
/** The bulk delete confirm's body — the CASCADE, which is the consequence the roster cannot show. */
const BULK_DELETE_CASCADE = /removes them from every preset, character, and room/;

/** A fixed edit stamp for every fixture row — the assertions below read the "edited …" PREFIX, never the
 *  relative text, so the suite is not coupled to the wall clock. */
const FIXTURE_UPDATED_AT = 1_760_000_000_000;

function script(id: string, name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name,
    updatedAt: FIXTURE_UPDATED_AT,
    findRegex: "\\(ooc\\)",
    replaceString: "",
    placement: ["AI_OUTPUT"],
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: 0,
    ...over,
  };
}

const STRIP = script("regex_script_stripooc00000", "strip ooc");
const NARRATE = script("regex_script_narrate000000", "narrate");
const SCRIPTS = [STRIP, NARRATE];

/** The bytes the export door hands back — the SERVER's file, which is the whole point of the door being a
 *  thin arm over the bundle's own projection rather than a client-side re-serialization. */
const EXPORTED = { filename: "strip-ooc-regex_script_stripooc00000.json", fileText: '{"kind":"regex-script"}' };

function stub(page: Page, scripts: readonly unknown[] = SCRIPTS, globals: readonly unknown[] = []): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => scripts,
    "regex.listGlobal": () => globals,
    "regex.attachGlobal": () => undefined,
    "regex.detachGlobal": () => ({ detached: true }),
    "regex.duplicateScript": () => script("regex_script_copy000000000", "strip ooc (copy)"),
    "regex.removeScript": () => ({ deleted: true }),
    "regex.bulkSetEnabled": () => ({ affected: 2 }),
    "regex.bulkSetGlobal": () => ({ affected: 2 }),
    "regex.bulkRemove": () => ({ affected: 2 }),
    "regex.exportScript": () => EXPORTED,
    "regex.importScriptFile": () => ({ created: true }),
  });
}

/** Open the group — every CT here needs its rows, and the disclosure store is device-local, so the reset
 *  runs first. Barriers on the FIRST ROW rather than on the disclosure's attribute: the rows arrive with the
 *  suspended query, and an expanded-but-empty frame is catchable in between. */
async function openGroup(page: Page, group: Locator): Promise<void> {
  await page.getByRole("button", { name: "reset" }).click();
  await group.getByRole("button", { name: BAND }).click();
  await expect(group.getByText("strip ooc", { exact: true })).toBeVisible();
}

// ── THE ROW'S OWN LIFECYCLE CHROME (D121-D `kebab=Export`) ────────────────────────────────────────────

test("a row's kebab carries Duplicate · Export · Delete — and NO Rename", async ({ mount, page }) => {
  await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await openGroup(page, group);

  await group.getByRole("button", { name: STRIP_ACTIONS }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  // A script's name is a bound field of the editor this row's click already mounts, so a Rename dialog
  // would be a second write path for a field one click away.
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);
});

test("Export asks the SERVER for the file — the same bytes a backup carries", async ({ mount, page }) => {
  const trpc = await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await openGroup(page, group);

  await group.getByRole("button", { name: STRIP_ACTIONS }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  await expect.poll(() => trpc.lastInput("regex.exportScript"), { intervals: [20, 50, 100] }).toEqual({ scriptId: STRIP["id"] });
});

test("the BAND carries the import door, named for what it takes", async ({ mount, page }) => {
  await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await page.getByRole("button", { name: "reset" }).click();
  // Band chrome — visible without expanding the group, like create.
  await expect(group.getByRole("button", { name: "Import a regex script" })).toBeVisible();
});

// ── X-16 · THE EDIT STAMP (the defect: `Add script` mints indistinguishable rows) ─────────────────────

// The reported case, reproduced: two rows minted by `Add script`, both named "New script", both with an
// empty pattern. Before the stamp their subtitles were byte-identical and the list was unreadable.
//
// The two stamps are three DAYS apart, not three minutes, because the fixture is deliberately clock-free:
// `formatRelative` falls back to an absolute date once a row is older than its relative window, and two
// same-day stamps would render the same date. Three days apart discriminates under BOTH forms, which is
// the property the assertion is actually about.
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
/** Addresses the row SUBTITLES by the datum the fix adds — never by the relative text, which is clock-fed. */
const EDITED_STAMP = /edited /;
/** The whole subtitle of a just-added row: both authored discriminators are blank, then the stamp. */
const NEW_SCRIPT_SUBTITLE = /^runs nowhere · no pattern yet · edited /;
const NEW_SCRIPTS = [
  script("regex_script_new0000000001", "New script", { findRegex: "", placement: [] }),
  script("regex_script_new0000000002", "New script", { findRegex: "", placement: [], updatedAt: FIXTURE_UPDATED_AT - THREE_DAYS_MS }),
];

test("every library row carries an EDITED stamp, so freshly-added rows are not indistinguishable", async ({ mount, page }) => {
  await stub(page, NEW_SCRIPTS);
  const group = await mount(<RegexLibraryGroupStory />);
  await page.getByRole("button", { name: "reset" }).click();
  await group.getByRole("button", { name: BAND }).click();
  await expect(group.getByText("New script", { exact: true }).first()).toBeVisible();

  // Two rows, and the two subtitles must not be the same string — the stamps are three days apart.
  const subtitles = await group.getByText(EDITED_STAMP).allTextContents();
  expect(subtitles).toHaveLength(2);
  expect(subtitles[0]).not.toBe(subtitles[1]);
  // And it reads as an EDIT stamp, in the preset library's own words.
  expect(subtitles[0] ?? "").toMatch(NEW_SCRIPT_SUBTITLE);
});

// ── BULK MODE ────────────────────────────────────────────────────────────────────────────────────────

test("the band's toggle enters bulk mode, and the rows become checkboxes", async ({ mount, page }) => {
  await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await openGroup(page, group);

  // At rest the row's trailing control is its own GLOBAL switch, and no checkbox exists.
  await expect(group.getByRole("switch", { name: "strip ooc runs in every chat" })).toBeVisible();
  await expect(group.getByRole("checkbox", { name: "Select strip ooc" })).toHaveCount(0);

  const toggle = group.getByRole("button", { name: "Select scripts" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // Every row is now a checkbox, and the per-row switch is suppressed — a mode where a stray click silently
  // edits a row you meant to check is worse than no mode.
  await expect(group.getByRole("checkbox", { name: "Select strip ooc" })).toBeVisible();
  await expect(group.getByRole("checkbox", { name: "Select narrate" })).toBeVisible();
  await expect(group.getByRole("switch", { name: "strip ooc runs in every chat" })).toHaveCount(0);
  await expect(group.getByRole("button", { name: STRIP_ACTIONS })).toHaveCount(0);
});

test("the selection bar appears only once something is checked, and counts what is", async ({ mount, page }) => {
  await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await openGroup(page, group);
  await group.getByRole("button", { name: "Select scripts" }).click();

  // Armed but empty: the pressed toggle and the checkboxes already say the mode is on, so a zero-count bar
  // would be chrome repeating them.
  await expect(group.getByRole("button", { name: "Enable" })).toHaveCount(0);

  await group.getByRole("checkbox", { name: "Select strip ooc" }).click();
  await expect(group.getByRole("button", { name: "Enable" })).toBeVisible();
  await expect(group.getByText("1 selected")).toBeVisible();
  await group.getByRole("checkbox", { name: "Select narrate" }).click();
  await expect(group.getByText("2 selected")).toBeVisible();
});

test("Disable sends ONE batch naming exactly the checked scripts", async ({ mount, page }) => {
  const trpc = await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await openGroup(page, group);
  await group.getByRole("button", { name: "Select scripts" }).click();
  await group.getByRole("checkbox", { name: "Select strip ooc" }).click();
  await group.getByRole("checkbox", { name: "Select narrate" }).click();

  await group.getByRole("button", { name: "Disable" }).click();
  await expect
    .poll(() => trpc.lastInput("regex.bulkSetEnabled"), { intervals: [20, 50, 100] })
    .toEqual({ scriptIds: [STRIP["id"], NARRATE["id"]], enabled: false });
  // ONE call for the whole gesture — the reason the batch verbs exist rather than a client loop. Polled,
  // not sampled: a second call would arrive after the first, so a single read can only ever be optimistic.
  await expect.poll(() => trpc.count("regex.bulkSetEnabled"), { intervals: [50, 100, 200] }).toBe(1);
});

test("Run everywhere sends the GLOBAL batch", async ({ mount, page }) => {
  const trpc = await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await openGroup(page, group);
  await group.getByRole("button", { name: "Select scripts" }).click();
  await group.getByRole("checkbox", { name: "Select strip ooc" }).click();

  // The GLOBAL pair lives in the bar's kebab — three inline verbs is what the 330px roster column fits (see
  // the geometry pin below), and this pair is the less-frequent, binary one.
  await group.getByRole("button", { name: "More actions for 1 script" }).click();
  await page.getByRole("menuitem", { name: "Run in every chat" }).click();
  await expect.poll(() => trpc.lastInput("regex.bulkSetGlobal"), { intervals: [20, 50, 100] }).toEqual({ scriptIds: [STRIP["id"]], global: true });
});

// THE BAR HAS TO FIT THE PANE IT LIVES IN, and this is the narrowest REAL host: the config roster column.
// The sibling `character-bulk-bar` carries a header warning about exactly this — a trailing Delete clipped
// out of a ~337px panel — and this bar has FIVE verbs where that one has three. Measured against the bar's
// own box, never a px literal, so a token retune or a copy change moves the assertion with it.
test("every bulk verb is reachable inside the roster column — nothing clips off the end", async ({ mount, page }) => {
  await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await openGroup(page, group);
  await group.getByRole("button", { name: "Select scripts" }).click();
  await group.getByRole("checkbox", { name: "Select strip ooc" }).click();

  const bar = group.locator('[data-slot="selection-bar-root"]');
  await expect(bar).toBeVisible();
  const barBox = await bar.boundingBox();
  if (barBox === null) {
    throw new Error("the selection bar did not render a box");
  }
  const names = ["Enable", "Disable", "More actions for 1 script", "Clear selection"];
  // Every control must be VISIBLE before anything is measured — a box read on a control that has not
  // painted is a false negative by construction.
  await Promise.all(names.map((name) => expect(group.getByRole("button", { name, exact: true })).toBeVisible()));
  const boxes = await Promise.all(names.map((name) => group.getByRole("button", { name, exact: true }).boundingBox()));

  for (const [index, box] of boxes.entries()) {
    const name = names[index] ?? "";
    if (box === null) {
      throw new Error(`the "${name}" control did not render a box`);
    }
    expect(box.x, `"${name}" starts inside the bar`).toBeGreaterThanOrEqual(barBox.x);
    expect(box.x + box.width, `"${name}" ends inside the bar`).toBeLessThanOrEqual(barBox.x + barBox.width);
  }
});

test("bulk Delete confirms with the CASCADE named, then batches", async ({ mount, page }) => {
  const trpc = await stub(page);
  const group = await mount(<RegexLibraryGroupStory />);
  await openGroup(page, group);
  await group.getByRole("button", { name: "Select scripts" }).click();
  await group.getByRole("checkbox", { name: "Select strip ooc" }).click();
  await group.getByRole("checkbox", { name: "Select narrate" }).click();

  // Delete rides the bar's kebab — the same place the ROW's kebab homes it, and what the 330px roster column
  // actually fits (see the geometry pin above).
  await group.getByRole("button", { name: "More actions for 2 scripts" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Delete 2 scripts?")).toBeVisible();
  // The consequence a reader cannot see from the roster.
  await expect(page.getByText(BULK_DELETE_CASCADE)).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect.poll(() => trpc.lastInput("regex.bulkRemove"), { intervals: [20, 50, 100] }).toEqual({ scriptIds: [STRIP["id"], NARRATE["id"]] });
});
