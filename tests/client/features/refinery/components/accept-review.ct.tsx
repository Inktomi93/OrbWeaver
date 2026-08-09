// CT: the ACCEPT review (arm B, ruled) — belt 10 rendered as UI. Every block opens UNDECIDED and
// undecided FAILS CLOSED (the note states non-application); each Keep is an individual verb press; the
// cleared arm states its consequence; a DIVERGED field gets the §21 three-pane conflict treatment whose
// Keep is the informed re-confirmation. The counts chips are the review's own accounting, asserted
// through the real controlled lifecycle (the story holds state exactly as the content surface does).

import type { ReviewEntry } from "@orb/client/features/refinery";
import { expect, test } from "@playwright/experimental-ct-react";
import { AcceptReviewStory } from "../_ct-stories.tsx";

const LONG = "A deliberately prose-length text that crosses the inline-diff threshold. ".repeat(4);
const KEEP_DESCRIPTION = /^Keep description$/;
const DISCARD_PERSONALITY = /^Discard personality$/;
const KEEP_EMPTIES_SCENARIO = /Keep \(empties field\) scenario/;
const PATIENT_SEGMENT = /patient/;

const ENTRIES: readonly ReviewEntry[] = [
  // Replaced, prose-length → the side-by-side pair.
  { entry: { field: "description", text: `${LONG}Rewritten.` }, live: LONG, original: LONG, diverged: false },
  // Emptied → the cleared arm with its consequence copy.
  { entry: { field: "scenario", cleared: true }, live: "An old scenario.", original: "An old scenario.", diverged: false },
  // Replaced, short → the inline word diff (FORK C).
  { entry: { field: "personality", text: "Wry and patient." }, live: "Wry.", original: "Wry.", diverged: false },
];

test("every block opens UNDECIDED and undecided fails closed — the note states non-application until all are decided", async ({ mount, page }) => {
  await mount(<AcceptReviewStory entries={ENTRIES} />);
  await expect(page.getByText("0 kept", { exact: true })).toBeVisible();
  await expect(page.getByText("3 undecided", { exact: true })).toBeVisible();
  const note = page.getByTestId("refinery-undecided-note");
  await expect(note).toContainText("3 blocks have no verb pressed");
  await expect(note).toContainText("NOT applied");

  // Individual presses, individual accounting.
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await expect(page.getByText("1 kept", { exact: true })).toBeVisible();
  await expect(page.getByText("2 undecided", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: DISCARD_PERSONALITY }).click();
  await expect(page.getByText("1 discarded", { exact: true })).toBeVisible();
  await expect(page.getByText("1 undecided", { exact: true })).toBeVisible();
  // The cleared block's Keep names the destruction (§15.4 consent copy on the verb itself).
  await page.getByRole("button", { name: KEEP_EMPTIES_SCENARIO }).click();
  await expect(page.getByText("0 undecided", { exact: true })).toBeVisible();
  await expect(page.getByTestId("refinery-undecided-note")).toHaveCount(0);
});

test("block dress follows the entry: cleared state panel with consequence, inline word-diff for short texts, pair for prose", async ({ mount, page }) => {
  await mount(<AcceptReviewStory entries={ENTRIES} />);
  // Cleared: the state panel + the field-specific consequence line.
  await expect(page.locator('[data-slot="compare-block-cleared"]').getByText("Cleared")).toBeVisible();
  await expect(page.getByText("This field will be emptied.")).toBeVisible();
  // Short replacement: the inline diff body (no before/after panes for that block) — the diff view
  // renders token segments, so the changed word is present.
  await expect(page.getByText(PATIENT_SEGMENT).first()).toBeVisible();
  // Pane accounting: the prose pair AND the cleared block each show a before pane (the cleared block's
  // left side is the live text being destroyed); only the prose pair has an after pane — the inline-diff
  // block replaced its body wholesale.
  await expect(page.locator('[data-slot="compare-block-before"]')).toHaveCount(2);
  await expect(page.locator('[data-slot="compare-block-after"]')).toHaveCount(1);
});

test("a DIVERGED field renders the three-pane conflict — base, live, rewrite — words first, and Keep re-confirms", async ({ mount, page }) => {
  await mount(
    <AcceptReviewStory
      entries={[
        {
          entry: { field: "description", text: "The rewrite's text." },
          live: "Edited under the session.",
          original: "The session pin's text.",
          diverged: true,
        },
      ]}
    />,
  );
  await expect(page.getByText("changed since the session started")).toBeVisible();
  await expect(page.getByText("Base — the session pin")).toBeVisible();
  await expect(page.getByText("Live — changed under the session")).toBeVisible();
  await expect(page.getByText("Rewrite — what Keep applies")).toBeVisible();
  await expect(page.getByText("Edited under the session.")).toBeVisible();
  await expect(page.getByText("The session pin's text.")).toBeVisible();
  // The conflict block still speaks the ONE accept grammar: Keep/Discard verbs, tri-state.
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await expect(page.getByText("1 kept", { exact: true })).toBeVisible();
});

// ── The ADDED block (fork F-T1 — a rewrite that ADDS a greeting rather than replacing one). The whole
//    reason this arm exists visually: an added greeting has NO before side, and painting an empty left
//    pane would tell the user "this was blank" about a slot that never existed. ────────────────────────

const KEEP_NEW_GREETING = /^Keep greetings \[new\]$/;
const KEEP_EMPTIES_ANY = /Keep \(empties field\)/;

test("an APPENDED greeting renders the Added state panel — no fabricated empty before pane — and Keeps like any other block", async ({ mount, page }) => {
  await mount(
    <AcceptReviewStory
      entries={[
        // The SPLIT round: slot 0 is replaced (prose-length, so it takes the before/after PAIR — the
        // control this test needs), and a NEW slot carries the rest.
        { entry: { field: "greetings", greetingIndex: 0, text: `${LONG}The first half.` }, live: LONG, original: LONG, diverged: false },
        { entry: { field: "greetings", append: true, text: "The second half." }, live: "", original: "", diverged: false, appendIndex: 0 },
      ]}
    />,
  );

  // The label says what the block DOES — there is no slot number to print for a greeting that does not
  // exist yet, and inventing one would be a claim about a position the card has not got.
  await expect(page.getByRole("heading", { name: "greetings [new]" })).toBeVisible();
  // The ADDED state panel takes the BEFORE slot; the added text still paints in the after pane, because a
  // review must show what it is deciding on.
  const added = page.locator('[data-slot="compare-block-added"]');
  await expect(added.getByText("Added", { exact: true })).toBeVisible();
  await expect(added).toContainText("A new greeting is added at the end — no existing greeting is touched.");
  // Exactly ONE before pane in the round — the REPLACEMENT's (a live control that the pair renders at all).
  // The append fabricates none: an empty left pane would read as "this greeting was blank", which is a lie.
  await expect(page.locator('[data-slot="compare-block-before"]')).toHaveCount(1);
  await expect(page.getByText("The second half.")).toBeVisible();
  // The verb copy is the NEUTRAL Keep, never the cleared arm's destructive wording: adding destroys nothing.
  await expect(page.getByRole("button", { name: KEEP_NEW_GREETING })).toBeVisible();
  await expect(page.getByRole("button", { name: KEEP_EMPTIES_ANY })).toHaveCount(0);

  // …and it decides like every other block (belt 10 — fail-closed until an individual press).
  await expect(page.getByText("2 undecided", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: KEEP_NEW_GREETING }).click();
  await expect(page.getByText("1 kept", { exact: true })).toBeVisible();
});
