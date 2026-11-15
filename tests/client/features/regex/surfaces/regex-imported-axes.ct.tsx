// An imported SillyTavern script keeps the passes and targets its import gave it through every edit that is not an
// axes change: a save of another field in the real editor, and the bulk bar's Disable and Enable. The defect it
// catches is a save that derives a pass from the script's targets, which turned an imported display-only script into
// one that rewrites stored replies.
// @subject packages/client/src/features/regex/components/regex-editor-fields.tsx
// @subject packages/client/src/features/regex/components/regex-bulk-bar.tsx
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  REGEX_BULK_DISABLE_NAME,
  REGEX_BULK_ENABLE_NAME,
  REGEX_GROUP_LABEL,
  REGEX_REPLACE_WITH_NAME,
  REGEX_SELECT_SCRIPTS_NAME,
} from "#client/features/regex/lib/regex-names.ts";
import type { RegexMemberSaveStory } from "./_member-save-stories.tsx";

const MEMBER_STORY = "tests/client/features/regex/surfaces/_member-save-stories/RegexMemberSaveStory";
const SHELL_STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const MEMBER_PROCEDURES = [...SECTION_PROCEDURES, "regex.listScripts", "regex.listGlobal", "regex.updateScript", "persona.list"] as const;
const SHELL_PROCEDURES = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "regex.listScripts", "regex.listGlobal", "regex.bulkSetEnabled"] as const;

// SillyTavern's own script file, with integer placements: 2 is the AI reply. `markdownOnly` is its display-only box
// and `promptOnly` its prompt-only box.
const ST_SCRIPT = {
  trimStrings: [],
  placement: [2],
  disabled: false,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};
const IMPORTED = [
  { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000051", scriptName: "Imported panel", findRegex: "<panel>", replaceString: "PANEL", markdownOnly: true },
  { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000052", scriptName: "Imported prompt note", findRegex: "<note>", replaceString: "", promptOnly: true },
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
type Axes = Pick<RegexScriptRow, "passes" | "targets">;

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

/** Imports both scripts through the library's file door and returns each stored row by name. */
async function importBoth(caller: Caller): Promise<readonly RegexScriptRow[]> {
  for (const script of IMPORTED) {
    await caller.regex.importScriptFile({ fileText: JSON.stringify(script) });
  }
  const rows = await caller.regex.listScripts();
  return IMPORTED.map(({ scriptName }) => {
    const row = rows.find((candidate) => candidate.name === scriptName);
    if (row === undefined) {
      throw new Error(`The import stored no script named ${scriptName}`);
    }
    return row;
  });
}

const axesOf = ({ passes, targets }: Axes): Axes => ({ passes, targets });

async function storedAxes(caller: Caller, id: RegexScriptRow["id"]): Promise<Axes | undefined> {
  const row = (await caller.regex.listScripts()).find((candidate) => candidate.id === id);
  return row === undefined ? undefined : axesOf(row);
}

test("an imported display-only or prompt-only script keeps its passes and targets when another field is saved", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const rows = await importBoth(caller);
  // The control: the import gave each its one pass, so a save that keeps them keeps something worth keeping.
  expect(rows.map((row) => row.passes)).toEqual([["display"], ["prompt"]]);
  await routeTrpc(page, serveCorpusProcedures(caller, MEMBER_PROCEDURES));
  for (const row of rows) {
    const component = await mount<typeof RegexMemberSaveStory>(MEMBER_STORY, { scriptId: row.id });
    const field = page.getByRole("textbox", { name: REGEX_REPLACE_WITH_NAME, exact: true });
    await expect(field).toHaveValue(row.replaceString);
    await field.fill(`${row.replaceString} edited`);
    await field.press("Tab");
    await expect
      .poll(async () => (await caller.regex.listScripts()).find((candidate) => candidate.id === row.id)?.replaceString)
      .toBe(`${row.replaceString} edited`);
    expect(await storedAxes(caller, row.id)).toEqual(axesOf(row));
    await component.unmount();
  }
});

/** Checks the imported scripts in the library list, in select mode, the way a person does. */
async function selectImported(page: Page): Promise<void> {
  for (const { scriptName } of IMPORTED) {
    const checkbox = page.getByRole("checkbox", { name: scriptName });
    await checkbox.scrollIntoViewIfNeeded();
    await checkbox.click();
  }
}

test("the bulk bar's Disable and Enable leave imported scripts' passes and targets as imported", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const rows = await importBoth(caller);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SHELL_PROCEDURES) });
  await seedShellState(page, { activeSection: "config" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await page
    .getByRole("button", { name: new RegExp(`^${REGEX_GROUP_LABEL}`, "u") })
    .first()
    .click();
  // Select mode stays on after a switch write clears the selection, so it is entered once.
  await page.getByRole("button", { name: REGEX_SELECT_SCRIPTS_NAME, exact: true }).click();

  const bar = page.locator('[data-slot="selection-bar-root"]');
  for (const [verb, enabled] of [
    [REGEX_BULK_DISABLE_NAME, false],
    [REGEX_BULK_ENABLE_NAME, true],
  ] as const) {
    // A switch write clears the selection, so each verb checks the scripts again.
    await selectImported(page);
    await bar.getByRole("button", { name: verb, exact: true }).click();
    await expect
      .poll(async () => (await caller.regex.listScripts()).filter((row) => rows.some(({ id }) => id === row.id)).map((row) => row.enabled))
      .toEqual([enabled, enabled]);
    for (const row of rows) {
      expect(await storedAxes(caller, row.id)).toEqual(axesOf(row));
    }
  }
});
