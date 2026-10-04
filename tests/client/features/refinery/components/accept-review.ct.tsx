// CT: the ACCEPT review at the WORKBENCH anatomy (program #102, mockup variant C) — ONE OPEN FIELD at
// focal weight plus a queue of the rest. Every belt the pre-workbench stack carried has to survive the
// reshape, and each test below is one of them:
//   • belt 10 — every field opens UNDECIDED, undecided FAILS CLOSED, each decision is an individual press,
//     and there is no bulk gesture. The note states non-application in words.
//   • the QUEUE is addressable: a queued field can be decided where it stands, and reading it first is one
//     press away (its name is the opener).
//   • the DESTRUCTIVE-CONSENT copy rides the verb wherever it is pressed — a queued Keep on a cleared field
//     says "Keep (empties field)", never a bare Keep. This is the one that a "just collapse the rest into a
//     list" reshape silently loses.
//   • block dress still classifies off the ENTRY, not the pane: cleared state panel, inline word diff for
//     short texts, the pair for prose, the §21 three-pane conflict for a diverged field, and the ADDED
//     panel (no fabricated empty before pane) for an append.
//
// The tally chips are NOT here any more — they moved to the rewrite lane's band (the mock draws them
// beside its kicker) and are asserted in rewrite-lane.ct.tsx against the real island. The per-field state
// this file asserts is read off each queue row's `data-queue-state`, which is the same accounting one row
// down and is what a user actually sees per field.

import type { ReviewEntry } from "@orb/client/features/refinery";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { AcceptReviewStory } from "../_ct-stories.tsx";

const LONG = "A deliberately prose-length text that crosses the inline-diff threshold. ".repeat(4);
const KEEP_DESCRIPTION = /^Keep description$/;
const DISCARD_PERSONALITY = /^Discard personality$/;
const KEEP_EMPTIES_SCENARIO = /Keep \(empties field\) scenario/;
const SHOW_SCENARIO = /^scenario — show this change$/;
const SHOW_PERSONALITY = /^personality — show this change$/;
const PATIENT_SEGMENT = /patient/;

const ENTRIES: readonly ReviewEntry[] = [
  // Replaced, prose-length → the side-by-side pair.
  { entry: { field: "description", text: `${LONG}Rewritten.` }, live: LONG, original: LONG, diverged: false, payloadIndex: 0 },
  // Emptied → the cleared arm with its consequence copy.
  { entry: { field: "scenario", cleared: true }, live: "An old scenario.", original: "An old scenario.", diverged: false, payloadIndex: 1 },
  // Replaced, short → the inline word diff (FORK C).
  { entry: { field: "personality", text: "Wry and patient." }, live: "Wry.", original: "Wry.", diverged: false, payloadIndex: 2 },
];

/** One queue row by the field it names — `data-queue-state` is the row's whole accounting. */
function queueRow(page: Page, label: string): Locator {
  return page.locator(`[data-testid="refinery-queue-row"]:has-text("${label}")`);
}

test("every field opens UNDECIDED and undecided fails closed — the note states non-application until all are decided", async ({ mount, page }) => {
  await mount(<AcceptReviewStory entries={ENTRIES} />);

  // The island opens on the FIRST undecided field; the other two are queued, each with its own verbs.
  await expect(queueRow(page, "description")).toHaveAttribute("data-queue-state", "open");
  await expect(queueRow(page, "scenario")).toHaveAttribute("data-queue-state", "undecided");
  await expect(queueRow(page, "personality")).toHaveAttribute("data-queue-state", "undecided");
  const note = page.getByTestId("refinery-undecided-note");
  await expect(note).toContainText("3 blocks have no verb pressed");
  await expect(note).toContainText("NOT applied");

  // Individual presses, individual accounting — and the island ADVANCES to the next undecided field, which
  // is what the queue buys (the decision you are making is always the one in the focal position).
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await expect(queueRow(page, "description")).toHaveAttribute("data-queue-state", "kept");
  await expect(queueRow(page, "scenario")).toHaveAttribute("data-queue-state", "open");
  await expect(note).toContainText("2 blocks have no verb pressed");

  // A QUEUED field decides where it stands — this press never touches the focal position.
  await page.getByRole("button", { name: DISCARD_PERSONALITY }).click();
  await expect(queueRow(page, "personality")).toHaveAttribute("data-queue-state", "discarded");
  await expect(queueRow(page, "scenario")).toHaveAttribute("data-queue-state", "open");

  // The cleared block's Keep names the destruction (§15.4 consent copy on the verb itself).
  await page.getByRole("button", { name: KEEP_EMPTIES_SCENARIO }).click();
  await expect(queueRow(page, "scenario")).toHaveAttribute("data-queue-state", "kept");
  await expect(page.getByTestId("refinery-undecided-note")).toHaveCount(0);
  // Nothing left to decide is a DESIGNED state, never a blank island.
  await expect(page.getByText("Every field is decided")).toBeVisible();
});

test("a QUEUED cleared field carries the destructive-consent copy on its own verb, not just in the open pane", async ({ mount, page }) => {
  await mount(<AcceptReviewStory entries={ENTRIES} />);
  // `scenario` is QUEUED here (description holds the focal position), and its Keep still says what it does.
  const scenario = queueRow(page, "scenario");
  await expect(scenario).toHaveAttribute("data-queue-state", "undecided");
  await expect(scenario.getByRole("button", { name: KEEP_EMPTIES_SCENARIO })).toBeVisible();
});

test("block dress follows the ENTRY, one open field at a time: pair for prose, cleared state panel, inline word diff", async ({ mount, page }) => {
  await mount(<AcceptReviewStory entries={ENTRIES} />);

  // The OPEN field is the prose replacement — exactly one before pane and one after pane on the canvas
  // (the queue renders no panes at all, which is the whole point of the reshape).
  await expect(page.locator('[data-slot="compare-block-before"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="compare-block-after"]')).toHaveCount(1);

  // Walk to the cleared field by its name — the queue row's opener. The state panel and the field-specific
  // consequence line are its dress, and no verb has been pressed to get there.
  await page.getByRole("button", { name: SHOW_SCENARIO }).click();
  await expect(page.locator('[data-slot="compare-block-cleared"]').getByText("Cleared")).toBeVisible();
  await expect(page.getByText("This field will be emptied.")).toBeVisible();
  await expect(queueRow(page, "scenario")).toHaveAttribute("data-queue-state", "open");

  // The short replacement takes the inline word diff — token segments, so the changed word is present and
  // the block renders no before/after panes at all.
  await page.getByRole("button", { name: SHOW_PERSONALITY }).click();
  await expect(page.getByText(PATIENT_SEGMENT).first()).toBeVisible();
  await expect(page.locator('[data-slot="compare-block-before"]')).toHaveCount(0);
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
          payloadIndex: 0,
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
  await expect(queueRow(page, "description")).toHaveAttribute("data-queue-state", "kept");
});

// ── The ADDED block (fork F-T1 — a rewrite that ADDS a greeting rather than replacing one). The whole
//    reason this arm exists visually: an added greeting has NO before side, and painting an empty left
//    pane would tell the user "this was blank" about a slot that never existed. ────────────────────────

const KEEP_NEW_GREETING = /^Keep greetings \[new\]$/;
const KEEP_EMPTIES_ANY = /Keep \(empties field\)/;
const SHOW_NEW_GREETING = /^greetings \[new\] — show this change$/;

test("an APPENDED greeting renders the Added state panel — no fabricated empty before pane — and Keeps like any other field", async ({ mount, page }) => {
  await mount(
    <AcceptReviewStory
      entries={[
        // The SPLIT round: slot 0 is replaced (prose-length, so it takes the before/after PAIR — the
        // control this test needs), and a NEW slot carries the rest.
        { entry: { field: "greetings", greetingIndex: 0, text: `${LONG}The first half.` }, live: LONG, original: LONG, diverged: false, payloadIndex: 0 },
        { entry: { field: "greetings", append: true, text: "The second half." }, live: "", original: "", diverged: false, appendIndex: 0, payloadIndex: 1 },
      ]}
    />,
  );

  // The queue names what the block DOES — there is no slot number to print for a greeting that does not
  // exist yet, and inventing one would be a claim about a position the card has not got.
  const appended = queueRow(page, "greetings [new]");
  await expect(appended).toHaveAttribute("data-queue-state", "undecided");
  // The verb copy is the NEUTRAL Keep, never the cleared arm's destructive wording: adding destroys nothing.
  await expect(appended.getByRole("button", { name: KEEP_NEW_GREETING })).toBeVisible();
  await expect(page.getByRole("button", { name: KEEP_EMPTIES_ANY })).toHaveCount(0);

  // Walk into it: the ADDED state panel takes the BEFORE slot, and the added text still paints in the after
  // pane, because a review must show what it is deciding on.
  await page.getByRole("button", { name: SHOW_NEW_GREETING }).click();
  const added = page.locator('[data-slot="compare-block-added"]');
  await expect(added.getByText("Added", { exact: true })).toBeVisible();
  await expect(added).toContainText("A new greeting is added at the end — no existing greeting is touched.");
  await expect(page.locator('[data-slot="compare-block-before"]')).toHaveCount(0);
  await expect(page.getByText("The second half.")).toBeVisible();

  // …and it decides like every other field (belt 10 — fail-closed until an individual press).
  await page.getByRole("button", { name: KEEP_NEW_GREETING }).click();
  await expect(queueRow(page, "greetings [new]")).toHaveAttribute("data-queue-state", "kept");
});

test("the open block's field label sits INSIDE the box its decision border draws, never on the border", async ({ mount, page }) => {
  await mount(<AcceptReviewStory entries={ENTRIES} />);
  const block = page.locator('[data-slot="compare-block"]');
  const label = block.getByRole("heading", { name: "description" });
  await expect(label).toBeVisible();
  const inset = await block.evaluate((node) => {
    const heading = node.querySelector("h3");
    if (heading === null) {
      return null;
    }
    const outer = node.getBoundingClientRect();
    const inner = heading.getBoundingClientRect();
    const border = Number.parseFloat(getComputedStyle(node).borderTopWidth);
    return { top: inner.top - outer.top - border, left: inner.left - outer.left - border };
  });
  // Clear of the border on both edges it could touch — the padding, not a hairline.
  expect(inset?.top ?? 0).toBeGreaterThan(4);
  expect(inset?.left ?? 0).toBeGreaterThan(4);
});
