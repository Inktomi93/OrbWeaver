// Typography & copy-surface floors (ramp-bound type/leading/tracking/caps/justify/line-length), one
// text element at a time. The PAGE-level censuses (off-theme-font, flat-type-hierarchy) live beside
// this in checks-font-census.ts, and the CROSS-SAMPLE caveat-outweighed fold in checks-caveat.ts —
// both split off for the same reason: a different subject needs its own population. Pure.
// Provenance: lib/collect.ts header.
import type { CandidateDisposition, Finding } from "../contract/findings.ts";
import type { TextStyleInput } from "../contract/samples.ts";
import { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, LEADING_FLOOR_EPSILON, RAMP_FLOOR_EPSILON_PX, TEXT_MICRO_PX } from "./ramp.ts";

const LINE_LENGTH_TEXT_MIN = 80;

/** Chars per line above which the line-return gets hard to find. The house measure is
 *  `--reading-measure: 75ch`, so the floor sits ABOVE it deliberately — an instrument that indicts the
 *  ratified measure is measuring wrong, which is precisely what happened while this number was compared
 *  against a GUESSED character width (#464: a 75.0-real-char paragraph was filed as 85.9). */
const LINE_LENGTH_MAX_CHARS = 85;

const TIGHT_LEADING_TEXT_MIN = 50;

const ALL_CAPS_TEXT_MIN = 30;

const TRACKING_TEXT_MIN = 20;

const WIDE_TRACKING_EM = 0.05;

const CRUSHED_TRACKING_EM = -0.045; // skill §2 floor is −0.04em; fire strictly below it
const MIN_FLAGGABLE_TEXT = 2;

function checkTypeFloor(input: TextStyleInput): Finding | null {
  if (input.codeContext || input.directTextLen < MIN_FLAGGABLE_TEXT || input.fontSizePx <= 0) {
    return null;
  }
  if (input.fontSizePx < TEXT_MICRO_PX - RAMP_FLOOR_EPSILON_PX) {
    return {
      rule: "text-below-ramp",
      severity: "P2",
      selector: input.selector,
      value: `${input.fontSizePx}px (ramp floor ${TEXT_MICRO_PX}px)`,
      message: `rendered text is ${input.fontSizePx}px — below the smallest ratified type step (text.micro ${TEXT_MICRO_PX}px); off the token ramp AND a legibility failure`,
      origin: "impeccable",
    };
  }
  if (input.interactive && input.fontSizePx < INTERACTIVE_TEXT_FLOOR_PX) {
    return {
      rule: "undersized-ui-text",
      severity: "P2",
      selector: input.selector,
      value: `${input.fontSizePx}px interactive text (floor ${INTERACTIVE_TEXT_FLOOR_PX}px)`,
      message: `interactive text is ${input.fontSizePx}px — below the ${INTERACTIVE_TEXT_FLOOR_PX}px functional floor; being on the type ramp does not launder legibility for a control`,
      origin: "impeccable",
    };
  }
  return null;
}

/** Characters that fit on one rendered line: the box width over the MEASURED `ch` advance plus this
 *  element's tracking, which is what actually decides how many glyphs land before the wrap. With
 *  tracking 0 — every prose surface here — it is the CSS `ch` count exactly, so the number a finding
 *  prints and the number `--reading-measure: 75ch` states are the same unit. Null when the walker could
 *  not measure the advance: NO VERDICT beats a verdict from a guessed ratio (#464). */
function charsPerLine(input: TextStyleInput): number | null {
  const chWidthPx = input.chWidthPx ?? 0;
  if (chWidthPx <= 0) {
    return null;
  }
  const advance = chWidthPx + input.letterSpacingPx;
  return advance > 0 ? input.rectWidth / advance : null;
}

function checkLineLength(input: TextStyleInput): Finding | null {
  if (!input.isProseTag || input.totalTextLen <= LINE_LENGTH_TEXT_MIN || input.rectWidth <= 0 || input.fontSizePx <= 0) {
    return null;
  }
  const chars = charsPerLine(input);
  if (chars === null || chars <= LINE_LENGTH_MAX_CHARS) {
    return null;
  }
  return {
    rule: "line-length",
    severity: "P3",
    selector: input.selector,
    value: `${Math.round(chars)} chars/line`,
    message: `prose line measures ${Math.round(chars)} chars — beyond ~80 the eye loses the line-return; cap the measure (65–75ch, skill §2)`,
    origin: "impeccable",
  };
}

function checkTightLeading(input: TextStyleInput): Finding | null {
  if (input.directTextLen <= TIGHT_LEADING_TEXT_MIN || input.isHeading || input.lineHeightPx === null || input.fontSizePx <= 0) {
    return null;
  }
  const ratio = input.lineHeightPx / input.fontSizePx;
  // The epsilon is the instrument's own rounding allowance, not a lowered floor — see LEADING_FLOOR_EPSILON.
  if (ratio <= 0 || ratio >= LEADING_FLOOR - LEADING_FLOOR_EPSILON) {
    return null;
  }
  return {
    rule: "tight-leading",
    severity: "P3",
    selector: input.selector,
    value: `line-height ${ratio.toFixed(2)}× (floor ${LEADING_FLOOR})`,
    message: `multi-line text at ${ratio.toFixed(2)}× leading — below the smallest ratified leading step (leading.label ${LEADING_FLOOR}); lines have no room to breathe`,
    origin: "impeccable",
  };
}

function checkJustified(input: TextStyleInput): Finding | null {
  if (input.directTextLen === 0 || input.textAlign !== "justify" || input.hyphens === "auto") {
    return null;
  }
  return {
    rule: "justified-text",
    severity: "P3",
    selector: input.selector,
    value: "text-align: justify without hyphens: auto",
    message: "justified text without hyphenation creates rivers of white — use text-align: left, or enable hyphens: auto if justification is required",
    origin: "impeccable",
  };
}

function checkAllCaps(input: TextStyleInput): Finding | null {
  if (input.directTextLen <= ALL_CAPS_TEXT_MIN || input.textTransform !== "uppercase" || input.isHeading) {
    return null;
  }
  return {
    rule: "all-caps-body",
    severity: "P3",
    selector: input.selector,
    value: `uppercase on ${input.directTextLen} chars`,
    message: "long uppercase passages kill word shapes — reserve caps for short labels (the micro-caps voice is short by law); set body text in sentence case",
    origin: "impeccable",
  };
}

/** Is this text SET IN CAPS as the reader sees it? Wide tracking is the ratified partner of the micro-caps
 *  label voice (tracking.micro 0.08em + text.micro + weight 600 + caps, density spec §2.3), so the caps
 *  exemption must key on the RENDERED result. Keying it on `text-transform` alone — the rule as born — read
 *  a kicker whose caps were TYPED as running text and flagged the ratified voice itself (issue #148 item 4;
 *  measured 4× on one panel). Long caps passages remain covered: that is `all-caps-body`'s job. */
function rendersAsCaps(input: TextStyleInput): boolean {
  return input.textTransform === "uppercase" || input.capsText === true;
}

function checkTracking(input: TextStyleInput): Finding[] {
  if (input.directTextLen <= TRACKING_TEXT_MIN || input.fontSizePx <= 0 || input.letterSpacingPx === 0) {
    return [];
  }
  const findings: Finding[] = [];
  const trackingEm = input.letterSpacingPx / input.fontSizePx;
  if (!rendersAsCaps(input) && trackingEm > WIDE_TRACKING_EM) {
    findings.push({
      rule: "wide-tracking",
      severity: "P3",
      selector: input.selector,
      value: `letter-spacing ${trackingEm.toFixed(2)}em`,
      message: `letter-spacing ${trackingEm.toFixed(2)}em on running text disrupts character groupings — wide tracking is for short uppercase labels only (tracking.micro pairs with caps)`,
      origin: "impeccable",
    });
  }
  if (trackingEm <= CRUSHED_TRACKING_EM) {
    findings.push({
      rule: "crushed-tracking",
      severity: "P3",
      selector: input.selector,
      value: `letter-spacing ${trackingEm.toFixed(2)}em`,
      message: `letter-spacing ${trackingEm.toFixed(2)}em is past the −0.04em floor (skill §2) — characters collide; tighten display type optically, not destructively`,
      origin: "impeccable",
    });
  }
  return findings;
}

export function checkTextStyle(input: TextStyleInput): Finding[] {
  if (input.srOnly) {
    return [];
  }
  const findings: Finding[] = [];
  const singles = [checkTypeFloor(input), checkLineLength(input), checkTightLeading(input), checkJustified(input), checkAllCaps(input)];
  for (const f of singles) {
    if (f !== null) {
      findings.push(f);
    }
  }
  findings.push(...checkTracking(input));
  return findings;
}

/** The six per-element typography rules that share ONE census — every non-`srOnly` text sample the
 *  walker gathered. (`text-below-ramp`/`undersized-ui-text` share that census too but ride rung 4: they
 *  repeat by authored decision, which these six do not.) ONE tuple, derived union: the collect
 *  dispatcher iterates the same axis rather than re-spelling it. */
export const TEXT_STYLE_RULE_IDS = ["all-caps-body", "crushed-tracking", "justified-text", "line-length", "tight-leading", "wide-tracking"] as const;
type TextStyleRuleId = (typeof TEXT_STYLE_RULE_IDS)[number];

/** Per-rule disposition over the shared text census. EXCLUDED is reserved for the measured facts that
 *  put a sample outside a rule's own population — clipped `sr-only` text paints no pixels at all, a
 *  heading is not body copy, a non-prose tag has no reading measure, an element with no own text has no
 *  alignment to judge, a `line-height: normal` computed value is no authored leading step to compare
 *  against the ramp, and RENDERED CAPS are the ratified micro-caps voice `tracking.micro` pairs with
 *  (`rendersAsCaps` above, issue #148). The rules' own thresholds — short text, zero tracking, a leading
 *  above the floor — stay JUDGED PASSES (`grayOnColorOutcome`'s precedent in checks-color.ts). The one
 *  WITHHOLDING is `line-length`'s: the walker measured no `ch` advance, and #464 already ruled that a
 *  measure computed from a guessed ratio is worse than no verdict — so it fails loud instead of printing
 *  a clean row over an unmeasured population. */
export function classifyTextStyle(input: TextStyleInput, rule: TextStyleRuleId): CandidateDisposition {
  if (input.srOnly) {
    return { kind: "excluded", reason: "srOnly" };
  }
  const excluded = textStyleExclusion(input, rule);
  if (excluded !== null) {
    return { kind: "excluded", reason: excluded };
  }
  if (rule === "line-length" && input.totalTextLen > LINE_LENGTH_TEXT_MIN && charsPerLine(input) === null) {
    return { kind: "withheld", reason: "chAdvanceUnmeasured" };
  }
  return { kind: "judged", finding: checkTextStyle(input).find((finding) => finding.rule === rule) ?? null };
}

/** The closed exclusion reason for one (sample, rule) pair, or null when the rule owes it a verdict.
 *  A mapped Record rather than a switch so a new rule in the union is a tsc error here (the house
 *  string-union dispatch discipline); each arm mirrors ITS OWN checker's guards — `checkAllCaps` and
 *  `checkJustified` have no type-size gate, so neither arm invents one. */
const TEXT_STYLE_EXCLUSIONS: Readonly<Record<TextStyleRuleId, (input: TextStyleInput) => string | null>> = {
  "all-caps-body": (input) => (input.isHeading ? "heading" : null),
  "crushed-tracking": (input) => noTypeSize(input),
  "justified-text": (input) => (input.directTextLen === 0 ? "noOwnText" : null),
  "line-length": (input) => {
    if (!input.isProseTag) {
      return "notProseTag";
    }
    return input.rectWidth <= 0 ? "noRenderedBox" : noTypeSize(input);
  },
  "tight-leading": (input) => {
    if (input.isHeading) {
      return "heading";
    }
    return input.lineHeightPx === null ? "normalKeywordLeading" : noTypeSize(input);
  },
  "wide-tracking": (input) => (rendersAsCaps(input) ? "capsVoice" : noTypeSize(input)),
};

function noTypeSize(input: TextStyleInput): string | null {
  return input.fontSizePx <= 0 ? "noTypeSize" : null;
}

function textStyleExclusion(input: TextStyleInput, rule: TextStyleRuleId): string | null {
  return TEXT_STYLE_EXCLUSIONS[rule](input);
}
