// The regex member editor's two axes, run through the registered configuration content and the real update verb.
// Each case names the defect it catches: a stored target cleared because its time does not read it, a pair that
// cannot run offered as a choice, and an author-scope pick that never reaches the stored row.
import { REGEX_TARGET_LABELS } from "@orb/client/lib";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import {
  REGEX_AUTHORS_ADD_NAME,
  REGEX_AUTHORS_ONLY_NAME,
  REGEX_REPLACE_WITH_NAME,
  REGEX_STANDING_HOST_NAME,
  REGEX_WHEN_CHOICE_NAMES,
  REGEX_WHEN_FIELD_NAME,
} from "#client/features/regex/lib/regex-names.ts";
import type { RegexMemberSaveStory } from "./_member-save-stories.tsx";

const STORY = "tests/client/features/regex/surfaces/_member-save-stories/RegexMemberSaveStory";
const PROCEDURES = [...SECTION_PROCEDURES, "regex.listScripts", "regex.listGlobal", "regex.updateScript", "persona.list"] as const;

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

test("a stored target its time does not read stays selected through an edit and applies once the time reads it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  // A save-time script holding world info: the shape a migrated script arrives in, and one the write schema accepts.
  const script = await caller.regex.createScript({
    input: { name: "Lore trim", findRegex: "x", replaceString: "y", targets: ["USER_INPUT", "WORLD_INFO"], passes: ["save"] },
  });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof RegexMemberSaveStory>(STORY, { scriptId: script.id });
  const stored = async (): Promise<{ readonly targets: readonly string[]; readonly passes: readonly string[]; readonly replaceString: string } | undefined> =>
    (await caller.regex.listScripts()).find((row) => row.id === script.id);

  const worldInfo = page.getByRole("button", { name: REGEX_TARGET_LABELS.WORLD_INFO, exact: true });
  await expect(worldInfo).toHaveAttribute("aria-pressed", "true");
  // Still removable: a kept target is a choice its owner can undo, never a locked one.
  await expect(worldInfo).toBeEnabled();

  const replace = page.getByRole("textbox", { name: REGEX_REPLACE_WITH_NAME, exact: true });
  await replace.fill("z");
  await replace.press("Tab");
  await expect.poll(async () => (await stored())?.replaceString).toBe("z");
  expect((await stored())?.targets).toEqual(["USER_INPUT", "WORLD_INFO"]);

  await page.getByRole("combobox", { name: REGEX_WHEN_FIELD_NAME, exact: true }).click();
  await page.getByRole("option", { name: REGEX_WHEN_CHOICE_NAMES.prompt, exact: true }).click();
  await expect.poll(async () => (await stored())?.passes).toEqual(["prompt"]);
  expect((await stored())?.targets).toEqual(["USER_INPUT", "WORLD_INFO"]);
});

test("a time that reads none of the chosen text is offered disabled", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const lore = await caller.regex.createScript({
    input: { name: "Lore only", findRegex: "x", replaceString: "y", targets: ["WORLD_INFO"], passes: ["prompt"] },
  });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof RegexMemberSaveStory>(STORY, { scriptId: lore.id });

  await page.getByRole("combobox", { name: REGEX_WHEN_FIELD_NAME, exact: true }).click();
  await expect(page.getByRole("option", { name: REGEX_WHEN_CHOICE_NAMES.save, exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("option", { name: REGEX_WHEN_CHOICE_NAMES.display, exact: true })).toHaveAttribute("aria-disabled", "true");
  // The positive control: a choice that reads world info is offered.
  await expect(page.getByRole("option", { name: REGEX_WHEN_CHOICE_NAMES.displayAndPrompt, exact: true })).not.toHaveAttribute("aria-disabled", "true");
});

test("a text the chosen time cannot read cannot be added", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const saved = await caller.regex.createScript({
    input: { name: "Saved only", findRegex: "x", replaceString: "y", targets: ["USER_INPUT"], passes: ["save"] },
  });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof RegexMemberSaveStory>(STORY, { scriptId: saved.id });

  await expect(page.getByRole("button", { name: REGEX_TARGET_LABELS.WORLD_INFO, exact: true })).toBeDisabled();
  // The positive control: a text the save pass reads can still be added.
  await expect(page.getByRole("button", { name: REGEX_TARGET_LABELS.REASONING, exact: true })).toBeEnabled();
});

test("picking the host in the only-from list stores a standing selector on the script", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const script = await caller.regex.createScript({
    input: { name: "Host tint", findRegex: "x", replaceString: "y", targets: ["USER_INPUT"], passes: ["display"] },
  });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof RegexMemberSaveStory>(STORY, { scriptId: script.id });

  await page.getByRole("button", { name: `${REGEX_AUTHORS_ADD_NAME} to ${REGEX_AUTHORS_ONLY_NAME}`, exact: true }).click();
  await page.getByRole("menuitem", { name: REGEX_STANDING_HOST_NAME, exact: true }).click();
  await expect
    .poll(async () => (await caller.regex.listScripts()).find((row) => row.id === script.id)?.authors)
    .toEqual({ include: [{ by: "standing", standing: "host" }], exclude: [] });
});
