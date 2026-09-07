// CT: the compare-blocks seal — before/after review pairs. ONE component renders both the
// single full-text-pair shape (blocks.length === 1) and the multi-field itemized shape (length N);
// the tint pair is intent-token only (danger/success) plus a non-color glyph + sr-only text so a
// colorblind reader can still tell the sides apart. Accept/accept-all is controlled.
//
// THE SIDE-PAIR TINT IS ASSERTED AGAINST A DOCUMENT-RESOLVED PROBE, not a literal and not the bare token
// (2026-08-17, program #102). The panes went from a SOLID intent fill to the rationed
// `border-<intent>/40 bg-<intent>/10` register (CD3 — see the variants header's stated fork), so
// `toHaveCSS(bg, resolvedTokenColor("color.destructive"))` is exactly the assertion that must now be
// FALSE. Its replacement resolves the expected value from the SAME document by planting the CSS the
// utility emits and reading back what the browser computed — §13.7's "never a hardcoded oklch()" holds
// (the expectation is still token-derived), and the check is self-verifying: if Tailwind's emitted
// `color-mix` differs from the probe's, this goes red rather than silently agreeing.
//
// THE PROBE IS ATTACHED TO THE DOCUMENT BEFORE IT IS READ — `getComputedStyle` on a DETACHED element
// returns "" for every property, which would make both sides compare equal to "" and invert the whole
// assertion into a silent pass.
import type { CompareBlock } from "@orb/ui/compare-blocks";
import { CompareBlocks } from "@orb/ui/compare-blocks";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";
import { AcceptHarness, ReviewHarness } from "./compare-blocks.fixtures.tsx";

/** What the browser computes for `bg-<intent>/10` — resolved in the page, off the live token custom
 *  property, via a probe element that is IN the document while it is measured. */
function resolvedTint(page: Page, token: string): Promise<string> {
  return page.evaluate((cssVar) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `color-mix(in oklab, var(${cssVar}) 10%, transparent)`;
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, token);
}

const KEEP_NAME = /^Keep Name$/;
const DISCARD_CLASS = /^Discard Class$/;
const KEEP_EMPTIES_SCENARIO = /Keep \(empties field\) Scenario/;

const TWO_BLOCKS: readonly CompareBlock[] = [
  { label: "Name", before: "Aria", after: "Aria Nightshade" },
  { label: "Class", before: "Rogue", after: "Assassin" },
];

test("a single block renders one before/after pair with intent-token tints", async ({ mount, page }) => {
  await mount(<CompareBlocks blocks={[{ before: "The cat sat.", after: "The cat sat quietly." }]} />);
  const before = page.locator('[data-slot="compare-block-before"]');
  const after = page.locator('[data-slot="compare-block-after"]');
  // The tint each side actually paints, derived from its own intent token in this document.
  await expect(before).toHaveCSS("background-color", await resolvedTint(page, "--color-destructive"));
  await expect(after).toHaveCSS("background-color", await resolvedTint(page, "--color-success"));
  // …and it is a TINT, not the solid intent fill: reverting the variant to `bg-destructive` reds here
  // (the CD3 accent-fill ration — the variants header states the fork).
  await expect(before).not.toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
  await expect(after).not.toHaveCSS("background-color", resolvedTokenColor("color.success"));
  await expect(page.getByText("The cat sat.", { exact: true })).toBeVisible();
  await expect(page.getByText("The cat sat quietly.")).toBeVisible();
  // Non-color signal: the sides carry sr-only text beyond the tint alone.
  await expect(before.getByText("Before")).toBeAttached();
  await expect(after.getByText("After")).toBeAttached();
  await expect(page.locator('[data-slot="compare-block"]')).toHaveCount(1);
});

test("N blocks render one pair per item, each with its own label", async ({ mount, page }) => {
  await mount(<CompareBlocks blocks={TWO_BLOCKS} />);
  await expect(page.getByText("Name", { exact: true })).toBeVisible();
  await expect(page.getByText("Class", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="compare-block"]')).toHaveCount(2);
});

test("no accepted/onAcceptedChange renders zero checkboxes (pure read-only review)", async ({ mount, page }) => {
  await mount(<CompareBlocks blocks={[{ before: "a", after: "b" }]} />);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("a single block with accept wiring shows exactly one checkbox — no accept-all", async ({ mount, page }) => {
  await mount(<AcceptHarness blocks={[{ before: "a", after: "b" }]} initialAccepted={[false]} />);
  await expect(page.getByRole("checkbox")).toHaveCount(1);
});

test("accepting one block reports only that block's index as accepted", async ({ mount, page }) => {
  await mount(<AcceptHarness blocks={TWO_BLOCKS} initialAccepted={[false, false]} />);
  const checkboxes = page.getByRole("checkbox");
  // index 0 = accept-all (blocks.length > 1), 1 = block 0, 2 = block 1.
  await expect(checkboxes).toHaveCount(3);
  await checkboxes.nth(1).click();
  await expect(checkboxes.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(checkboxes.nth(2)).toHaveAttribute("aria-checked", "false");
  await expect(checkboxes.first()).toHaveAttribute("aria-checked", "mixed");
});

test("accept-all accepts every block; partial acceptance reports as indeterminate", async ({ mount, page }) => {
  await mount(<AcceptHarness acceptAllLabel="Accept all changes" blocks={TWO_BLOCKS} initialAccepted={[true, false]} />);
  await expect(page.getByText("Accept all changes")).toBeVisible();
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes.first()).toHaveAttribute("aria-checked", "mixed");
  await checkboxes.first().click();
  await expect(checkboxes.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(checkboxes.nth(2)).toHaveAttribute("aria-checked", "true");
});

// --- The R3 REVIEW variant (per-block Keep/Discard verbs, tri-state, fail-closed) ---

test("review blocks open UNDECIDED with the will-not-apply chip, verbs instead of checkboxes, and NO bulk gesture", async ({ mount, page }) => {
  await mount(<ReviewHarness blocks={TWO_BLOCKS} />);
  // Belt 10 rendered: undecided is stated as a consequence, not a bare word.
  await expect(page.getByText("Undecided · will not apply")).toHaveCount(2);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: KEEP_NAME })).toBeVisible();
  await expect(page.getByRole("button", { name: DISCARD_CLASS })).toBeVisible();
  // Deliberately no accept-all row in the review grammar.
  await expect(page.locator('[data-slot="compare-blocks-accept-all"]')).toHaveCount(0);
});

test("Keep collapses the block to header + Kept chip; pressing the collapsed row re-expands it; re-pressing Keep returns to undecided", async ({
  mount,
  page,
}) => {
  await mount(<ReviewHarness blocks={TWO_BLOCKS} />);
  await page.getByRole("button", { name: KEEP_NAME }).click();
  const collapsed = page.locator('[data-slot="compare-block-collapsed"]');
  await expect(collapsed).toHaveCount(1);
  await expect(collapsed).toHaveAttribute("data-decision", "kept");
  await expect(collapsed.getByText("Kept")).toBeVisible();
  // The other block stays expanded and undecided — decisions are individual presses.
  await expect(page.getByText("Undecided · will not apply")).toHaveCount(1);
  // Re-expand: the pair renders again, the decision STAYS kept (presentation-only expansion).
  await collapsed.click();
  await expect(page.locator('[data-slot="compare-block-collapsed"]')).toHaveCount(0);
  const keepAgain = page.getByRole("button", { name: KEEP_NAME });
  await expect(keepAgain).toHaveAttribute("aria-pressed", "true");
  // Toggling Keep off returns the block to undecided (tri-state, never a two-state trap).
  await keepAgain.click();
  await expect(page.getByText("Undecided · will not apply")).toHaveCount(2);
});

test("Discard chips the block Discarded; a CLEARED block states the consequence on the state panel and the Keep verb", async ({ mount, page }) => {
  await mount(
    <ReviewHarness
      blocks={[
        { label: "Scenario", before: "Old text", stateNote: "This field will be emptied." },
        { label: "Class", before: "Rogue", after: "Assassin" },
      ]}
      collapseDecided={false}
    />,
  );
  // The cleared block: no after pane, a "Cleared" state panel with the consequence line, and the
  // destructive-consent Keep wording.
  const cleared = page.locator('[data-slot="compare-block-cleared"]');
  await expect(cleared.getByText("Cleared")).toBeVisible();
  await expect(page.getByText("This field will be emptied.")).toBeVisible();
  await expect(page.getByRole("button", { name: KEEP_EMPTIES_SCENARIO })).toBeVisible();
  await page.getByRole("button", { name: DISCARD_CLASS }).click();
  await expect(page.getByText("Discarded", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: DISCARD_CLASS })).toHaveAttribute("aria-pressed", "true");
});

test("an ADDED block (after only) renders no fabricated before pane — the Added state panel instead", async ({ mount, page }) => {
  await mount(<ReviewHarness blocks={[{ label: "greetings [2]", after: "A brand new greeting.", stateNote: "Appended as a new greeting slot." }]} />);
  await expect(page.locator('[data-slot="compare-block-before"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="compare-block-added"]').getByText("Added")).toBeVisible();
  await expect(page.getByText("A brand new greeting.")).toBeVisible();
  await expect(page.getByText("Appended as a new greeting slot.")).toBeVisible();
});
