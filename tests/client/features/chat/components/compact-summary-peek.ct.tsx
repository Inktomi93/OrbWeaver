// CT: the #9 memory-marker peek (compact-summary-peek.tsx) — the context-boundary divider's "View"
// popover revealing the LINEAR-tier compaction summary standing in for the messages above the boundary.
// The load-bearing behavior is that the summary text is NOT in the document until the user opens the
// popover (it's a click-to-reveal, not always-rendered), and that opening reveals the whitespace-preserved
// readout. The popup renders through a Base UI Portal, so it's read via the PAGE locator.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { ProseReading } from "../../../../support/ct/prose-measure.ts";
import { proseRow, readProseMeasure } from "../../../../support/ct/prose-measure.ts";
import { CompactSummaryPeekStory } from "../_ct-stories.tsx";

const SUMMARY = "Aria and the traveller struck a bargain at the crossroads.\nThe map changed hands.";

test("the trigger renders but the summary text is hidden until opened", async ({ mount, page }) => {
  await mount(<CompactSummaryPeekStory summary={SUMMARY} />);
  await expect(page.getByRole("button", { name: "View compaction summary" })).toBeVisible();
  // Nothing is revealed on mount — the summary text is behind the closed popover.
  await expect(page.locator('[data-slot="compact-summary-text"]')).toHaveCount(0);
});

test("clicking View reveals the compaction summary readout", async ({ mount, page }) => {
  await mount(<CompactSummaryPeekStory summary={SUMMARY} />);
  await page.getByRole("button", { name: "View compaction summary" }).click();

  const text = page.locator('[data-slot="compact-summary-text"]');
  await expect(text).toBeVisible();
  await expect(text).toContainText("struck a bargain at the crossroads");
  await expect(text).toContainText("The map changed hands");
});

// ── #1175 — the summary is BODY PROSE, so it takes the derived prose measure ────────────────────────────
// The cap used to be `max-w-prose` ON THE POPUP BOX, which is wrong twice. Tailwind's utility is 65 CSS
// `ch`, and a CSS `ch` is the ZERO-GLYPH advance — 1.43-1.56 typographic characters in Geist (the
// derivation `--reading-measure-prose` carries) — so 65ch reads 93-101 law characters, never the 65-75 the
// old comment claimed. And a `ch` on a WRAPPER resolves in the WRAPPER's font, not the copy's: the #213 /
// #1130 failure the prose token's own contract names, which is why it must ride the PARAGRAPH.
//
// THE ASSERTION IS IN THE LAW'S UNIT, NOT THE TOKEN'S. A `ch` comparison would only restate the token; this
// measures the AVERAGE GLYPH ADVANCE through the shared reading-measure reader
// (`tests/support/ct/prose-measure.ts` — canvas `measureText` over the paragraph's own resolved font, and
// the prose token resolved INSIDE that paragraph) and judges against the design law's 75. And it walks three viewports,
// because "the line is short enough" is a RANGE property: a ch cap is viewport-independent only while the
// available width exceeds it.
//
// AND IT IS A FENCE, NOT A DEFECT PROOF — SAID PLAINLY BECAUSE IT PASSES PRE-FIX. Measured on this mount
// (2026-09-05, cb-client-seams): the paragraph reads 340.1px at 1280 and 350.6px at 1440/1920, i.e. 49.3
// and 50.8 law characters, against a prose token that resolves to 446.5/460.3px here. Neither cap binds:
// `PopoverPopup`'s own `max-w-cq-sm` (24rem) is the narrower one and always was, which means the
// `max-w-prose` this replaced was a DEAD CLASS on this box — the re-point removes the third un-derived
// spelling at zero rendered cost rather than fixing visible pixels. What the fence catches is the day the
// popup cap widens, the paragraph escapes to a wider box, or a font pass moves the advance: from then on
// the prose measure is the one that has to hold, and it is now spelled on the paragraph where a `ch` can
// resolve in the copy's own font.
const PROSE_WIDTHS = [1280, 1440, 1920] as const;
/** `.claude/skills/side-eye-design-review/SKILL.md` §2, in the law's own unit — never a px and never a
 *  token value, so passing proves the DERIVATION rather than restating it. */
const LAW_CHARACTERS_PER_LINE = 75;
/** Long enough to reach the cap at every width above — a short string would pass by having nothing to wrap. */
const LONG_SUMMARY =
  "Aria and the traveller struck a bargain at the crossroads under a sky the colour of wet slate, and neither of them " +
  "said aloud what the map was worth, because saying it would have made the bargain a different kind of thing entirely.";

/** The paragraph addressed by its own rendered COPY, for the shared reading-measure reader (#1683): the
 *  measurement this test grew for itself now has ONE home (`tests/support/ct/prose-measure.ts`), so the six
 *  copies of it cannot drift apart. A `data-slot` hook would be a hook the fix could satisfy while the
 *  paragraph moved off the measure — the reader's contract is deliberately text-keyed.
 *
 *  THE PER-VIEWPORT VALUE BELOW IS NOT SETTLED, AND WAS NOT BEFORE THE CONVERGENCE (#1693). The barrier is
 *  `widthPx > 0`, which the PREVIOUS viewport's box already satisfies, so each reading lands somewhere
 *  along the popover's resize reflow: measured over three repetitions of the UNMODIFIED source the rows
 *  came back 356.8/358.0/358.0, 356.8/358.0/358.0 and 350.6/356.8/357.9 px. `widthPx / proseTokenPx` is
 *  0.7617 at every sample in both versions, i.e. the same paragraph in the same font — the drift is settle
 *  time, not the measurement. #1693 owns tightening the barrier; the fence reads ~50 law characters against
 *  a ceiling of 75, so it cannot red at any of those values today. */
const SUMMARY_OPENING = "Aria and the traveller struck a bargain";

/** Poll until two CONSECUTIVE readings of the paragraph's width agree (rounded to 0.01px), never `> 0` —
 *  which the PREVIOUS viewport's box already satisfied, so the old barrier let the read land anywhere
 *  along the popover's resize reflow (#1693: 340.1-358.0px spread across otherwise-identical runs).
 *  Returns the reading that proved stable, not a fresh third read that could itself have drifted. */
async function waitForStableProseReading(page: Page, opening: string): Promise<ProseReading> {
  let previous: ProseReading | null = null;
  let settled: ProseReading | null = null;
  await expect
    .poll(async () => {
      const current = await readProseMeasure(page, opening);
      const stable = previous !== null && Math.round(current.widthPx * 100) === Math.round(previous.widthPx * 100);
      previous = current;
      if (stable) {
        settled = current;
      }
      return stable;
    })
    .toBe(true);
  if (settled === null) {
    throw new Error("reading measure: never reached two consecutive equal readings");
  }
  return settled;
}

test("#1175 FENCE — the compaction summary stays inside the prose measure at every desktop width", async ({ mount, page }) => {
  await mount(<CompactSummaryPeekStory summary={LONG_SUMMARY} />);
  await page.getByRole("button", { name: "View compaction summary" }).click();
  await expect(page.locator('[data-slot="compact-summary-text"]')).toBeVisible();

  const rows: string[] = [];
  for (const width of PROSE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // BARRIER ON A STABLE WIDTH (#1693), never `> 0`: two consecutive equal readings across a frame prove
    // the popover's resize reflow has actually finished, not merely started.
    const reading = await waitForStableProseReading(page, SUMMARY_OPENING);
    rows.push(proseRow(width, reading));
    // ON the token, not merely under some width: the paragraph must resolve THIS measure in its own font.
    expect(reading.widthPx, `#1175 at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(reading.proseTokenPx + 0.5);
    expect(reading.lawCharacters, `#1175 at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(LAW_CHARACTERS_PER_LINE);
  }
  // The rows are carried in every assertion message above, so a RED prints the measurement that earned it.
  expect(rows).toHaveLength(PROSE_WIDTHS.length);
});
