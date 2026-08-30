// CONTROL GEOMETRY + navigability: tap targets (pointer-conditional floors) + control silhouette +
// accessible names + landmark + tabindex + heading order. Pure; thresholds cited.
// Provenance: lib/collect.ts header.
import type { Finding, Severity } from "../contract/findings.ts";
import type { AccessibleNameInput, ControlAspectInput, HeadingSample, LandmarkInput, TabIndexInput, TapTargetInput } from "../contract/samples.ts";

// ── Tap targets ──────────────────────────────────────────────────────────────
// The relevant floor is pointer-conditional (D62): coarse/touch owes the AAA 2.5.5 44px target,
// fine pointer only owes the AA 2.5.8 24px minimum — `checkTapTarget` takes the pointer type
// the page was measured under so desktop density isn't flagged against the touch floor.
const TAP_COARSE_WARN_PX = 44; // WCAG 2.5.5 (AAA) — recommended touch target on a coarse pointer
const TAP_COARSE_FAIL_PX = 32; // below this even a coarse pointer can't reliably hit — hard floor
const TAP_FINE_MIN_PX = 24; // WCAG 2.5.8 (AA) — the only target-size floor a mouse actually owes

export function checkTapTarget(input: TapTargetInput, pointerCoarse: boolean): Finding | null {
  // A LOWER BOUND IS NOT A SIZE (#797). The walker flags a measurement whose outward probe ring fell off
  // the viewport with no in-frame radius having genuinely failed: the control may own more than the number
  // below, so a sub-target verdict here is the phantom P1 that made this rule's raw count untrustworthy for
  // a whole UX review (18 P1s at one viewport height, p1=0 at another, identical element census). The
  // control is NOT dropped — `censusReach.frameTruncated` counts and the runner prints every withholding,
  // because "unmeasured" and "fine" must never render identically.
  if (input.extentTruncated === true) {
    return null;
  }
  const shortSide = Math.min(input.width, input.height);
  if (pointerCoarse) {
    if (shortSide >= TAP_COARSE_WARN_PX) {
      return null;
    }
    const severity: Severity = shortSide < TAP_COARSE_FAIL_PX ? "P1" : "P2";
    const floor = severity === "P1" ? `${TAP_COARSE_FAIL_PX}px hard floor` : `${TAP_COARSE_WARN_PX}px recommended minimum`;
    return {
      rule: "tap-target",
      severity,
      selector: input.selector,
      value: `${Math.round(input.width)}×${Math.round(input.height)}px`,
      message: `interactive element's short side is ${Math.round(shortSide)}px — below the ${floor}; grow the hit area to ≥${TAP_COARSE_WARN_PX}×${TAP_COARSE_WARN_PX}px`,
      origin: "orbweaver",
    };
  }
  if (shortSide >= TAP_FINE_MIN_PX) {
    return null;
  }
  return {
    rule: "tap-target",
    severity: "P1",
    selector: input.selector,
    value: `${Math.round(input.width)}×${Math.round(input.height)}px`,
    message: `interactive element's short side is ${Math.round(shortSide)}px — below WCAG AA's ${TAP_FINE_MIN_PX}px minimum (fine pointer); grow the hit area to ≥${TAP_FINE_MIN_PX}×${TAP_FINE_MIN_PX}px`,
    origin: "orbweaver",
  };
}

// ── Control silhouette ───────────────────────────────────────────────────────
// A track control's SHAPE is its affordance. A switch is recognisable because the track is a LANE the
// thumb travels down; collapse the lane toward square and the same pixels read as a glyph. Measured
// live at 48x44 — aspect 1.091, track painting on all four sides of the thumb — and read as a crescent
// moon rather than a toggle by a reviewer who did not know it was a switch
// (docs/reviews/side-eye/2026-08-22-switch-shape-and-glow-evidence.md ITEM 1). The shipped fix is 64x44
// (aspect 1.455). Before this rule the whole class was INVISIBLE to the detector: that audit ran green
// on the defective geometry and the reviewer had to record "a green design-audit is a floor, not a
// verdict" (same doc, Instrument coverage row 2). This rule is that row's answer.
//
// THE RATIO IS LONG/SHORT, NEVER WIDTH/HEIGHT — that is what makes ORIENTATION a non-carve instead of a
// special case. A vertical slider track (20x200) and a horizontal one (200x20) are both 10.0 here; only a
// box near SQUARE — which is the actual defect, on either axis — falls below the floor. A width/height
// ratio would have to sniff `aria-orientation` and would flag every vertical track in the product.
//
// RTL IS NOT A CARVE EITHER, deliberately: `direction: rtl` MIRRORS a track, it does not rotate it, so
// width and height are unchanged and the silhouette claim holds byte-for-byte in both directions.
const CONTROL_ASPECT_FLOOR = 1.4;

/** Which roles owe a directional silhouette, and the silhouette each owes — a Map so a new role is one
 *  ROW here and needs no walker edit (the walker censuses every explicitly-roled element and judges
 *  nothing). Two roles were considered and REFUSED, each with its receipt:
 *
 *  - `progressbar`: an indeterminate/circular progress ring is a legitimate, deliberate CIRCLE (aspect
 *    1.0) and is geometrically INDISTINGUISHABLE from a collapsed bar. A rule that cannot tell the
 *    sanctioned shape from the defect is a coin flip, not a detector.
 *  - `slider`: on this tree `role="slider"` does not land on the track at all — Base UI puts it on the
 *    visually-hidden native `<input type="range">` INSIDE the thumb (receipt:
 *    tests/ui/primitives/slider/slider.ct.tsx:129-131), and ARIA generally puts it on the focusable
 *    THUMB of a range widget, which is a circle by design. Judging the track would mean keying on a
 *    product-specific `data-slot`, and this walker hardcodes no product name by law. So the track's
 *    silhouette is out of this lens's reach and is DECLARED so rather than approximated.
 *
 *  Also deliberately absent: `checkbox`/`radio`, which are square BY design and correctly so. */
const CONTROL_SILHOUETTES = new Map<string, string>([["switch", "a track long enough for the thumb to visibly travel down it"]]);

/** Fires when a track control's rendered box collapses toward square. P2: the control still works, is
 *  named, and meets its tap-target floor — what it loses is RECOGNITION (Nielsen 6), which is a defect of
 *  the affordance rather than of access. */
export function checkControlAspect(input: ControlAspectInput): Finding | null {
  const silhouette = CONTROL_SILHOUETTES.get(input.role);
  if (silhouette === undefined) {
    return null;
  }
  // A box read mid-animation measures a moment, not a design (the retracted mid-transition travel
  // reading in #420 is the same trap one layer down). DECLARED LIMIT: a control under a PERMANENTLY
  // running animation is permanently unjudged here — the honest direction, since the alternative is
  // minting a verdict from a frame.
  if (input.animating) {
    return null;
  }
  const shortSide = Math.min(input.width, input.height);
  const longSide = Math.max(input.width, input.height);
  if (shortSide <= 0) {
    return null; // a degenerate box has no silhouette to judge (and no ratio to compute)
  }
  const aspect = longSide / shortSide;
  if (aspect >= CONTROL_ASPECT_FLOOR) {
    return null;
  }
  return {
    rule: "control-aspect",
    severity: "P2",
    selector: input.selector,
    value: `${Math.round(input.width)}×${Math.round(input.height)}px, aspect ${aspect.toFixed(2)}`,
    message: `role="${input.role}" renders at aspect ${aspect.toFixed(2)} — below the ${CONTROL_ASPECT_FLOOR} silhouette floor; the role implies ${silhouette}, and a track collapsed toward square reads as a glyph rather than as a control`,
    origin: "orbweaver",
  };
}

/** Any of aria-labelledby/aria-label/visible text/title/alt satisfies "has a name"; the probe
 *  doesn't need the browser's exact precedence order since it never computes what the name IS. */
export function checkAccessibleName(input: AccessibleNameInput): Finding | null {
  const hasName =
    input.hasVisibleText ||
    Boolean(input.ariaLabel?.trim()) ||
    Boolean(input.ariaLabelledbyText?.trim()) ||
    Boolean(input.title?.trim()) ||
    Boolean(input.altText?.trim());
  if (hasName) {
    return null;
  }
  return {
    rule: "aria-name",
    severity: "P1",
    selector: input.selector,
    value: "no accessible name",
    message: `<${input.tag}> is interactive but exposes no accessible name — add visible text, aria-label, aria-labelledby, title, or alt`,
    origin: "orbweaver",
  };
}

export function checkMainLandmark(input: LandmarkInput): Finding | null {
  if (input.main) {
    return null;
  }
  return {
    rule: "landmark-missing",
    severity: "P2",
    selector: "body",
    value: "no <main>/role=main",
    message: 'page has no main landmark — wrap primary content in <main> or role="main"',
    origin: "orbweaver",
  };
}

export function checkTabIndexSmell(input: TabIndexInput): Finding | null {
  if (input.tabIndex <= 0) {
    return null;
  }
  return {
    rule: "tabindex-positive",
    severity: "P2",
    selector: input.selector,
    value: `tabindex=${input.tabIndex}`,
    message: 'positive tabindex overrides natural DOM order — breaks predictable keyboard navigation; use tabindex="0" and reorder in the DOM instead',
    origin: "orbweaver",
  };
}

export function checkHeadingOrder(headings: readonly HeadingSample[]): Finding[] {
  const findings: Finding[] = [];
  let prevLevel = 0;
  let prevText = "";
  for (const h of headings) {
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      findings.push({
        rule: "skipped-heading",
        severity: "P2",
        selector: `h${h.level}`,
        value: `h${prevLevel} "${prevText}" → h${h.level} "${h.text}"`,
        message: `heading level skips from h${prevLevel} to h${h.level} (missing h${prevLevel + 1}) — screen readers navigate by heading hierarchy (UIP §13.10 N7)`,
        origin: "impeccable",
      });
    }
    prevLevel = h.level;
    prevText = h.text;
  }
  return findings;
}
