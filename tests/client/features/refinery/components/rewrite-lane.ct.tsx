// CT: the REWRITE island — the workbench's ONE focal lane (program #102, mockup variant C). Three claims
// no other CT can make:
//   1. the BAND is the lane's accounting: it names the stage, its provenance mode, and the live tally
//      (kept / discarded / undecided) that used to sit inside the review body.
//   2. the FOCAL TREATMENT is real, and it is stripe + rationed glow rather than accent fill (CD3 as the
//      #102 review re-ruled it). Asserted by COMPUTED value — a className check cannot see a glow that
//      stopped painting, and a `::before` is paint with no element.
//   3. the lane states its own life: with no settled rewrite it says WHY rather than rendering an empty
//      island (the stage-order rule the server enforces), and it never shows an accept queue it has no
//      run for.

import type { ReviewEntry } from "@orb/client/features/refinery";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { RewriteLaneStory } from "../_ct-stories.tsx";

const ENTRIES: readonly ReviewEntry[] = [
  { entry: { field: "description", text: "A rewritten description." }, live: "The live description.", original: "The live description.", diverged: false },
  { entry: { field: "personality", text: "Wry and patient." }, live: "Wry.", original: "Wry.", diverged: false },
];

const KEEP_DESCRIPTION = /^Keep description$/;
/** The not-run arm's corrected sentence (`lib/stage-not-run-copy.ts`) — see the pin below for what it
 *  replaced and why. */
const REWRITE_NOT_RUN_COPY = /without one it works from the card alone/;

/** The island's `::before` glow layer, as the browser resolved it — the sanctioned carrier for the CD3
 *  accent (a chromatic glow on the element's OWN box-shadow is the generated-UI tell the design audit
 *  classifies, so the halo rides a pseudo-element). */
function glowShadow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="refinery-rewrite-lane"]');
    return el === null ? "MISSING" : getComputedStyle(el, "::before").boxShadow;
  });
}

test("the band names the lane, its provenance and the live tally — the accounting is on the island's own header", async ({ mount, page }) => {
  await mount(<RewriteLaneStory entries={ENTRIES} />);

  await expect(page.getByRole("heading", { name: "2 · Rewrite · balanced" })).toBeVisible();
  await expect(page.getByText("0 kept", { exact: true })).toBeVisible();
  await expect(page.getByText("2 undecided", { exact: true })).toBeVisible();

  // The tally is the decision sheet's own accounting, live.
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await expect(page.getByText("1 kept", { exact: true })).toBeVisible();
  await expect(page.getByText("1 undecided", { exact: true })).toBeVisible();
});

test("the island carries the CD3 focal treatment — a speaker stripe and a rationed glow, not an accent fill", async ({ mount, page }) => {
  await mount(<RewriteLaneStory entries={ENTRIES} />);
  const island = page.getByTestId("refinery-rewrite-lane");
  await expect(island).toBeVisible();

  // The stripe is a real, painted, non-zero border on the inline start edge — the same three declarations
  // the immersive chat rows and home's hearth paint.
  const stripe = await island.evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.borderInlineStartWidth, styleName: style.borderInlineStartStyle };
  });
  expect(Number.parseFloat(stripe.width), "the speaker stripe has a real width").toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (
          await island.evaluate((el) => {
            const style = getComputedStyle(el);
            return { width: style.borderInlineStartWidth, styleName: style.borderInlineStartStyle };
          })
        ).styleName,
    )
    .toBe("solid");

  // The glow is on the ::before layer and it is CHROMATIC (a resolved colour, not `none`).
  const shadow = await glowShadow(page);
  expect(shadow).not.toBe("MISSING");
  expect(shadow).not.toBe("none");
});

test("with no settled rewrite the lane says WHY, and offers no accept queue it has no run for", async ({ mount, page }) => {
  await mount(<RewriteLaneStory empty={true} entries={[]} />);

  await expect(page.getByText("Nothing settled for rewrite yet")).toBeVisible();
  // THE SENTENCE CHANGED ON 2026-08-17 (#158 item 4) and the old one is quoted here rather than dropped:
  // it read "Run the rewrite (or hand-edit) once a score exists — only the scoped fields are touched.",
  // which states a precondition `assertStageReady` does not enforce (a cold rewrite is legal; only analyze
  // is gated). The lane's own Run button stayed enabled beside it, which is the contradiction the owner
  // screenshotted. The copy is now one home (`lib/stage-not-run-copy.ts`) and describes what a scoreless
  // rewrite actually does.
  await expect(page.getByText(REWRITE_NOT_RUN_COPY)).toBeVisible();
  // No tally and no queue: an accounting of zero fields would be a claim about a run that does not exist.
  await expect(page.getByText("0 undecided", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("refinery-queue-row")).toHaveCount(0);
});
