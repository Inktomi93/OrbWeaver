// CT: the #9 memory-marker peek (compact-summary-peek.tsx) — the context-boundary divider's "View"
// popover revealing the LINEAR-tier compaction summary standing in for the messages above the boundary.
// The load-bearing behavior is that the summary text is NOT in the document until the user opens the
// popover (it's a click-to-reveal, not always-rendered), and that opening reveals the whitespace-preserved
// readout. The popup renders through a Base UI Portal, so it's read via the PAGE locator.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
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
// measures the AVERAGE GLYPH ADVANCE the way `home-surface.ct.tsx` measures it (canvas `measureText` over
// the paragraph's own resolved font) and judges against the design law's 75. And it walks three viewports,
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

interface ProseReading {
  readonly widthPx: number;
  readonly advanceCh: number;
  readonly proseTokenPx: number;
}

/** The paragraph measured in its OWN resolved font, against the prose token resolved in that same font.
 *  The probe is absolutely positioned and removed before layout can see it. */
function measureSummary(page: Page): Promise<ProseReading> {
  return page.evaluate(() => {
    const paragraph = document.querySelector('[data-slot="compact-summary-text"]');
    if (!(paragraph instanceof HTMLElement)) {
      throw new Error("#1175: no compaction-summary paragraph to measure");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("#1175: no 2d context to measure glyph advance through");
    }
    const style = getComputedStyle(paragraph);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = (paragraph.textContent ?? "").replace(/\s+/gu, " ").trim();
    const advance = context.measureText(text).width / text.length;
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.width = "var(--reading-measure-prose)";
    paragraph.append(probe);
    const proseTokenPx = probe.getBoundingClientRect().width;
    probe.remove();
    const widthPx = paragraph.getBoundingClientRect().width;
    return { widthPx, advanceCh: widthPx / advance, proseTokenPx };
  });
}

test("#1175 FENCE — the compaction summary stays inside the prose measure at every desktop width", async ({ mount, page }) => {
  await mount(<CompactSummaryPeekStory summary={LONG_SUMMARY} />);
  await page.getByRole("button", { name: "View compaction summary" }).click();
  await expect(page.locator('[data-slot="compact-summary-text"]')).toBeVisible();

  const rows: string[] = [];
  for (const width of PROSE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // Barrier on the SETTLED reflow: the popover repositions on resize, so the box read on the same tick
    // as the viewport change is the pre-reflow one.
    await expect.poll(async () => Math.round((await measureSummary(page)).widthPx)).toBeGreaterThan(0);
    const reading = await measureSummary(page);
    rows.push(`${String(width)}\t${reading.widthPx.toFixed(1)}px\tlaw ${reading.advanceCh.toFixed(1)}\ttoken ${reading.proseTokenPx.toFixed(1)}px`);
    // ON the token, not merely under some width: the paragraph must resolve THIS measure in its own font.
    expect(reading.widthPx, `#1175 at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(reading.proseTokenPx + 0.5);
    expect(reading.advanceCh, `#1175 at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(LAW_CHARACTERS_PER_LINE);
  }
  // The rows are carried in every assertion message above, so a RED prints the measurement that earned it.
  expect(rows).toHaveLength(PROSE_WIDTHS.length);
});
