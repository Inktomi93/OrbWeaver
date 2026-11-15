// The regex library's bulk axes picker, run through the shell's real config list, the bulk bar and `regex.bulkSetAxes`.
// Each case names the defect it catches: an Apply that stores a run-nowhere pair or drops each script's own depth, and
// a when-saved Apply that clears a script's depth without naming it.
import { REGEX_TARGET_LABELS } from "@orb/client/lib";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import {
  REGEX_BULK_AXES_NAME,
  REGEX_GROUP_LABEL,
  REGEX_SELECT_SCRIPTS_NAME,
  REGEX_WHEN_CHOICE_NAMES,
  REGEX_WHEN_FIELD_NAME,
} from "#client/features/regex/lib/regex-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const PROCEDURES = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "regex.listScripts", "regex.listGlobal", "regex.bulkSetAxes"] as const;
const PLAIN_NAME = "Plain";
const SCOPED = createRegexScriptSchema.parse({
  name: "Recent turns",
  findRegex: "a",
  replaceString: "b",
  targets: ["AI_OUTPUT"],
  passes: ["prompt"],
  depth: { min: 0, max: 3 },
});

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
type Corpus = Parameters<typeof createShellAmbientReads>[0];

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

/** Seeds a script with a depth and one without, and serves the shell on the config section. */
async function prepare(page: Page, root: Root, corpus: Corpus): Promise<{ readonly caller: Caller; readonly scopedId: string; readonly plainId: string }> {
  const caller = await root.internalCallerFor(root.ownerId);
  const scoped = await caller.regex.createScript({ input: SCOPED });
  const plain = await caller.regex.createScript({ input: { ...SCOPED, name: PLAIN_NAME, depth: undefined } });
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, PROCEDURES) });
  await seedShellState(page, { activeSection: "config" });
  return { caller, scopedId: scoped.id, plainId: plain.id };
}

/** Selects both scripts the way a person does and opens the picker from the bulk bar's menu. */
async function openPicker(page: Page): Promise<Locator> {
  await page
    .getByRole("button", { name: new RegExp(`^${REGEX_GROUP_LABEL}`, "u") })
    .first()
    .click();
  await page.getByRole("button", { name: REGEX_SELECT_SCRIPTS_NAME, exact: true }).click();
  // The corpus library holds other scripts; only the two this case seeded are selected. A row's name carries its edit
  // stamp beside the title, so the checkbox is found by the title it contains.
  for (const name of [SCOPED.name, PLAIN_NAME]) {
    const checkbox = page.getByRole("checkbox", { name });
    await checkbox.scrollIntoViewIfNeeded();
    await checkbox.click();
  }
  await page.locator('[data-slot="selection-bar-root"] [aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: REGEX_BULK_AXES_NAME, exact: true }).click();
  return page.getByRole("dialog");
}

async function chooseWhen(dialog: Locator, page: Page, when: keyof typeof REGEX_WHEN_CHOICE_NAMES): Promise<void> {
  await dialog.getByRole("combobox", { name: REGEX_WHEN_FIELD_NAME, exact: true }).click();
  await page.getByRole("option", { name: REGEX_WHEN_CHOICE_NAMES[when], exact: true }).click();
}

test("Apply waits for both axes, then replaces them on every selected script and keeps each one's depth", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, scopedId, plainId } = await prepare(page, root, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const dialog = await openPicker(page);

  const apply = dialog.getByRole("button", { name: DIALOG_VERBS.apply, exact: true });
  await expect(apply).toBeDisabled();
  await dialog.getByRole("button", { name: REGEX_TARGET_LABELS.USER_INPUT, exact: true }).click();
  // One axis set is still a run-nowhere pair.
  await expect(apply).toBeDisabled();
  await chooseWhen(dialog, page, "display");
  await expect(apply).toBeEnabled();
  await apply.click();

  await expect.poll(async () => (await caller.regex.listScripts()).find((row) => row.id === plainId)?.passes).toEqual(["display"]);
  const rows = await caller.regex.listScripts();
  expect(rows.find((row) => row.id === plainId)).toMatchObject({ targets: ["USER_INPUT"], passes: ["display"] });
  expect(rows.find((row) => row.id === scopedId)).toMatchObject({ targets: ["USER_INPUT"], passes: ["display"], depth: { min: 0, max: 3 } });
});

test("a when-saved Apply clears a script's depth and names that script", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, scopedId, plainId } = await prepare(page, root, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const dialog = await openPicker(page);

  await dialog.getByRole("button", { name: REGEX_TARGET_LABELS.AI_OUTPUT, exact: true }).click();
  await chooseWhen(dialog, page, "save");
  await dialog.getByRole("button", { name: DIALOG_VERBS.apply, exact: true }).click();

  await expect.poll(async () => (await caller.regex.listScripts()).find((row) => row.id === scopedId)?.passes).toEqual(["save"]);
  const rows = await caller.regex.listScripts();
  expect(rows.find((row) => row.id === scopedId)?.depth).toBeUndefined();
  expect(rows.find((row) => row.id === plainId)?.passes).toEqual(["save"]);
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toContainText(SCOPED.name);
  // The positive control for the naming: the script with no depth to clear changed, and the toast leaves it out.
  await expect(toast).not.toContainText(PLAIN_NAME);
});
