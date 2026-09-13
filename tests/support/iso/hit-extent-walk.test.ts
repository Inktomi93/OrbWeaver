// The hit-extent envelope arithmetic, against RESOLVED STYLE STRINGS CHROME ACTUALLY ANSWERED WITH.
//
// This suite exists because the geometry half of the walk is a pure function of plain data (that is why
// `readPseudoGeometry` is a dumb reader — see the module header): the eligibility clauses and the rect
// arithmetic are the part that decides whether a control's tap target is 26px or 161px, and they should
// not be reachable only through a browser run. Every `PseudoStyleFacts` below is a VERBATIM capture from
// `pnpm snap --file … --mobile --eval "getComputedStyle(el, '::before')…"` on 2026-09-13, not a
// hand-written guess — a hand-written guess is how "the resolved value is `auto`" style assumptions get
// baked into an instrument.
import { describe, expect, test } from "vitest";
import type { HitGeometry, PseudoStyleFacts } from "./hit-extent-walk.ts";
import { pseudoHitEnvelope, pseudoHitRect } from "./hit-extent-walk.ts";

/** No pseudo at all — what Chrome answers for an element with no `content`. */
const ABSENT: PseudoStyleFacts = {
  content: "none",
  position: "static",
  pointerEvents: "auto",
  visibility: "visible",
  display: "block",
  left: "auto",
  right: "auto",
  top: "auto",
  bottom: "auto",
  translate: "none",
  transform: "none",
  rotate: "none",
  scale: "none",
};

/** The shipped hit area: `TOUCH_TARGET_PSEUDO` / `glyphBox` — 55px centred over a 25px box at a coarse
 *  pointer, spelled by Tailwind as `top/left: 50%` + the standalone `translate` property. */
const HIT_BEFORE: PseudoStyleFacts = {
  ...ABSENT,
  content: '""',
  position: "absolute",
  left: "12.5px",
  right: "-42.5px",
  top: "12.5px",
  bottom: "-42.5px",
  translate: "-50% -50%",
};

/** The same shape spelled with a `transform` matrix instead of the `translate` property (hand-written CSS
 *  and older utilities both produce this). */
const HIT_BEFORE_MATRIX: PseudoStyleFacts = { ...HIT_BEFORE, translate: "none", transform: "matrix(1, 0, 0, 1, -27.5, -27.5)" };

/** The CTA gradient ring alone: `inset: 0` on a 25px box with a 1px border, and untappable. */
const CTA_RING: PseudoStyleFacts = {
  ...ABSENT,
  content: '""',
  position: "absolute",
  pointerEvents: "none",
  left: "0px",
  right: "0px",
  top: "0px",
  bottom: "0px",
};

/** A 25x25 control at (120,120) with no border — the glyph-sm box every capture above was taken from.
 *  `layoutWidth`/`layoutHeight` MATCH the border rect, i.e. no ancestor is transforming it; the
 *  scaled-ancestor arm below is the case where they do not. */
function geometry(before: PseudoStyleFacts, after: PseudoStyleFacts): HitGeometry {
  return {
    border: { left: 120, top: 120, right: 145, bottom: 145 },
    layoutWidth: 25,
    layoutHeight: 25,
    ownPosition: "relative",
    borderLeftWidth: "0px",
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    before,
    after,
  };
}

describe("pseudoHitRect", () => {
  test("resolves a centred touch-target ::before to the rect the compositor paints", () => {
    // 55px centred on the box's centre (132.5, 132.5) — 15px of outward reach on every side.
    expect(pseudoHitRect(HIT_BEFORE, geometry(HIT_BEFORE, ABSENT))).toEqual({ left: 105, top: 105, right: 160, bottom: 160 });
  });

  test("reads the `transform` matrix spelling to the identical rect", () => {
    expect(pseudoHitRect(HIT_BEFORE_MATRIX, geometry(HIT_BEFORE_MATRIX, ABSENT))).toEqual({ left: 105, top: 105, right: 160, bottom: 160 });
  });

  test("refuses the CTA ring: `inset: 0` reaches nowhere, so it is a decoration and not a target", () => {
    expect(pseudoHitRect(CTA_RING, geometry(ABSENT, CTA_RING))).toBeNull();
  });

  test("refuses an OUTWARD pseudo that cannot take a pointer — the pre-#1843 collision (#2300)", () => {
    // The unlayered ring wins `inset`/`pointer-events`; the hit-area utilities' size and centring survive,
    // so this rect DOES reach past the border box. Geometry alone would credit it; the pointer clause is
    // the only thing that does not.
    const collided: PseudoStyleFacts = { ...HIT_BEFORE, pointerEvents: "none", left: "0px", right: "-30px", top: "0px", bottom: "-30px" };
    expect(pseudoHitRect({ ...collided, pointerEvents: "auto" }, geometry(ABSENT, collided)), "the control arm: this rect IS outward").not.toBeNull();
    expect(pseudoHitRect(collided, geometry(ABSENT, collided))).toBeNull();
  });

  test("refuses a control under a SCALED ancestor instead of over-crediting it (#2300 ledger row 4)", () => {
    // THE MIX THAT OVER-CREDITED (cb-v-hit-geometry, 2026-09-13). `border` is post-transform, the resolved
    // insets are local px. A 0.5-scaled ancestor halves the border rect (25px box → 12.5px on screen at
    // 120,120) while `left: 12.5px` / `right: -42.5px` stay local, so the old arithmetic answered
    // {111.25, 111.25, 153.75, 153.75} — a band running ~14px PAST the pseudo's real reach of
    // {112.5, 112.5, 140, 140}. The layout box is transform-free, so its disagreement with the border rect
    // is the tell, and the answer is a refusal (under-report), never a guessed conversion.
    const scaled: HitGeometry = { ...geometry(HIT_BEFORE, ABSENT), border: { left: 120, top: 120, right: 132.5, bottom: 132.5 } };
    const overCredited = { left: 111.25, top: 111.25, right: 153.75, bottom: 153.75 };
    // The OLD answer, reconstructed exactly: with the layout box lying about the scale, nothing refuses.
    expect(pseudoHitRect(HIT_BEFORE, { ...scaled, layoutWidth: 12.5, layoutHeight: 12.5 }), "the over-credit this arm exists to stop").toEqual(overCredited);
    // The NEW answer: the real layout box (25px, untransformed) disagrees with the 12.5px border rect.
    expect(pseudoHitRect(HIT_BEFORE, scaled)).toBeNull();
    // …and "no offset box to ask" (an SVG host) is CANNOT-TELL, which lands on the same refusal.
    expect(pseudoHitRect(HIT_BEFORE, { ...geometry(HIT_BEFORE, ABSENT), layoutWidth: -1, layoutHeight: -1 })).toBeNull();
  });

  test("refuses what it cannot state: an `auto` inset, a static host, a rotation, a hidden pseudo", () => {
    expect(pseudoHitRect({ ...HIT_BEFORE, visibility: "collapse" }, geometry(HIT_BEFORE, ABSENT)), "collapse is hidden by another spelling").toBeNull();
    expect(pseudoHitRect({ ...HIT_BEFORE, display: "contents" }, geometry(HIT_BEFORE, ABSENT)), "a box-less pseudo paints nothing to tap").toBeNull();
    expect(pseudoHitRect({ ...HIT_BEFORE, left: "auto", right: "auto" }, geometry(HIT_BEFORE, ABSENT)), "an unresolvable inset").toBeNull();
    expect(pseudoHitRect(HIT_BEFORE, { ...geometry(HIT_BEFORE, ABSENT), ownPosition: "static" }), "the containing block is some ancestor").toBeNull();
    expect(pseudoHitRect({ ...HIT_BEFORE, rotate: "45deg" }, geometry(HIT_BEFORE, ABSENT)), "a rotated rect is not four numbers").toBeNull();
    expect(pseudoHitRect({ ...HIT_BEFORE, transform: "matrix(2, 0, 0, 2, 0, 0)" }, geometry(HIT_BEFORE, ABSENT)), "a scaled rect either").toBeNull();
    expect(pseudoHitRect({ ...HIT_BEFORE, visibility: "hidden" }, geometry(HIT_BEFORE, ABSENT)), "an invisible pseudo").toBeNull();
    expect(pseudoHitRect({ ...HIT_BEFORE, position: "fixed" }, geometry(HIT_BEFORE, ABSENT)), "a viewport-anchored pseudo").toBeNull();
  });
});

describe("pseudoHitEnvelope", () => {
  test("is null for a control with no pseudo — an ancestor is then only the wrapper's padding (#662)", () => {
    expect(pseudoHitEnvelope(geometry(ABSENT, ABSENT))).toBeNull();
  });

  test("is the hit area alone when the other pseudo is an inward decoration (the shipped glyph button)", () => {
    expect(pseudoHitEnvelope(geometry(HIT_BEFORE, CTA_RING))).toEqual({ left: 105, top: 105, right: 160, bottom: 160 });
  });

  test("unions two outward pseudos rather than picking one", () => {
    const wide: PseudoStyleFacts = { ...HIT_BEFORE, translate: "none", left: "-40px", right: "-40px", top: "0px", bottom: "0px" };
    expect(pseudoHitEnvelope(geometry(HIT_BEFORE, wide))).toEqual({ left: 80, top: 105, right: 185, bottom: 160 });
  });
});
