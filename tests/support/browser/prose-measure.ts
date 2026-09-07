// The READING-MEASURE instrument — "how many typographic characters per line does this paragraph actually
// render?", answered in the design law's own unit rather than in the token's.
//
// WHY THE UNIT MATTERS (#1145, and the reason this is a shared reader rather than a per-test snippet). CSS
// `ch` is the advance of the ZERO glyph, which in Geist is 0.6625em; running prose averages 0.4248-0.4629em
// per glyph, so one CSS `ch` is 1.43-1.56 typographic characters. A test that compares a paragraph's width
// to `75ch` therefore restates the token and proves nothing about the law
// (`.claude/skills/side-eye-design-review/SKILL.md` §2, the 65-75 band). The honest measurement is a canvas
// `measureText` over the paragraph's OWN resolved font — which is what this does.
//
// AND IT RESOLVES THE TOKEN AT THE PARAGRAPH, NOT AT `:root`. `--reading-measure-prose` is an unregistered
// custom property, i.e. a token stream, so its `ch` resolves at the USING element. Reading it anywhere but
// inside the paragraph reads it at the wrong font size — the #213/#1130 failure the token's own contract
// names. The probe div is appended to the paragraph, measured, and removed before layout can see it.
//
// Every CT grew its own copy of this before it had a home. SIX now read through this one: databank #1653,
// the tag and regex editors #1653, and — converged by #1683 — the compaction peek #1175, the roster editor
// #1653, and the Effects gloss. New callers use this one.
//
// THREE canvas-`measureText` probes are deliberately NOT callers, because they ask a different question
// (widening this API to swallow them would put two questions in one home — #1683 refused them by name):
//   · `home-surface.ct.tsx` #1145 SWEEPS every `p` on the surface and needs `max-width`, the CSS-`ch`
//     reading and `--reading-measure` alongside the prose token — a per-paragraph verdict table, not one
//     paragraph's reading, and it resizes the fold pane between readings.
//   · `corpus-home-surface.ct.tsx` #536 measures the ZERO-GLYPH advance (`measureText("0")` + letter-spacing)
//     over every `p[data-slot="text"]` because it must be denominated identically to the detector it
//     mirrors (`tooling/src/ui-audit/ops/walker/census-text.ts`). Averaged advance would silently disagree.
//   · `section-drill-in.ct.tsx` O-14 measures an `<input>`'s PLACEHOLDER against the field's inner box —
//     a ghost-fits-its-cell question about a control, with no paragraph and no reading measure in it.

import type { Page } from "@playwright/test";

/** One paragraph's rendered line length, in three units that disagree on purpose. */
export interface ProseReading {
  /** The paragraph's own rendered box width. */
  readonly widthPx: number;
  /** `widthPx` divided by the AVERAGE GLYPH ADVANCE of this paragraph's own text — the design law's unit. */
  readonly lawCharacters: number;
  /** `--reading-measure-prose` resolved INSIDE the paragraph, i.e. in the font the cap would apply to. */
  readonly proseTokenPx: number;
  /** The paragraph's computed `font-size`, so a reading that surprises you can be explained. */
  readonly fontSize: string;
}

/** Measure the first zero-child `p`/`span`/`div` whose text starts with `opening`.
 *
 *  MATCHED BY ITS OWN COPY, never by a `data-*` hook the fix would add: a pin that selects on the attribute
 *  it is about cannot compile against the pre-fix source, and a red-first receipt is the whole point. */
export function readProseMeasure(page: Page, opening: string): Promise<ProseReading> {
  return page.evaluate((needle: string) => {
    const paragraph = [...document.querySelectorAll("p,span,div")].find((el) => el.children.length === 0 && (el.textContent ?? "").trim().startsWith(needle));
    if (!(paragraph instanceof HTMLElement)) {
      throw new Error(`reading measure: no paragraph starting "${needle}" to measure`);
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("reading measure: no 2d context to measure glyph advance through");
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
    return { widthPx, lawCharacters: widthPx / advance, proseTokenPx, fontSize: style.fontSize };
  }, opening);
}

/** A one-line row for an assertion message, so a RED prints the measurement that earned it. */
export function proseRow(widthLabel: number, reading: ProseReading): string {
  return `${String(widthLabel)}\t${reading.widthPx.toFixed(1)}px\tlaw ${reading.lawCharacters.toFixed(1)}\ttoken ${reading.proseTokenPx.toFixed(1)}px\t@${reading.fontSize}`;
}
