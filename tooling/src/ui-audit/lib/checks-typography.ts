// Typography & copy-surface floors (ramp-bound type/leading/tracking/caps/justify/line-length)
// + the font/type-scale censuses. Pure. Provenance: lib/collect.ts header.
import type { Finding } from "../contract/findings.ts";
import type { FontCensusInput, TextStyleInput } from "../contract/samples.ts";
import { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, LEADING_FLOOR_EPSILON, RAMP_FLOOR_EPSILON_PX, RAMP_FONT_FACES, TEXT_MICRO_PX } from "./ramp.ts";

const LINE_LENGTH_TEXT_MIN = 80;

const LINE_LENGTH_EST_MAX = 85; // estimated chars/line = rectWidth / (fontSize × 0.5)
const CHAR_WIDTH_FONT_RATIO = 0.5;

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

function checkLineLength(input: TextStyleInput): Finding | null {
  if (!input.isProseTag || input.totalTextLen <= LINE_LENGTH_TEXT_MIN || input.rectWidth <= 0 || input.fontSizePx <= 0) {
    return null;
  }
  const estCharsPerLine = input.rectWidth / (input.fontSizePx * CHAR_WIDTH_FONT_RATIO);
  if (estCharsPerLine <= LINE_LENGTH_EST_MAX) {
    return null;
  }
  return {
    rule: "line-length",
    severity: "P3",
    selector: input.selector,
    value: `~${Math.round(estCharsPerLine)} chars/line`,
    message: `prose line measures ~${Math.round(estCharsPerLine)} chars — beyond ~80 the eye loses the line-return; cap the measure (65–75ch, skill §2)`,
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

const FLAT_HIERARCHY_MIN_SIZES = 3;

const FLAT_HIERARCHY_MIN_RATIO = 2.0;

export function checkFontCensus(census: FontCensusInput): Finding[] {
  const findings: Finding[] = [];
  for (const family of census.families) {
    if (!RAMP_FONT_FACES.has(family)) {
      findings.push({
        rule: "off-theme-font",
        severity: "P2",
        selector: "page",
        value: family,
        message: `rendered font face "${family}" is outside the token stacks (font.sans/font.mono → ${[...RAMP_FONT_FACES].join(", ")}) — a stray face means a missing font-family token application`,
        origin: "impeccable",
      });
    }
  }
  if (census.sizes.length >= FLAT_HIERARCHY_MIN_SIZES) {
    const sorted = [...census.sizes].sort((a, b) => a - b);
    const min = sorted[0] as number;
    const max = sorted.at(-1) as number;
    if (min > 0 && max / min < FLAT_HIERARCHY_MIN_RATIO) {
      findings.push({
        rule: "flat-type-hierarchy",
        severity: "P3",
        selector: "page",
        value: `${sorted.map((s) => `${s}px`).join(", ")} (ratio ${(max / min).toFixed(1)}:1)`,
        message:
          "page font sizes are too close together for a visible hierarchy — use fewer steps with more contrast (the ramp spans micro 10.5 → display 24 for a reason)",
        origin: "impeccable",
      });
    }
  }
  return findings;
}
