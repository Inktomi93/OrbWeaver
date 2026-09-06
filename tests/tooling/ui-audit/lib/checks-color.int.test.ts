// The PERMANENT PIN for the WCAG 1.4.3 inactive-control exemption in design-audit's contrast checker
// (tooling/src/ui-audit/lib/checks-color.ts) — issue #624. design-audit had NO inactive classifier at all,
// so on the SAME element `snap --contrast` reported `SKIPPED inactive control (WCAG contrast exemption)`
// while design-audit filed a P1 at 2.64:1. Every disabled control in the app was a standing false positive,
// which is precisely how a reader learns to discount an instrument's P1s wholesale.
//
// Three things are pinned here, and the second and third are the ones that keep it honest:
//   1. the exemption fires (no more P1 on a disabled control),
//   2. the TRUE-POSITIVE arm is untouched — an ACTIVE control at the same ratio still REDs,
//   3. the usability signal SURVIVES the exemption: a control so dim it may not read as present at all
//      still says so, as a P3 advisory that explicitly disclaims being a WCAG violation.
import { describe } from "vitest";
import { INACTIVE_KIND_EXPR, isContrastExempt, remainsOperable } from "../../../../tooling/src/_shared/wcag.ts";
import type { ContrastInput } from "../../../../tooling/src/ui-audit/contract/samples.ts";
import { checkContrast, colorTextPopulations } from "../../../../tooling/src/ui-audit/lib/checks-color.ts";
import { populationEvidenceGap } from "../../../../tooling/src/ui-audit/lib/population.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// The two grays are chosen for the RATIOS they produce against the page, not for their looks — each
// straddles a different boundary, and the pair is what makes the advisory's own floor testable.
/** ≈2.64:1 on PAGE_BG — the issue's measured element. Below AA's 4.5 AND below 1.4.11's 3. */
const DIM_TEXT = { r: 152, g: 152, b: 152 } as const;
/** ≈4.05:1 on PAGE_BG — below AA's 4.5 but ABOVE 1.4.11's 3: ordinary disabled styling, dimmed yet
 *  clearly present. Exempt from the P1 AND below the advisory's threshold, so fully silent. */
const READABLE_DISABLED_TEXT = { r: 120, g: 120, b: 120 } as const;
const PAGE_BG = { r: 245, g: 245, b: 245 } as const;

function sample(over: Partial<ContrastInput> = {}): ContrastInput {
  const base: ContrastInput = {
    selector: "button[disabled]",
    color: DIM_TEXT,
    backdrop: { kind: "flat", color: PAGE_BG },
    fontSizePx: 14,
    fontWeight: 400,
  };
  return { ...base, ...over };
}

describe("design-audit contrast — #624: the inactive-control exemption, both directions", () => {
  test("an ACTIVE control below AA still REDs as a P1 — the true-positive arm is untouched", () => {
    const finding = checkContrast(sample({ inactive: "none" }));
    expect(finding?.rule).toBe("contrast");
    expect(finding?.severity).toBe("P1");
  });

  test("the SAME element, natively :disabled, is no longer a WCAG P1 (snap already skipped it)", () => {
    const finding = checkContrast(sample({ inactive: "native" }));
    expect(finding?.rule).not.toBe("contrast");
    expect(finding?.severity).not.toBe("P1");
  });

  test("an ABSENT flag reads as active — fixture sample sets that predate the field keep their verdicts", () => {
    // The optional field must not silently exempt every historical sample.
    const finding = checkContrast(sample());
    expect(finding?.rule).toBe("contrast");
  });

  test("a PASSING ratio is silent whatever the inactive kind — the exemption invents no findings", () => {
    const passing = sample({ color: { r: 20, g: 20, b: 20 }, inactive: "native" });
    expect(checkContrast(passing)).toBeNull();
  });
});

describe("design-audit contrast — #624: the exemption must not swallow the USABILITY signal", () => {
  test("a disabled control below the 1.4.11 boundary still says so, as a P3 that disclaims WCAG", () => {
    const finding = checkContrast(sample({ inactive: "native" }));
    expect(finding?.rule).toBe("inactive-control-legibility");
    expect(finding?.severity).toBe("P3");
    // It must be unmistakable that this is NOT the WCAG claim that was just retracted.
    expect(finding?.message).toContain("NOT a WCAG AA violation");
    expect(finding?.message).toContain("may not read as present");
  });

  test("an inactive control ABOVE the 1.4.11 boundary is fully silent — no wall of false P3s", () => {
    // Ordinary disabled styling (dimmed but clearly present) must not trade one noise class for another.
    const readable = sample({ color: READABLE_DISABLED_TEXT, inactive: "native" });
    expect(checkContrast(readable)).toBeNull();
    // ...and the SAME color while ACTIVE is still a P1 — proof the silence is the exemption, not the ratio.
    expect(checkContrast(sample({ color: READABLE_DISABLED_TEXT, inactive: "none" }))?.rule).toBe("contrast");
  });

  test("aria-disabled earns the sharper note — it stays focusable and announced", () => {
    const aria = checkContrast(sample({ inactive: "aria" }));
    expect(aria?.rule).toBe("inactive-control-legibility");
    expect(aria?.message).toContain("FOCUSABLE");
    // ...and a natively-disabled control does NOT claim that, because it is not focusable.
    expect(checkContrast(sample({ inactive: "native" }))?.message).not.toContain("FOCUSABLE");
  });
});

test("inactive controls are exempt before image and gradient text-over-art verdicts", () => {
  expect(checkContrast(sample({ inactive: "native", backdrop: { kind: "image-indeterminate" } }))).toBeNull();
  const gradient = sample({
    inactive: "native",
    backdrop: { kind: "gradient", stops: [PAGE_BG, { r: 255, g: 255, b: 255 }] },
  });
  expect(checkContrast(gradient)?.rule).toBe("inactive-control-legibility");
  expect(checkContrast(gradient)?.severity).toBe("P3");
});

// ── #987: the reading-surface DENOMINATOR, both directions per reason ────────
// The colour family declined silently in five places and published no denominator, and the RESULT line's
// `no-verdict=` counts only the PIXEL SAMPLER's refusals — so a clean colour family could equally mean
// "300 texts judged, all pass" or "300 censused, 280 declined", on the rule the apparatus exists for.
// Each pin below asserts BOTH arms: which bucket the reason lands in AND what that does to the run's
// verdict. A one-direction plant is not a control — a reason mis-filed as `excluded` would look identical
// to a real judgment in the counter and would silently keep a partial run clean.
const OPAQUE_WHITE = { r: 255, g: 255, b: 255 } as const;

describe("design-audit colour populations — #987: every text sample lands in exactly one bucket", () => {
  test("a judged FAILING text counts as judged AND affected; the run keeps its verdict", () => {
    const rows = colorTextPopulations([sample({ inactive: "none" })]);
    expect(rows.contrast).toMatchObject({ candidates: 1, judged: 1, affected: 1, emitted: 1, withheld: {}, excluded: {} });
    // ...and the SAME shape passing is judged with nothing affected — the denominator is the point.
    expect(colorTextPopulations([sample({ color: { r: 20, g: 20, b: 20 } })]).contrast).toMatchObject({ judged: 1, affected: 0, emitted: 0 });
    expect(populationEvidenceGap(rows)).toBeNull();
  });

  test("a sub-measurable opacity is WITHHELD across the triple and makes the run NO VERDICT", () => {
    // A glyph caught mid-fade paints nothing at that instant, so its ratio is arithmetic, not evidence.
    const rows = colorTextPopulations([sample({ foregroundOpacity: 0.01 })]);
    expect(rows.contrast).toMatchObject({ candidates: 1, judged: 0, affected: 0, withheld: { dimmed: 1 } });
    expect(rows["text-over-art"]?.withheld).toEqual({ dimmed: 1 });
    expect(rows["inactive-control-legibility"]?.withheld).toEqual({ dimmed: 1 });
    expect(populationEvidenceGap(rows)?.detail).toContain("contrast: dimmed=1");
  });

  test("an UNRESOLVED backdrop is WITHHELD across the triple and makes the run NO VERDICT", () => {
    const unresolved = sample({ backdrop: { kind: "unresolved", reason: "no-opaque-base", fallback: PAGE_BG } });
    const rows = colorTextPopulations([unresolved]);
    expect(rows.contrast).toMatchObject({ judged: 0, withheld: { unresolvedBackdrop: 1 } });
    expect(rows["gray-on-color"]).toMatchObject({ judged: 0, withheld: { unresolvedBackdrop: 1 } });
    expect(populationEvidenceGap(rows)).not.toBeNull();
  });

  test("an INACTIVE control is EXCLUDED from contrast — complete evidence, so the run keeps its verdict", () => {
    // WCAG 1.4.3 exempts inactive components: the facts PROVE the rule inapplicable, they are not missing.
    const rows = colorTextPopulations([sample({ inactive: "native" })]);
    expect(rows.contrast).toMatchObject({ candidates: 1, judged: 0, affected: 0, withheld: {}, excluded: { inactiveExempt: 1 } });
    // ...and the advisory that replaces it DID judge the same sample and found it.
    expect(rows["inactive-control-legibility"]).toMatchObject({ judged: 1, affected: 1, emitted: 1 });
    expect(populationEvidenceGap(rows)).toBeNull();
  });

  test("an inactive control over an IMAGE is withheld from the advisory it applies to — NO VERDICT", () => {
    // The one decline inside the inactive arm that is a real gap: no measurable backdrop, so no ratio.
    const rows = colorTextPopulations([sample({ inactive: "native", backdrop: { kind: "image-indeterminate" } })]);
    expect(rows["inactive-control-legibility"]).toMatchObject({ judged: 0, withheld: { imageIndeterminate: 1 } });
    expect(populationEvidenceGap(rows)?.detail).toContain("imageIndeterminate=1");
    // The same is true of a translucent backdrop, whose composite is unknown.
    const translucent = sample({ inactive: "native", backdrop: { kind: "flat", color: { ...PAGE_BG, a: 0.5 } } });
    expect(colorTextPopulations([translucent])["inactive-control-legibility"]?.withheld).toEqual({ translucentBackdrop: 1 });
  });

  test("an ACTIVE text over an image is JUDGED by text-over-art, not withheld — the run keeps its verdict", () => {
    // The asymmetry a reader will look for: this path EMITS a P1 saying contrast is indeterminate, so the
    // instrument's inability is already the verdict. Counting it a second time as a missing judgment would
    // double-count it AND turn every surface carrying one picture into a NO VERDICT run.
    const rows = colorTextPopulations([sample({ backdrop: { kind: "image-indeterminate" } })]);
    expect(rows["text-over-art"]).toMatchObject({ judged: 1, affected: 1, emitted: 1, withheld: {} });
    expect(rows.contrast).toMatchObject({ judged: 0, excluded: { imageBackdrop: 1 } });
    // gray-on-color EXCLUDES it for the same reason it excludes a pixel sample: a picture is not an
    // authored colour. Filing that as a withholding would make one picture a permanent NO VERDICT.
    expect(rows["gray-on-color"]).toMatchObject({ judged: 0, withheld: {}, excluded: { imageBackdrop: 1 } });
    expect(populationEvidenceGap(rows)).toBeNull();
  });

  test("a PIXEL-SAMPLED backdrop is excluded from gray-on-color only — contrast still judges it", () => {
    // Pixels answer luminance, not authorship, and this rule's remedy presumes an authored colour.
    const rows = colorTextPopulations([sample({ backdropMethod: "pixel-sample" })]);
    expect(rows["gray-on-color"]).toMatchObject({ judged: 0, withheld: {}, excluded: { pixelSampled: 1 } });
    expect(rows.contrast?.judged).toBe(1);
    expect(populationEvidenceGap(rows)).toBeNull();
  });

  test("every row settles over a MIXED population — candidates = judged + withheld + excluded", () => {
    // settledPopulationAccounting throws when the arithmetic does not close, so a mis-bucketed reason is an
    // instrument error rather than a plausible-looking counter.
    const rows = colorTextPopulations([
      sample(),
      sample({ inactive: "native" }),
      sample({ foregroundOpacity: 0.01 }),
      sample({ backdrop: { kind: "image-indeterminate" } }),
      sample({ backdrop: { kind: "gradient", stops: [PAGE_BG, OPAQUE_WHITE] } }),
    ]);
    for (const row of [rows.contrast, rows["text-over-art"], rows["inactive-control-legibility"], rows["gray-on-color"]]) {
      const declined = Object.values(row?.withheld ?? {})
        .concat(Object.values(row?.excluded ?? {}))
        .reduce((a, b) => a + b, 0);
      expect(row?.candidates).toBe(5);
      expect((row?.judged ?? 0) + declined).toBe(5);
    }
    expect(rows.contrast?.excluded).toEqual({ inactiveExempt: 1, imageBackdrop: 1, gradientBackdrop: 1 });
  });
});

describe("design-audit contrast — #624: ONE classifier, shared with snap", () => {
  test("every inactive spelling is contrast-exempt, and only aria remains operable", () => {
    expect(isContrastExempt("native")).toBe(true);
    expect(isContrastExempt("aria")).toBe(true);
    expect(isContrastExempt("inert")).toBe(true);
    expect(isContrastExempt("none")).toBe(false);

    expect(remainsOperable("aria")).toBe(true);
    expect(remainsOperable("native")).toBe(false);
    expect(remainsOperable("inert")).toBe(false);
  });

  test("the shared in-page classifier covers all three spellings and orders inert first", () => {
    // Both instruments build their sampling script as a STRING, so the ONE home has to be a string too —
    // this asserts the shared expression still names every spelling (a silent narrowing would re-open the
    // exact drift #624 closed) and that `inert`, an ANCESTOR test, is checked before the element's own state.
    expect(INACTIVE_KIND_EXPR).toContain(":disabled");
    expect(INACTIVE_KIND_EXPR).toContain("aria-disabled");
    expect(INACTIVE_KIND_EXPR).toContain("[inert]");
    expect(INACTIVE_KIND_EXPR.indexOf("[inert]")).toBeLessThan(INACTIVE_KIND_EXPR.indexOf(":disabled"));
    // #1005 — EVERY arm is an ancestor test (`closest`, which matches the element itself first). A
    // text-bearing CHILD of a disabled control is what both instruments actually sample, and an
    // `el.matches(…)` arm classifies it "none".
    expect(INACTIVE_KIND_EXPR).not.toContain(".matches(");
    expect(INACTIVE_KIND_EXPR.match(/node\.closest\(/gu)).toHaveLength(3);
    // #1016 — and the NAMING relation, both spellings: a control's accessible name is part of the
    // inactive component even when the DOM puts it outside the control's subtree. `~=` is load-bearing
    // (aria-labelledby is a TOKEN LIST — one control can name several ids).
    expect(INACTIVE_KIND_EXPR).toContain('aria-labelledby~="');
    expect(INACTIVE_KIND_EXPR).toContain(".control");
    // The BEHAVIOURAL proof of every arm above is the int fixtures
    // (tests/tooling/ui-audit/ops/walker/census-text.int.test.ts, tests/tooling/snap/ops/arms/contrast.int.test.ts);
    // this is the cheap spelling guard that catches a narrowing edit before those have to run a browser.
  });
});

describe("design-audit contrast — #1078 (orb-ui audit F6): a masked foreground is WITHHELD, never resolved flat", () => {
  // A failing ratio that would otherwise file a P1 — proves withholding is not merely "declines to fire
  // on a passing sample" but genuinely REFUSES a verdict this rule would otherwise reach.
  const failingMasked = sample({ foregroundMasked: true, inactive: "none" });

  test("a masked text sample files no contrast finding, even where the ratio would fail", () => {
    expect(checkContrast(failingMasked)).toBeNull();
  });

  test("the masked sample is WITHHELD, not silently excluded or judged-clean", () => {
    const rows = colorTextPopulations([failingMasked]);
    expect(rows.contrast).toMatchObject({ candidates: 1, judged: 0, withheld: { maskedForeground: 1 }, excluded: {} });
    expect(rows["text-over-art"]).toMatchObject({ candidates: 1, judged: 0, withheld: { maskedForeground: 1 } });
    expect(rows["inactive-control-legibility"]).toMatchObject({ candidates: 1, judged: 0, withheld: { maskedForeground: 1 } });
  });

  test("an UNMASKED sibling at the identical failing ratio is still judged and still REDs", () => {
    const unmasked = sample({ foregroundMasked: false, inactive: "none" });
    const finding = checkContrast(unmasked);
    expect(finding?.rule).toBe("contrast");
    expect(finding?.severity).toBe("P1");
    const rows = colorTextPopulations([unmasked]);
    expect(rows.contrast).toMatchObject({ candidates: 1, judged: 1 });
  });

  test("an ABSENT flag reads as unmasked — fixture sample sets that predate the field keep their verdicts", () => {
    const finding = checkContrast(sample({ inactive: "none" }));
    expect(finding?.rule).toBe("contrast");
  });

  test("gray-on-color is UNAFFECTED by masking — it classifies the AUTHORED color, which a mask never changes", () => {
    // A gray, chromatic-background sample that would normally fire gray-on-color: masking the foreground
    // does not touch `color`/`backdrop`, so this rule's verdict must survive untouched.
    const grayOnChromatic = sample({
      foregroundMasked: true,
      color: { r: 140, g: 140, b: 140 },
      backdrop: { kind: "flat", color: { r: 40, g: 90, b: 200 } },
    });
    const rows = colorTextPopulations([grayOnChromatic]);
    expect(rows["gray-on-color"]?.judged).toBe(1);
  });
});
