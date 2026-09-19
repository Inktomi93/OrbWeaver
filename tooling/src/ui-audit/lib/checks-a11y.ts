// CONTROL GEOMETRY: tap targets (pointer-conditional floors) + control silhouette + OBSCURED targets
// (#816). Pure; thresholds cited. Provenance: lib/collect.ts header. The NAVIGABILITY half this file used
// to carry — accessible names, unreachable hints, landmark, tabindex, heading order — is
// `checks-a11y-navigability.ts`; the two left together at the tooling 450-line cap, along the seam this
// header already named.
import type { CandidateDisposition, Finding, RulePopulationAccounting, Severity } from "../contract/findings.ts";
import { WITHHELD_REASONS } from "../contract/findings.ts";
import type { ControlAspectInput, ObscuredTargetInput, TapTargetInput } from "../contract/samples.ts";
import { settledPopulationAccounting } from "./population.ts";

// ── Tap targets ──────────────────────────────────────────────────────────────
// The relevant floor is pointer-conditional (D62): coarse/touch owes the AAA 2.5.5 44px target,
// fine pointer only owes the AA 2.5.8 24px minimum — `checkTapTarget` takes the pointer type
// the page was measured under so desktop density isn't flagged against the touch floor.
const TAP_COARSE_WARN_PX = 44; // WCAG 2.5.5 (AAA) — recommended touch target on a coarse pointer
const TAP_COARSE_FAIL_PX = 32; // below this even a coarse pointer can't reliably hit — hard floor
const TAP_FINE_MIN_PX = 24; // WCAG 2.5.8 (AA) — the only target-size floor a mouse actually owes

/** The one declaration this rule honours (#1381). Spelled once; the client stamps the same literal. */
const RULED_SUB_FLOOR = "sub-floor-ok";

/** A PRICED, RECORDED sub-floor decision, declared on the control itself — and honoured at FINE POINTER
 *  ONLY. Coarse is where the floor is a reachability fact rather than a density preference (the transcript
 *  disclosure takes the real 44px floor there through a shared fragment), so a coarse regression must
 *  still fire; a declaration that silenced both would be an off switch, not a ruling. */
function isRuledSubFloor(input: TapTargetInput, pointerCoarse: boolean): boolean {
  return !pointerCoarse && input.ruledTargetFloor === RULED_SUB_FLOOR;
}

export function checkTapTarget(input: TapTargetInput, pointerCoarse: boolean): Finding | null {
  if (isRuledSubFloor(input, pointerCoarse)) {
    return null;
  }
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

const TAP_TARGET_REPRESENTATIVE_CAP = 5;

interface TapTargetPopulationResult {
  readonly findings: readonly Finding[];
  readonly accounting: RulePopulationAccounting;
}

interface JudgedTapTarget {
  readonly input: TapTargetInput;
  readonly finding: Finding | null;
  /** Excluded by a rendered sub-floor ruling (#1381). Carried on the row rather than re-derived, so the
   *  DENOMINATOR and the accounting cannot disagree about it — the defect #1566 caught was exactly that
   *  split: `excluded(ruledSubFloor=1)` beside a printed "(2 affected of 3 judged)", because only the
   *  accounting subtracted the exclusion and the per-group `measured` set did not. One predicate, one
   *  evaluation, two readers. */
  readonly ruledOut: boolean;
}

function tapTargetDecisionKey(input: TapTargetInput): string {
  // Fixture sample sets predating #983 have no authored identity. Their selector is the only honest
  // identity available, so they retain the pre-population one-row-per-target contract.
  return `${input.authoredTarget ?? input.selector}\u0000${input.authoredHome ?? input.selector}`;
}

function nestedOwnedTargets(rows: readonly JudgedTapTarget[]): ReadonlySet<string> {
  const failingById = new Map(rows.flatMap((row) => (row.finding === null || row.input.targetId === undefined ? [] : [[row.input.targetId, row] as const])));
  const nestedOwned = new Set<string>();
  for (const { input, finding } of rows) {
    const sameDecisionAncestor = (input.ancestorTargetIds ?? []).some((id) => {
      const ancestor = failingById.get(id);
      return ancestor !== undefined && tapTargetDecisionKey(ancestor.input) === tapTargetDecisionKey(input);
    });
    if (finding !== null && input.targetId !== undefined && sameDecisionAncestor) {
      nestedOwned.add(input.targetId);
    }
  }
  return nestedOwned;
}

function targetDecisionGroups(rows: readonly JudgedTapTarget[], nestedOwned: ReadonlySet<string>): ReadonlyMap<string, readonly JudgedTapTarget[]> {
  const byDecision = new Map<string, JudgedTapTarget[]>();
  for (const row of rows) {
    if (row.input.targetId !== undefined && nestedOwned.has(row.input.targetId)) {
      continue;
    }
    const key = tapTargetDecisionKey(row.input);
    const group = byDecision.get(key);
    if (group === undefined) {
      byDecision.set(key, [row]);
    } else {
      group.push(row);
    }
  }
  return byDecision;
}

interface TapTargetFindings {
  readonly findings: readonly Finding[];
  readonly affected: number;
  readonly representatives: number;
  readonly capped: number;
}

function targetPopulationFindings(groups: ReadonlyMap<string, readonly JudgedTapTarget[]>): TapTargetFindings {
  const findings: Finding[] = [];
  let affected = 0;
  let representatives = 0;
  let capped = 0;
  for (const group of groups.values()) {
    // THE DENOMINATOR IS WHAT THIS RULE ACTUALLY JUDGED. A truncated extent is an absent measurement and
    // a ruled sub-floor is a proven exclusion — different polarities, same consequence here: neither was
    // judged, so neither may be counted in the "N affected of M judged" a reader acts on (#1566).
    const measured = group.filter(({ input, ruledOut }) => input.extentTruncated !== true && !ruledOut);
    const failures = measured.filter((row) => row.finding !== null);
    const first = failures[0];
    if (first?.finding === null || first === undefined) {
      continue;
    }
    const representativeSelectors = failures.slice(0, TAP_TARGET_REPRESENTATIVE_CAP).map(({ input }) => input.selector);
    const groupCapped = failures.length - representativeSelectors.length;
    const severity: "P1" | "P2" = failures.some(({ finding }) => finding?.severity === "P1") ? "P1" : "P2";
    const sizes = failures.map(({ input }) => Math.round(Math.min(input.width, input.height)));
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    affected += failures.length;
    representatives += representativeSelectors.length;
    capped += groupCapped;
    findings.push({
      rule: "tap-target",
      severity,
      selector: representativeSelectors[0] ?? first.input.selector,
      value: `${String(failures.length)} affected of ${String(measured.length)} judged; short side ${String(minSize)}${minSize === maxSize ? "" : `–${String(maxSize)}`}px; ${String(representativeSelectors.length)} representative(s), ${String(groupCapped)} capped`,
      message:
        "rendered instances sharing one authored target-size decision miss the pointer-conditional floor — repair the component/home once; the affected population and bounded representative selectors are retained in the report",
      origin: "orbweaver",
      representatives: representativeSelectors,
      population: { affected: failures.length, judged: measured.length, capped: groupCapped },
    });
  }
  return { findings, affected, representatives, capped };
}

/** Converts per-instance geometry into one actionable row per authored target-size decision. The raw
 * checker remains public and unchanged; this is the collection contract used by the shipped CLI. */
export function checkTapTargetPopulations(inputs: readonly TapTargetInput[], pointerCoarse: boolean): TapTargetPopulationResult {
  const identityRows = inputs.filter(
    ({ targetId, ancestorTargetIds, authoredTarget, authoredHome }) =>
      targetId !== undefined && ancestorTargetIds !== undefined && authoredTarget !== undefined && authoredHome !== undefined,
  ).length;
  if (identityRows !== 0 && identityRows !== inputs.length) {
    throw new Error(`INSTRUMENT ERROR: tap-target identity is partial (${String(identityRows)}/${String(inputs.length)})`);
  }
  // ONE evaluation of the ruling predicate, read by both the denominator and the accounting (#1566).
  const judged: JudgedTapTarget[] = inputs.map((input) => ({
    input,
    finding: checkTapTarget(input, pointerCoarse),
    ruledOut: isRuledSubFloor(input, pointerCoarse),
  }));
  const nestedOwned = nestedOwnedTargets(judged);
  const result = targetPopulationFindings(targetDecisionGroups(judged, nestedOwned));
  const extentTruncated = inputs.filter((input) => input.extentTruncated === true).length;
  // EXCLUDED, NOT WITHHELD, and never a silent skip (#1381): the control MEASURED fine and declared a
  // recorded ruling placing it outside this rule's population at fine pointer — that is proof of
  // inapplicability, the exact polarity `excluded` carries. A truncated extent, by contrast, is an absent
  // measurement and stays `withheld`. Both are counted, so the denominator still names every candidate.
  const ruledSubFloor = judged.filter(({ input, ruledOut }) => input.extentTruncated !== true && ruledOut).length;
  if (result.affected > inputs.length - extentTruncated - ruledSubFloor || result.representatives + result.capped !== result.affected) {
    throw new Error("INSTRUMENT ERROR: tap-target population accounting does not settle");
  }
  const accounting = settledPopulationAccounting("tap-target", {
    candidates: inputs.length,
    judged: inputs.length - extentTruncated - ruledSubFloor,
    affected: result.affected + nestedOwned.size,
    populations: result.findings.length,
    emitted: result.representatives,
    withheld: { extentTruncated, [WITHHELD_REASONS.representativeCap]: result.capped },
    excluded: { ruledSubFloor },
    collapsed: { sameOwner: nestedOwned.size },
  });
  return {
    findings: result.findings,
    accounting,
  };
}

// ── Control silhouette ───────────────────────────────────────────────────────
// A track control's SHAPE is its affordance. A switch is recognisable because the track is a LANE the
// thumb travels down; collapse the lane toward square and the same pixels read as a glyph. Measured
// live at 48x44 — aspect 1.091, track painting on all four sides of the thumb — and read as a crescent
// moon rather than a toggle by a reviewer who did not know it was a switch
// (docs/history/reviews/side-eye/2026-08-22-switch-shape-and-glow-evidence.md ITEM 1). The shipped fix is 64x44
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

/** `control-aspect`'s own disposition — the ContrastOutcome posture in checks-color.ts. The census is
 *  EVERY explicitly-roled visible element (the walker judges nothing), so the overwhelming majority of
 *  candidates are roles this lens does not govern: that is a closed EXCLUSION, not a silent decline, and
 *  before the partition existed a clean row was indistinguishable from "the switch census never ran".
 *  The two remaining declines are genuine WITHHOLDINGS — an animating box and a degenerate one are
 *  applicable controls the instrument cannot measure, which is exactly what makes a run NO VERDICT. */
export function classifyControlAspect(input: ControlAspectInput): CandidateDisposition {
  const silhouette = CONTROL_SILHOUETTES.get(input.role);
  if (silhouette === undefined) {
    return { kind: "excluded", reason: "roleWithoutSilhouette" };
  }
  // A box read mid-animation measures a moment, not a design (the retracted mid-transition travel
  // reading in #420 is the same trap one layer down). DECLARED LIMIT: a control under a PERMANENTLY
  // running animation is permanently unjudged here — the honest direction, since the alternative is
  // minting a verdict from a frame.
  if (input.animating) {
    return { kind: "withheld", reason: "animating" };
  }
  const shortSide = Math.min(input.width, input.height);
  const longSide = Math.max(input.width, input.height);
  if (shortSide <= 0) {
    return { kind: "withheld", reason: "degenerateBox" }; // no silhouette to judge, and no ratio to compute
  }
  return { kind: "judged", finding: aspectFinding(input, longSide / shortSide, silhouette) };
}

export function checkControlAspect(input: ControlAspectInput): Finding | null {
  const disposition = classifyControlAspect(input);
  return disposition.kind === "judged" ? disposition.finding : null;
}

/** Fires when a track control's rendered box collapses toward square. P2: the control still works, is
 *  named, and meets its tap-target floor — what it loses is RECOGNITION (Nielsen 6), which is a defect of
 *  the affordance rather than of access. */
function aspectFinding(input: ControlAspectInput, aspect: number, silhouette: string): Finding | null {
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

// ── Obscured targets (#816) — the mis-tap, not the size ──────────────────────
// The tap-target rules ask "is this control big enough". They cannot ask "is it still the thing at its
// own centre", and that is the defect a whole mobile review found by hand: a "2 rules" badge overlapping
// the Start button by 48px, where `elementFromPoint` at the badge's centre returns the button's <svg>.
// Every geometric instrument passed it — the collision is INSIDE the dialog, so `--expect-no-overflow`
// had nothing to say, and the badge measured a perfectly healthy box.
//
// The walker only reports a disagreement with a LOCAL neighbour (ops/walker/census-collision.ts), so a
// menu over a row or a scrim over the page never reaches this check — deliberate stacking is not a
// collision, and the hit test, not the geometry, is what tells them apart.

/** The 0-1 ratio the walker reports, rendered as the percentage a human reads. */
const PERCENT = 100;

/** An INTERACTIVE loser is the worse defect: the user aims at a control and presses a different one. An
 *  informative loser (a badge, a count, a label) is still a real defect — it looks pressable and the press
 *  goes somewhere else — but it costs a mis-read rather than a mis-action. */
export function checkObscuredTarget(input: ObscuredTargetInput): Finding {
  const covered = `${Math.round(input.coveredRatio * PERCENT)}%`;
  const what = input.text === "" ? "this element" : `"${input.text}"`;
  return {
    rule: "obscured-target",
    severity: input.interactive ? "P0" : "P1",
    selector: input.selector,
    value: `${covered} covered, ${input.overlapPx}px overlap → hits ${input.hitSelector}`,
    message: `${what} is painted here, but a press at its own centre lands on ${input.hitSelector} — a neighbour is sitting on top of it (${input.overlapPx}px of overlap). ${
      input.interactive
        ? "Aiming at this control activates the other one"
        : "It reads as tappable and the tap goes somewhere else, and the text under the overlap cannot be read"
    }: stop the row's action cluster from being shrink-0 at this width, wrap the row, or give the two a shared line each`,
    origin: "orbweaver",
  };
}
