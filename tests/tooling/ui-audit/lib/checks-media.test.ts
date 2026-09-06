// The PERMANENT PIN for design-audit's buried-raster rule (media family) — a raster carrier (<img> or a
// background-image url(...)) whose accumulated opacity is so low the material it ships never reaches the
// screen. Provenance: pbakaus/impeccable's buried-raster RUNTIME arm only (see contract/samples-media.ts
// header for the full attribution + the deliberately-not-ported CSS-text arm).
//
// Owner ruling pinned here too: this detector is not built to fire on today's tree — a clean run is the
// SUCCESS condition, never a failure, and the threshold is never loosened to manufacture a finding.
import { describe } from "vitest";
import type { ImageDistortionInput } from "../../../../tooling/src/ui-audit/contract/samples.ts";
import type { BuriedRasterInput } from "../../../../tooling/src/ui-audit/contract/samples-media.ts";
import {
  checkBuriedRaster,
  checkBuriedRasterPopulations,
  checkImageDistortion,
  classifyImageDistortion,
} from "../../../../tooling/src/ui-audit/lib/checks-media.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function raster(over: Partial<BuriedRasterInput> = {}): BuriedRasterInput {
  const base: BuriedRasterInput = {
    selector: "img.hero",
    kind: "img",
    effectiveOpacity: 1,
    opacityTransitions: false,
  };
  return { ...base, ...over };
}

// ── design-audit-rule-proof denominator (tooling/src/verify/gates/design-audit-rule-proof.ts) ──────
// The gate reads its two rows from a TOP-LEVEL `auditRuleTest(...)` call, bound to this file's own
// local helper (the same shape index.test.ts's registers) — see the gate's header for why the binding
// must be structural, not a describe-nested test.
interface AuditRuleProof {
  readonly rule: string;
  readonly kind: "fires" | "silent";
  readonly reason: string;
}

function auditRuleTest(proofs: readonly AuditRuleProof[], title: string, fn: () => void | Promise<void>): void {
  test(title, () => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn();
  });
}

auditRuleTest(
  [{ rule: "buried-raster", kind: "fires", reason: "an <img> composited at 0.05 effective opacity ships a raster that never reaches the screen" }],
  "buried-raster proof: fires",
  () => {
    const finding = checkBuriedRaster(raster({ effectiveOpacity: 0.05 }));
    expect(finding?.rule).toBe("buried-raster");
  },
);

auditRuleTest(
  [
    {
      rule: "buried-raster",
      kind: "silent",
      reason: "the nearest legitimate neighbour: the SAME raster carrier revealed at opacity 1 — a raster carrier is the tightest population this rule judges",
    },
  ],
  "buried-raster proof: silent on its nearest legitimate neighbour",
  () => {
    expect(checkBuriedRaster(raster({ effectiveOpacity: 1 }))).toBeNull();
  },
);

describe("design-audit buried-raster", () => {
  test("an <img> at opacity 0.05 FIRES", () => {
    const finding = checkBuriedRaster(raster({ effectiveOpacity: 0.05 }));
    expect(finding?.rule).toBe("buried-raster");
    expect(finding?.severity).toBe("P1");
  });

  test("the SAME img at opacity 1 is silent", () => {
    expect(checkBuriedRaster(raster({ effectiveOpacity: 1 }))).toBeNull();
  });

  test("a background-image carrier at low opacity FIRES", () => {
    const finding = checkBuriedRaster(raster({ kind: "background", selector: ".hero-plate", effectiveOpacity: 0.02 }));
    expect(finding?.rule).toBe("buried-raster");
    expect(finding?.value).toContain("background-image");
  });

  test("an element at low opacity with NO raster is never a candidate — the rule is about buried MATERIAL, not faint boxes", () => {
    // checkBuriedRaster only ever receives raster CARRIERS (the walker gathers only img/background-image
    // elements into BuriedRasterInput, samples-media.ts) — a faint non-raster box structurally cannot
    // reach this check, which is the population contract, not a runtime branch to assert on a null input.
    const { accounting } = checkBuriedRasterPopulations([]);
    expect(accounting.candidates).toBe(0);
    expect(accounting.judged).toBe(0);
    expect(accounting.affected).toBe(0);
  });

  test("a raster buried by an ANCESTOR's opacity FIRES — proves the walker's accumulated-opacity walk, not own-opacity-only", () => {
    // The walker composites accumulatedOpacity(el) BEFORE this shape exists (samples-media.ts) — the
    // fixture asserts the check trusts whatever effectiveOpacity it is handed, ancestor-derived or not.
    const finding = checkBuriedRaster(raster({ effectiveOpacity: 0.6 * 0.1 }));
    expect(finding?.rule).toBe("buried-raster");
  });

  describe("animated-in states — withheld/excluded rather than guessed", () => {
    test("a low-opacity carrier whose transition-property covers opacity is EXCLUDED, not fired", () => {
      const { findings, accounting } = checkBuriedRasterPopulations([raster({ effectiveOpacity: 0.05, opacityTransitions: true })]);
      expect(findings).toHaveLength(0);
      expect(accounting.candidates).toBe(1);
      expect(accounting.judged).toBe(0);
      expect(accounting.excluded["opacity-transition"]).toBe(1);
    });

    test("the SAME transition-capable carrier at rest opacity 1 is silent but JUDGED (not excluded) — the transition alone never buys silence", () => {
      const { findings, accounting } = checkBuriedRasterPopulations([raster({ effectiveOpacity: 1, opacityTransitions: true })]);
      expect(findings).toHaveLength(0);
      expect(accounting.judged).toBe(1);
      expect(accounting.excluded["opacity-transition"]).toBeUndefined();
    });

    test("a low-opacity carrier with NO transition-property FIRES — no false exclusion for a resting bury", () => {
      const { findings, accounting } = checkBuriedRasterPopulations([raster({ effectiveOpacity: 0.05, opacityTransitions: false })]);
      expect(findings).toHaveLength(1);
      expect(accounting.judged).toBe(1);
      expect(accounting.emitted).toBe(1);
    });
  });

  test("population accounting settles across a mixed batch (fires + excluded + silent)", () => {
    const { findings, accounting } = checkBuriedRasterPopulations([
      raster({ selector: "a", effectiveOpacity: 0.02 }),
      raster({ selector: "b", effectiveOpacity: 0.02, opacityTransitions: true }),
      raster({ selector: "c", effectiveOpacity: 1 }),
    ]);
    expect(findings).toHaveLength(1);
    expect(accounting.candidates).toBe(3);
    expect(accounting.judged).toBe(2);
    expect(accounting.excluded["opacity-transition"]).toBe(1);
    expect(accounting.emitted).toBe(1);
  });
});

// ── distorted-image: the two BOUNDARY questions the rule never asked (#1808, from #1504 claim 3) ──────
//
// `distorted-image` compares a rendered box's aspect against its source raster's, and took BOTH of its
// inputs on trust. The `object-fit` keyword was tested against a two-member set (`cover`/`contain`) that
// is not the CSS keyword space, so the two modes that perform NO independent axis scaling at all —
// `none` and `scale-down` — were judged as if they stretched; and the four extents were range-checked
// with `<= 0`, which every NaN passes, so an unreadable measurement printed a `NaN% aspect deviation`
// finding instead of refusing. Both arms are pinned in both directions: the honest fire above them must
// survive every fence added below it.
describe("design-audit distorted-image — only input the rule can actually judge", () => {
  function distorted(over: Partial<ImageDistortionInput> = {}): ImageDistortionInput {
    // A 3:1 source rendered 1:1 — a 200% deviation, far past DISTORTION_SEVERE_PCT.
    const base: ImageDistortionInput = {
      selector: "img.banner",
      naturalWidth: 1200,
      naturalHeight: 400,
      renderedWidth: 600,
      renderedHeight: 600,
      objectFit: "fill",
    };
    return { ...base, ...over };
  }

  test("object-fit: fill with a mismatched box still FIRES — none of the fences below buys silence", () => {
    expect(checkImageDistortion(distorted())?.rule).toBe("distorted-image");
    expect(classifyImageDistortion(distorted()).kind).toBe("judged");
  });

  // `none` paints the raster at its NATURAL size; `scale-down` picks the smaller of `none`/`contain`.
  // Neither scales the axes independently, so neither can squish — the box/source aspect mismatch they
  // produce is a crop, exactly like `cover`.
  test.each(["none", "scale-down"] as const)("object-fit: %s cannot stretch — excluded, never a finding", (objectFit) => {
    expect(checkImageDistortion(distorted({ objectFit }))).toBeNull();
    const disposition = classifyImageDistortion(distorted({ objectFit }));
    expect(disposition.kind).toBe("excluded");
    expect(disposition.kind === "excluded" ? disposition.reason : "").toBe("objectFitDoesNotScale");
  });

  test("an object-fit value outside the CSS keyword space is WITHHELD by name, not judged as if it stretched", () => {
    // The walker reads `getComputedStyle(img).objectFit || "fill"`; an empty or unrecognised value means
    // the measurement did not arrive, which is missing evidence (NO VERDICT), never a licence to convict.
    for (const objectFit of ["", "FILL", "stretch", "fill 50%"]) {
      const disposition = classifyImageDistortion(distorted({ objectFit }));
      expect(disposition.kind, objectFit).toBe("withheld");
      expect(disposition.kind === "withheld" ? disposition.reason : "").toBe("unreadableObjectFit");
    }
  });

  test.each([
    "naturalWidth",
    "naturalHeight",
    "renderedWidth",
    "renderedHeight",
  ] as const)("a non-finite %s is WITHHELD — the `<= 0` range check passes every NaN and printed a NaN deviation verdict", (field) => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const input = distorted({ [field]: value });
      expect(checkImageDistortion(input), `${field}=${String(value)}`).toBeNull();
      const disposition = classifyImageDistortion(input);
      expect(disposition.kind).toBe("withheld");
      expect(disposition.kind === "withheld" ? disposition.reason : "").toBe("unreadableExtent");
    }
  });

  test("a zero extent stays the EXCLUDED broken-image case it always was — the new refusal does not swallow it", () => {
    const disposition = classifyImageDistortion(distorted({ naturalWidth: 0 }));
    expect(disposition.kind).toBe("excluded");
    expect(disposition.kind === "excluded" ? disposition.reason : "").toBe("noComparableExtent");
  });
});
