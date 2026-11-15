// The regex editor's tester and pipeline run a script in the display-pass Worker, so a pattern that backtracks for
// minutes on a short near-miss stops at the Worker's deadline and the page keeps answering.
// @subject packages/client/src/features/regex/components/regex-test-panel.tsx
// @subject packages/client/src/features/regex/components/regex-pipeline-panel.tsx
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { REGEX_PREVIEW_RUNNING, REGEX_PREVIEW_STOPPED, REGEX_SAMPLE_TEXT_NAME, REGEX_TEXT_GOING_IN_NAME } from "#client/features/regex/lib/regex-names.ts";
import type { RegexMemberSaveStory } from "./_member-save-stories.tsx";

const STORY = "tests/client/features/regex/surfaces/_member-save-stories/RegexMemberSaveStory";
const PROCEDURES = [...SECTION_PROCEDURES, "regex.listScripts", "regex.listGlobal", "regex.updateScript", "persona.list"] as const;
const STAGE = '[data-slot="regex-pipeline-stage"]';
// Nested quantifiers over a run of `a` with no match at the end: each extra `a` doubles the backtracking, so forty is
// far past any deadline on any machine.
const RUNAWAY = "(a+)+$";
const NEAR_MISS = `${"a".repeat(40)}b`;
// How long the page may take to answer a trivial evaluate once the sample is in: the Worker's deadline plus a frame.
const ANSWER_MS = 5000;

test("a runaway pattern on a near-miss sample stops in the Worker and the page keeps answering", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const script = await caller.regex.createScript({
    input: { name: "Runaway", findRegex: RUNAWAY, replaceString: "", targets: ["AI_OUTPUT"], passes: ["display"] },
  });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof RegexMemberSaveStory>(STORY, { scriptId: script.id });

  const sample = page.getByRole("textbox", { name: REGEX_SAMPLE_TEXT_NAME, exact: true });
  await expect(sample).toBeVisible();
  // Positive control: both panels answer the default sample, so the stops below come from runs that happened. The
  // pipeline draws its stages only once its run has answered.
  await expect(page.locator(STAGE).first()).toBeVisible();
  await expect(page.getByText(REGEX_PREVIEW_RUNNING, { exact: true })).toHaveCount(0);
  await expect(page.getByText(REGEX_PREVIEW_STOPPED, { exact: true })).toHaveCount(0);

  await sample.fill(NEAR_MISS);
  // A page whose main thread is backtracking answers no evaluate, so this poll times out on a main-thread run.
  await expect.poll(() => page.evaluate(() => true), { timeout: ANSWER_MS }).toBe(true);
  await expect(page.getByText(REGEX_PREVIEW_STOPPED, { exact: true })).toHaveCount(1);
  // The pipeline reads the same stop: its stage for this script says it was stopped without running it again.
  await page.getByRole("textbox", { name: REGEX_TEXT_GOING_IN_NAME, exact: true }).fill(NEAR_MISS);
  await expect(page.getByText(REGEX_PREVIEW_STOPPED, { exact: true })).toHaveCount(2);
});
