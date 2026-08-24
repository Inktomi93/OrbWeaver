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
import { checkContrast } from "../../../../tooling/src/ui-audit/lib/checks-color.ts";
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
  });
});
