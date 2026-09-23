// `hover-contrast` — WCAG 2.x math over the pair a control paints WHILE THE POINTER IS ON IT. Pure; the
// forcing is ops/hover.ts's job and every threshold here is the same one `checks-color.ts` uses.
// Provenance/attribution: lib/collect.ts header (adapted from impeccable's checkHoverContrast).
//
// WHY THIS IS ITS OWN RULE ID AND NOT MORE `contrast` ROWS. impeccable emits its hover verdict under the
// existing `low-contrast` id, and that is exactly why our 59-rule adoption triage never saw the rule: a
// rule-by-rule diff against our registry cannot surface a MECHANISM that hides behind an id we already
// have. The second, structural reason is that population accounting in this instrument is keyed by rule
// id — folding hover rows into `contrast` would merge two different denominators (93 texts judged at
// rest vs 11 with hover paint at all) into one unreadable number, and the whole apparatus exists to keep
// a denominator honest.
//
// SCOPED TO FLAT HOVER BACKDROPS, DELIBERATELY. A gradient or image backdrop under a hovered control is
// the `text-over-art` family's question and it is already asked at rest; asking it again in the hover
// state would file the same art-legibility concern twice under a second id. Those are `excluded` with a
// named reason, never silently dropped.
import type { Rgb } from "@orb/tooling/_shared/wcag";
import {
  compositeForeground,
  contrastRatio,
  FOREGROUND_OPACITY_EPS,
  isContrastExempt,
  isLargeText,
  LARGE_MIN_RATIO,
  MEASURABLE_OPACITY_MIN,
  NORMAL_MIN_RATIO,
} from "@orb/tooling/_shared/wcag";
import type { Finding, RulePopulationAccounting } from "../contract/findings.ts";
import type { Backdrop } from "../contract/samples.ts";
import type { HoverContrastInput, HoverScanInput } from "../contract/samples-hover.ts";
import { assertRelationalCensus, settledPopulationAccounting } from "./population.ts";

/** How ONE candidate was disposed of. `checkHoverContrast` is a thin projection of this and
 *  `hoverContrastPopulations` reads the SAME value, so a decline can never be silent in one and counted
 *  as a pass in the other — the `contrastOutcome` posture of checks-color.ts, for the same reason. */
type HoverOutcome =
  | { readonly kind: "withheld"; readonly reason: string }
  | { readonly kind: "excluded"; readonly reason: string }
  | { readonly kind: "judged"; readonly finding: Finding | null };

function sameRgb(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

function sameBackdrop(a: Backdrop, b: Backdrop): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  return a.kind === "flat" && b.kind === "flat" ? sameRgb(a.color, b.color) : a.kind !== "flat";
}

/** The rest verdict this element already carries, so the hover rule never files a row `contrast` owns.
 *  Only a FLAT rest backdrop can answer — anything else is the over-art family's question and leaves the
 *  hover state fair game. */
function restAlreadyFails(input: HoverContrastInput, minRatio: number): boolean {
  return input.restBackdrop.kind === "flat" && contrastRatio(input.restColor, input.restBackdrop.color) < minRatio;
}

/** Every reason this candidate is not a hover-contrast question at all, in one place, so the judging half
 *  below reads as arithmetic. Returns the settled FLAT hover backdrop when the pair is measurable and
 *  genuinely differs from rest — carrying it out is what lets the caller do the math without re-narrowing
 *  the union (and without a fabricated fallback for a branch this function already ruled out). */
function hoverDecline(input: HoverContrastInput, minRatio: number): HoverOutcome | { readonly kind: "measurable"; readonly over: Rgb } {
  // WCAG 1.4.3 exempts inactive components, and `checks-color.ts` honours that at rest. A disabled
  // control that also dims on hover is not a defect twice over.
  if (isContrastExempt(input.inactive)) {
    return { kind: "excluded", reason: "inactiveExempt" };
  }
  // Below the measurable floor the composite IS the backdrop whatever the authored colour is, so a ratio
  // is arithmetic rather than evidence (#466's finding, same threshold).
  if (input.foregroundOpacity < MEASURABLE_OPACITY_MIN) {
    return { kind: "withheld", reason: "dimmed" };
  }
  if (input.hoverBackdrop.kind === "unresolved") {
    return { kind: "withheld", reason: "unresolvedHoverBackdrop" };
  }
  if (input.hoverBackdrop.kind !== "flat") {
    return { kind: "excluded", reason: input.hoverBackdrop.kind === "gradient" ? "gradientHoverBackdrop" : "imageHoverBackdrop" };
  }
  // Nothing about the reading surface moved: the rest verdict IS the hover verdict, and it has already
  // been filed (or already passed) under `contrast`. TWO REASONS a pair reads identical, split so the
  // second one has its own denominator: a control with genuinely no hover paint on this reading surface,
  // versus a control whose own `transition-property` covers color/background-color/all with a non-zero
  // duration — the forced read runs at t≈0 and a live transition has not advanced yet, so THAT identical
  // pair is not proof of no change, it is a read taken before the change was visible (measured, not fixed
  // — the `withheld` call is a separate step once the live split is known).
  if (sameRgb(input.hoverColor, input.restColor) && sameBackdrop(input.hoverBackdrop, input.restBackdrop)) {
    return {
      kind: "excluded",
      reason: input.transitionCoversPaint && input.transitionDurationMs > 0 ? "noHoverChangeButTransitioned" : "noHoverChange",
    };
  }
  return restAlreadyFails(input, minRatio) ? { kind: "excluded", reason: "restAlreadyFails" } : { kind: "measurable", over: input.hoverBackdrop.color };
}

// TWO MECHANISMS, ONE RULE ID: `stateAttr` names the Base UI
// state attribute the pass forced instead of `:hover`; the finding text says which state the reader
// must reproduce, because "while the pointer is on it" sends them chasing a :hover rule that does
// not exist for an attribute-painted row.
interface StateWording {
  readonly stateWord: string;
  readonly backgroundWord: string;
  readonly subjectVerb: string;
  readonly causeNote: string;
}

function stateWordingOf(input: HoverContrastInput): StateWording {
  if (input.stateAttr === undefined || input.stateAttr === null) {
    return {
      stateWord: "hovered",
      backgroundWord: "hover",
      subjectVerb: "is hovered",
      causeNote:
        "exactly while the pointer is on it. A broader selector winning the specificity fight on :hover is the usual cause: check which rule supplies the hover color and which supplies the hover background",
    };
  }
  const valuePart = input.stateAttrValue === undefined || input.stateAttrValue === null ? "" : `=${JSON.stringify(input.stateAttrValue)}`;
  const stateWord = `under [${input.stateAttr}${valuePart}]`;
  return {
    stateWord,
    backgroundWord: stateWord,
    subjectVerb: "carries the state",
    causeNote: `exactly while the ${input.stateAttr} state holds. Check which rule supplies the state color and which supplies the state background — Base UI drives this paint through the attribute, never :hover`,
  };
}

function hoverOutcome(input: HoverContrastInput): HoverOutcome {
  const minRatio = isLargeText(input.fontSizePx, input.fontWeight) ? LARGE_MIN_RATIO : NORMAL_MIN_RATIO;
  const declined = hoverDecline(input, minRatio);
  if (declined.kind !== "measurable") {
    return declined;
  }
  const over = declined.over;
  const dimmed = input.foregroundOpacity < FOREGROUND_OPACITY_EPS;
  const seen = dimmed ? compositeForeground(input.hoverColor, over, input.foregroundOpacity) : input.hoverColor;
  const ratio = contrastRatio(seen, over);
  if (ratio >= minRatio) {
    return { kind: "judged", finding: null };
  }
  const restRatio = input.restBackdrop.kind === "flat" ? contrastRatio(input.restColor, input.restBackdrop.color) : null;
  const restNote = restRatio === null ? "" : ` (rest ${restRatio.toFixed(2)}:1)`;
  const dimNote = dimmed ? ` · dimmed α${input.foregroundOpacity.toFixed(2)}` : "";
  const wording = stateWordingOf(input);
  const subjectNote = input.subjectSelector === input.selector ? "" : ` when ${input.subjectSelector} ${wording.subjectVerb}`;
  return {
    kind: "judged",
    finding: {
      rule: "hover-contrast",
      severity: "P1",
      selector: input.selector,
      value: `${ratio.toFixed(2)}:1 ${wording.stateWord}${restNote}${dimNote}`,
      message: `this text drops to ${ratio.toFixed(2)}:1 against its own ${wording.backgroundWord} background${subjectNote} — below the ${String(minRatio)}:1 minimum it clears at rest, so the label goes unreadable ${wording.causeNote}`,
      origin: "impeccable",
    },
  };
}

/** The verdict projection. Declines are silent HERE and counted in `hoverContrastPopulations`. */
export function checkHoverContrast(input: HoverContrastInput): Finding | null {
  const outcome = hoverOutcome(input);
  return outcome.kind === "judged" ? outcome.finding : null;
}

function bump(counts: Record<string, number>, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

/** Merges the walker/CDP census with the check's own dispositions into the ONE `hover-contrast` row.
 *
 *  #1317 item 10's RULING SURVIVES; ITS INPUT CHANGED (#1320). That review established that the
 *  judged-vs-samples half is a SAMPLE-SEAM contract check and not a live-path one — `ops/hover.ts` sets
 *  `hoverScan.census.judged` to `inputs.length` and hands the same `inputs` here, so those two operands
 *  are one number and that comparison alone can only catch a `hoverScan` this function did not produce (a
 *  fixture sample set, or a future second producer). Still true, and still worth keeping.
 *
 *  #1320 asked for `assertCensusAccounting` over the INCOMING census as the missing live check. Measured
 *  (red-first probe, tests/tooling/ui-audit/index.test.ts): it adds no REACH. This pass is
 *  count-preserving — every input leaves `judged` for exactly one withheld/excluded bucket — so
 *  `candidates = judged + withheld + excluded` on the outgoing row IS the incoming equation, and the two
 *  differ only by `representativeCap`, which the incoming assertion refuses outright and the outgoing
 *  `affected = emitted + cap` pins to zero. What it buys is ATTRIBUTION and EARLINESS, which is worth the
 *  call: a walker whose census does not settle now fails BEFORE the loop naming the WALKER and its own
 *  numbers, instead of surfacing downstream as a Node-side settle error that reads like a defect here.
 *  `assertRelationalCensus` spells both halves, so one call replaces the hand-rolled throw without
 *  weakening it. The OUTGOING row is settled separately by `settledPopulationAccounting` below. */
export function hoverContrastPopulations(inputs: readonly HoverContrastInput[], scan: HoverScanInput): RulePopulationAccounting {
  assertRelationalCensus("hover-contrast", scan.census, inputs.length);
  const withheld: Record<string, number> = { ...scan.census.withheld };
  const excluded: Record<string, number> = { ...scan.census.excluded };
  let judged = 0;
  let affected = 0;
  for (const input of inputs) {
    const outcome = hoverOutcome(input);
    if (outcome.kind === "withheld") {
      bump(withheld, outcome.reason);
      continue;
    }
    if (outcome.kind === "excluded") {
      bump(excluded, outcome.reason);
      continue;
    }
    judged += 1;
    if (outcome.finding !== null) {
      affected += 1;
    }
  }
  return settledPopulationAccounting("hover-contrast", {
    candidates: scan.census.candidates,
    judged,
    affected,
    populations: affected,
    emitted: affected,
    withheld,
    excluded,
    collapsed: {},
  });
}
