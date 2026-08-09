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
