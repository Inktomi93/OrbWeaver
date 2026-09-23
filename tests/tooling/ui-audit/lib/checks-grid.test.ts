// The PERMANENT PINS for design-audit's DEVICE-PIXEL GRID family (docs/law/integer-line-boxes.md
// §9-§11 — the crispness doctrine's Laws 2, 3 and 4). Three rules, one measurement: did the RESOLVED
// raster land on the device-pixel grid.
//
// THE DPR MATRIX IS PINNED HERE, AND THAT IS DELIBERATE. `design-audit` has no `--dpr` flag (and this lane
// did not add one — a CLI-surface change the crispness program does not need), so the 1 / 1.25 / 2 arms are
// taken two ways: live, by a scratch playwright probe that sets `deviceScaleFactor` per arm, and
// permanently, by the arms below. They are the arm that keeps proving: the walker normalizes every fraction
// to DEVICE pixels in the page, so one epsilon must be correct at every DPR — a CSS half-pixel is a REAL
// off-grid landing at DPR 1 and a perfectly crisp one at DPR 2, and a checker that silently assumed DPR 1
// would file the DPR-2 arm as a defect on every retina run.
//
// Owner posture (the buried-raster precedent, one family over): a clean run is a SUCCESS condition. The
// epsilon is float-noise slack, never a threshold to loosen until something fires.
import { describe } from "vitest";
import type { OffGridTextInput, OffGridTransformInput, PromotedLayerOffsetInput } from "../../../../tooling/src/ui-audit/contract/samples-grid.ts";
import { checkOffGridText, checkOffGridTransform, checkPromotedLayerOffset, GRID_EXEMPTIONS } from "../../../../tooling/src/ui-audit/lib/checks-grid.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The founding measurement: the config list panel's label voice, 0.125 CSS px off the grid under the
 *  panel's `backdrop-filter` — 22 of 25 text elements on that surface at mint, 7 horizontal residuals
 *  after Law 1 landed the integer line boxes. */
function offGridText(over: Partial<OffGridTextInput> = {}): OffGridTextInput {
  const base: OffGridTextInput = {
    selector: "[data-slot=list-row-title]",
    authoredTarget: "div|list-row-title",
    authoredHome: "[data-slot=config-list]",
    dpr: 1,
    topDeviceFrac: 0,
    leftDeviceFrac: 0,
    promotion: "backdrop-filter",
    promotedBy: "[data-slot=config-list-panel]",
    fontSizePx: 13,
  };
  return { ...base, ...over };
}

function promotedLayer(over: Partial<PromotedLayerOffsetInput> = {}): PromotedLayerOffsetInput {
  const base: PromotedLayerOffsetInput = {
    selector: "[data-slot=config-list-panel]",
    authoredTarget: "div|config-list-panel",
    authoredHome: "[data-slot=config-list-panel]",
    dpr: 1,
    topDeviceFrac: 0,
    leftDeviceFrac: 0,
    promotion: "backdrop-filter",
  };
  return { ...base, ...over };
}

function restTransform(over: Partial<OffGridTransformInput> = {}): OffGridTransformInput {
  const base: OffGridTransformInput = {
    selector: "[data-slot=jump-to-latest]",
    authoredTarget: "button|jump-to-latest",
    authoredHome: "[data-slot=chat-transcript]",
    dpr: 1,
    topDeviceFrac: 0,
    leftDeviceFrac: 0,
    transform: "matrix(1, 0, 0, 1, 0, 0)",
    scaleX: 1,
    scaleY: 1,
    translated: false,
  };
  return { ...base, ...over };
}

// ── design-audit-rule-proof denominator (tooling/src/verify/gates/design-audit-rule-proof.ts) ──────
// The gate reads its rows from a TOP-LEVEL `auditRuleTest(...)` call bound to this file's own local
// helper — see the gate's header for why the binding must be structural, not a describe-nested test.
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
  [
    {
      rule: "off-grid-text",
      kind: "fires",
      reason:
        "the founding defect: 13px label-voice text 0.125 device px off the grid inside the config panel's backdrop-filter layer, where baseline snapping is off",
    },
  ],
  "off-grid-text proof: fires",
  () => {
    expect(checkOffGridText(offGridText({ leftDeviceFrac: 0.125 }))?.rule).toBe("off-grid-text");
  },
);

auditRuleTest(
  [
    {
      rule: "off-grid-text",
      kind: "silent",
      reason:
        "the nearest legitimate neighbour: the SAME promoted text landing exactly on the device grid — a promoted, judged subject, so this is the rule's own population and not a family it never reached",
    },
  ],
  "off-grid-text proof: silent on its nearest legitimate neighbour",
  () => {
    expect(checkOffGridText(offGridText())).toBeNull();
  },
);

auditRuleTest(
  [
    {
      rule: "promoted-layer-offset",
      kind: "fires",
      reason: "the CAUSE half: the backdrop-filter panel itself lands a half device pixel off, so every glyph in its one raster inherits that fraction",
    },
  ],
  "promoted-layer-offset proof: fires",
  () => {
    expect(checkPromotedLayerOffset(promotedLayer({ topDeviceFrac: 0.5 }))?.rule).toBe("promoted-layer-offset");
  },
);

auditRuleTest(
  [
    {
      rule: "promoted-layer-offset",
      kind: "silent",
      reason: "the nearest legitimate neighbour: the SAME promoted panel landing on the grid — promotion is not the defect, an off-grid promoted landing is",
    },
  ],
  "promoted-layer-offset proof: silent on its nearest legitimate neighbour",
  () => {
    expect(checkPromotedLayerOffset(promotedLayer())).toBeNull();
  },
);

auditRuleTest(
  [
    {
      rule: "off-grid-transform",
      kind: "fires",
      reason: "a resting scale of 0.95 resamples every glyph and edge under it for the element's whole life — Law 2's resolved arm, whatever the offset is",
    },
  ],
  "off-grid-transform proof: fires",
  () => {
    expect(checkOffGridTransform(restTransform({ scaleX: 0.95, scaleY: 0.95, transform: "matrix(0.95, 0, 0, 0.95, 0, 0)" }))?.rule).toBe("off-grid-transform");
  },
);

auditRuleTest(
  [
    {
      rule: "off-grid-transform",
      kind: "silent",
      reason:
        "the nearest legitimate neighbour: the SAME element carrying an INTEGER-landing translation — a transform is not the defect, a resampling one is, and this is the live jump-to-latest pill's rest state",
    },
  ],
  "off-grid-transform proof: silent on its nearest legitimate neighbour",
  () => {
    expect(checkOffGridTransform(restTransform({ translated: true, transform: "matrix(1, 0, 0, 1, 0, 8)" }))).toBeNull();
  },
);

describe("design-audit off-grid-text (crispness Law 4)", () => {
  test("a promoted text landing 0.125 device px off the grid FIRES at P2 and names the promoting ancestor", () => {
    const finding = checkOffGridText(offGridText({ leftDeviceFrac: 0.125 }));
    expect(finding?.severity).toBe("P2");
    expect(finding?.value).toContain("backdrop-filter");
    // The repair is at the LAYER, not the text — the finding has to say so or it routes the fix wrong.
    expect(finding?.message).toContain("[data-slot=config-list-panel]");
  });

  test("the vertical residual fires too — Law 1 closed the line-box arithmetic, not the horizontal class", () => {
    expect(checkOffGridText(offGridText({ topDeviceFrac: -0.375 }))?.rule).toBe("off-grid-text");
  });

  test("the reading-surface exemption is the gate's row, mirrored — never re-decided here", () => {
    // The walker excludes the subtree BEFORE judgment (it is a population fact, not a verdict), so the
    // check has no arm for it. This pins the mirror itself: one selector, one end condition.
    expect(GRID_EXEMPTIONS.readingSurface.selector).toBe('[data-slot="message-bubble"]');
    expect(GRID_EXEMPTIONS.readingSurface.why).toContain("round() belt");
  });
});

describe("design-audit off-grid landings across the DPR matrix", () => {
  // The walker normalizes to DEVICE pixels in the page, so these are the arms that prove one epsilon is
  // correct everywhere. A CSS half-pixel is 0.5 device px at DPR 1, 0.25 at DPR 2 (still off-grid), and
  // lands exactly ON the grid at DPR 2 when the CSS offset is a quarter — the arm a DPR-1 assumption
  // would file as a defect on every retina run.
  test("DPR 1: a CSS half-pixel is a real off-grid landing", () => {
    expect(checkOffGridText(offGridText({ dpr: 1, leftDeviceFrac: 0.5 }))?.rule).toBe("off-grid-text");
  });

  test("DPR 1.25: the 12-of-15 font-scale stops that produce a fractional root land here", () => {
    expect(checkOffGridText(offGridText({ dpr: 1.25, topDeviceFrac: 0.25 }))?.rule).toBe("off-grid-text");
    expect(checkOffGridText(offGridText({ dpr: 1.25 }))).toBeNull();
  });

  test("DPR 2: a CSS quarter-pixel is still off-grid, a CSS half-pixel is CRISP", () => {
    expect(checkOffGridText(offGridText({ dpr: 2, leftDeviceFrac: 0.5 }))?.rule).toBe("off-grid-text");
    // 0.5 CSS px x DPR 2 = 1 device px = an integer landing, which the walker normalizes to 0.
    expect(checkOffGridText(offGridText({ dpr: 2, leftDeviceFrac: 0 }))).toBeNull();
  });

  test("float noise from the * dpr multiply never fires", () => {
    expect(checkOffGridText(offGridText({ dpr: 1.25, leftDeviceFrac: 1e-9, topDeviceFrac: -1e-9 }))).toBeNull();
  });
});

describe("design-audit promoted-layer-offset (crispness Law 3)", () => {
  test("each promotion kind reports itself, so the repair knows what to drop", () => {
    for (const promotion of ["backdrop-filter", "will-change", "3d"]) {
      const finding = checkPromotedLayerOffset(promotedLayer({ promotion, topDeviceFrac: 0.5 }));
      expect(finding?.value).toContain(promotion);
    }
  });

  test("an on-grid promoted layer is silent at every DPR arm", () => {
    for (const dpr of [1, 1.25, 2]) {
      expect(checkPromotedLayerOffset(promotedLayer({ dpr }))).toBeNull();
    }
  });

  // #1172 — a promotion carried by a ::before is the SAME defect with a DIFFERENT repair site. The pseudo
  // has no box of its own to move, so a message telling the reader to "give the layer an integer offset"
  // names a thing they cannot edit. Both arms are pinned because getting only one right is how the pseudo
  // cohort ended up invisible in the first place.
  test("a pseudo-carried promotion names its carrier and sends the repair to the HOST", () => {
    const carried = checkPromotedLayerOffset(promotedLayer({ pseudo: "::before", topDeviceFrac: 0.5 }));
    expect(carried?.rule).toBe("promoted-layer-offset");
    expect(carried?.message).toContain("this element's ::before promotes itself");
    expect(carried?.message, "the pseudo cannot be nudged — the host's landing is the repair").toContain("Give the HOST an integer landing");
  });

  test("the element arm is unchanged by the pseudo arm — no carrier, no pseudo language", () => {
    const element = checkPromotedLayerOffset(promotedLayer({ topDeviceFrac: 0.5 }));
    expect(element?.message).toContain("this element promotes itself");
    expect(element?.message).not.toContain("::before");
    expect(element?.message).toContain("Give the layer an integer offset");
  });

  test("a pseudo-carried promotion ON the grid is still silent — the carrier is not the defect", () => {
    expect(checkPromotedLayerOffset(promotedLayer({ pseudo: "::after" }))).toBeNull();
  });
});

describe("design-audit off-grid-transform (crispness Law 2, resolved arm)", () => {
  test("a resting scale fires even when the box lands perfectly on the grid", () => {
    const finding = checkOffGridTransform(restTransform({ scaleX: 1.02, scaleY: 1.02, topDeviceFrac: 0, leftDeviceFrac: 0 }));
    expect(finding?.severity).toBe("P3");
    expect(finding?.value).toContain("resting scale");
  });

  test("a single-axis resting scale is not the hole in a both-axes test", () => {
    expect(checkOffGridTransform(restTransform({ scaleX: 1.05 }))?.rule).toBe("off-grid-transform");
    expect(checkOffGridTransform(restTransform({ scaleY: 0.9 }))?.rule).toBe("off-grid-transform");
  });

  test("a fractional resting TRANSLATION fires, and an untranslated identity matrix does not", () => {
    expect(checkOffGridTransform(restTransform({ translated: true, leftDeviceFrac: -0.5 }))?.value).toContain("resting translation");
    // Same landing, no translation: the fraction belongs to layout, and Law 3/4 own it — not this rule.
    expect(checkOffGridTransform(restTransform({ translated: false, leftDeviceFrac: -0.5 }))).toBeNull();
  });

  test("a decomposed identity that round-trips to 0.9999999999 is not a scale", () => {
    expect(checkOffGridTransform(restTransform({ scaleX: 0.999_999_999_9, scaleY: 1.000_000_000_1 }))).toBeNull();
  });
});
