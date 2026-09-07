// CT: THE PIPELINE DEBUGGER (REGX2) — "what will my scripts do to this text, on this stream, in what order".
//
// The tester one section up answers a DIFFERENT question and must keep answering it: it neutralises the run
// gates so a switched-off draft still previews. This panel honours them and names the gate that skipped each
// script. These pins hold both halves apart on purpose — a future "simplification" that unified them would
// have to delete one of these tests first.
//
// Asserted through what the reader SEES: the stage headings in order, the status line each stage prints, the
// final text, and the caveats the panel refuses to leave unsaid. Never through the model function (that is
// pinned separately at tests/client/features/regex/lib/regex-pipeline.test.ts).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { RegexMemberStory } from "../_ct-stories.tsx";

/** The subject — the script whose editor the panel sits under. It strips parenthesised OOC asides. */
const SUBJECT = {
  id: "regex_script_stripooc",
  name: "strip ooc",
  findRegex: "\\(ooc\\)",
  replaceString: "",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  // A fixed edit stamp (X-16's `RegexScriptRow.updatedAt`) — the wall clock never reaches a fixture.
  updatedAt: 1_760_000_000_000,
  substituteRegex: 0,
};

/** An always-on script that runs BEFORE the subject when both are global — it shouts the word "loud". */
const SHOUT = {
  ...SUBJECT,
  id: "regex_script_shout0000000",
  name: "shout",
  findRegex: "quiet",
  replaceString: "LOUD",
};

/** An always-on script that is SWITCHED OFF — the gate the panel must name rather than silently drop. */
const OFF = { ...SHOUT, id: "regex_script_off000000000", name: "sleeper", enabled: false, findRegex: "goblin", replaceString: "ORC" };

const STREAM = "Model output";
const SAMPLE = "the quiet goblin says (ooc) hush";

/** The two limits the panel refuses to leave unsaid — matched loosely, since the sentence around each is
 *  copy and the FACT is what is pinned. */
const OTHER_SCOPES_CAVEAT = /adds its own scripts AFTER these/;
const DEPTH_CAVEAT = /this script’s depth range is not applied/;

function stub(page: Page, globals: readonly unknown[], subject: Record<string, unknown> = SUBJECT): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => [subject],
    "regex.listGlobal": () => globals,
    "regex.updateScript": () => subject,
  });
}

/** Put the panel on the leg the fixtures run on and give it a sample with something for each to bite. */
async function drive(page: Page): Promise<void> {
  await page.getByRole("combobox", { name: "Stream" }).click();
  await page.getByRole("option", { name: STREAM }).click();
  await page.getByLabel("Text going in").fill(SAMPLE);
}

test("the panel mounts beside the tester, not instead of it — two questions, two sections", async ({ mount, page }) => {
  await stub(page, []);
  await mount(<RegexMemberStory />);
  await expect(page.getByRole("heading", { name: "Try it" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "In the pipeline" })).toBeVisible();
});

test("the always-on tier runs IN ORDER, and the subject is marked in its own place", async ({ mount, page }) => {
  // The subject IS global here, sitting second in the tier's authored junction order.
  await stub(page, [SHOUT, SUBJECT]);
  await mount(<RegexMemberStory />);
  await drive(page);

  const stages = page.locator('[data-slot="regex-pipeline-stage"]');
  await expect(stages).toHaveCount(2);
  // The ORDER is the junction's, not the library's — position 1 runs first.
  await expect(stages.nth(0)).toContainText("1 · shout");
  await expect(stages.nth(1)).toContainText("2 · strip ooc");
  // The reader can find their own script without matching names by eye. SENTENCE CASE since 2026-08-19 —
  // the marker is inside a `<Section kicker>`, whose micro-caps voice INHERITS, so the badge shipped as
  // all-caps body text; the fix is `normal-case` on the badge plus a capital on the source string, and
  // `toContainText` reads the source string (textContent), never the painted transform.
  await expect(stages.nth(1)).toContainText("This script");
  await expect(stages.nth(0)).not.toContainText("This script");

  // Both bit, and the text handed on carries BOTH transformations — which is the whole claim of a pipeline
  // view over two single-script previews.
  await expect(page.getByLabel("Text after the whole stream")).toHaveValue("the LOUD goblin says  hush");
});

test("a script that sits out says WHICH gate skipped it, and passes the text through untouched", async ({ mount, page }) => {
  await stub(page, [OFF, SUBJECT]);
  await mount(<RegexMemberStory />);
  await drive(page);

  const stages = page.locator('[data-slot="regex-pipeline-stage"]');
  await expect(stages.nth(0)).toContainText("1 · sleeper");
  await expect(stages.nth(0)).toContainText("Skipped — switched off.");
  // Its replacement never happened: "goblin" survives to the end.
  await expect(page.getByLabel("Text after the whole stream")).toHaveValue("the quiet goblin says  hush");
});

test("switching the stream re-runs the leg — a script off this stream is named as such", async ({ mount, page }) => {
  await stub(page, [SUBJECT]);
  await mount(<RegexMemberStory />);
  await drive(page);
  await expect(page.locator('[data-slot="regex-pipeline-stage"]').first()).toContainText("1 match");

  await page.getByRole("combobox", { name: "Stream" }).click();
  await page.getByRole("option", { name: "Your message" }).click();
  // Same script, same sample, different leg: the fixture only declares AI_OUTPUT.
  await expect(page.locator('[data-slot="regex-pipeline-stage"]').first()).toContainText("Skipped — doesn’t run on this stream.");
  await expect(page.getByLabel("Text after the whole stream")).toHaveValue(SAMPLE);
});

test("a script that is NOT always-on is shown LAST, marked for where it really runs", async ({ mount, page }) => {
  // The subject is absent from the global tier, so it is appended after it.
  await stub(page, [SHOUT]);
  await mount(<RegexMemberStory />);
  await drive(page);

  const stages = page.locator('[data-slot="regex-pipeline-stage"]');
  await expect(stages).toHaveCount(2);
  await expect(stages.nth(1)).toContainText("2 · strip ooc");
  await expect(stages.nth(1)).toContainText("This script, wherever it’s attached");
  // …and it is a SENTENCE, not a caps clause: the inherited kicker transform is stood down on the badge.
  const marker = stages.nth(1).locator('[data-slot="badge"]').filter({ hasText: "wherever" });
  await expect(marker).toHaveCSS("text-transform", "none");
  // …and the CAPS TRACKING goes with the caps (side-eye 2026-08-19 P3). `letter-spacing` inherits exactly
  // like `text-transform` does, so standing down only the transform left a sentence wearing the kicker's
  // 0.08em micro tracking — 0.84px of air between letters of running prose, at 13px.
  await expect(marker).toHaveCSS("letter-spacing", "normal");
  await expect(page.getByText("This script isn’t in the always-on set")).toBeVisible();
});

test("the panel runs the LIVE authored values, not the saved row", async ({ mount, page }) => {
  await stub(page, [SUBJECT]);
  await mount(<RegexMemberStory />);
  await drive(page);
  await expect(page.getByLabel("Text after the whole stream")).toHaveValue("the quiet goblin says  hush");

  // Change the replacement in the editor above and the run moves with the keystroke — the reason the panel
  // reads form state rather than the query's row.
  await page.getByLabel("Replace with").fill("[cut]");
  await expect(page.getByLabel("Text after the whole stream")).toHaveValue("the quiet goblin says [cut] hush");
});

// ── WHAT IT REFUSES TO IMPLY ────────────────────────────────────────────────────────────────────────────
// A library page has no room, no cast and no active preset, and a loose sample has no position in an
// assembled history. Both limits are stated in the panel's own words — the tester's discipline, applied to a
// run instead of to a pattern.

test("it states that preset / character / room scripts are not in this run", async ({ mount, page }) => {
  await stub(page, [SUBJECT]);
  await mount(<RegexMemberStory />);
  await expect(page.getByText(OTHER_SCOPES_CAVEAT)).toBeVisible();
});

test("on the history leg with a depth bound, it says the bound is not honoured here", async ({ mount, page }) => {
  const scoped = { ...SUBJECT, placement: ["PROMPT_HISTORY"], historyDepth: { min: 3, max: null } };
  await stub(page, [scoped], scoped);
  await mount(<RegexMemberStory />);
  await page.getByRole("combobox", { name: "Stream" }).click();
  await page.getByRole("option", { name: "History sent to the model" }).click();
  await expect(page.getByText(DEPTH_CAVEAT)).toBeVisible();
});
