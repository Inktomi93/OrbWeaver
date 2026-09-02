// Typography & copy-surface floors (ramp-bound type/leading/tracking/caps/justify/line-length), one
// text element at a time. The PAGE-level censuses (off-theme-font, flat-type-hierarchy) live beside
// this in checks-font-census.ts, and the CROSS-SAMPLE caveat-outweighed fold in checks-caveat.ts —
// both split off for the same reason: a different subject needs its own population. Pure.
// Provenance: lib/collect.ts header.
import type { CandidateDisposition, Finding } from "../contract/findings.ts";
import type { TextStyleInput } from "../contract/samples.ts";
import { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, LEADING_FLOOR_EPSILON, RAMP_FLOOR_EPSILON_PX, TEXT_MICRO_PX } from "./ramp.ts";

const LINE_LENGTH_TEXT_MIN = 80;

/** LAW-CHARACTERS per line above which the line-return gets hard to find — the design law's own unit
 *  (skill §2: "65-75 characters, counted by AVERAGE GLYPH ADVANCE"), not the CSS `ch` unit. The two are
 *  NOT the same number: a `0` advance is 0.6625em in Geist while running prose averages 0.42-0.46em, so
 *  one CSS ch is ~1.5 law-characters (#1145, owner ruling 2026-09-02) and a rule denominated in `ch`
 *  passes a 117-character paragraph under a "75" ceiling — the #1183 blindness.
 *
 *  The ceiling still sits ABOVE the ratified token, which is #464's surviving principle: the ratified
 *  PROSE measure is `--reading-measure-prose: 47ch` = 67-73 law-characters at both ends of the Geist
 *  ratio, so 80 leaves the house token ~10% of headroom and an instrument that fires here is never
 *  indicting a correctly-capped paragraph. */
const LINE_LENGTH_MAX_CHARS = 80;

/** The TRANSCRIPT arm's ceiling, in CSS `ch` — the unit `--reading-measure: 75ch` is authored in. The
 *  transcript is deliberately the WIDE measure (#1145: dialogue is short attributed lines, not continuous
 *  body copy), so it is judged against its OWN token in its own unit rather than against the law band;
 *  75 law-characters there would fire on every correctly-capped message bubble. */
const TRANSCRIPT_MAX_CH = 75;

/** The chat transcript's reading surface — the subject of `--reading-measure` (#1145's split).
 *  DELIBERATELY NOT `GRID_EXEMPTIONS.readingSurface` (lib/checks-grid.ts), even though both resolve to the
 *  same DOM node today: that row is the `integer-line-boxes` gate's ARM C mirror (a user-owned CONTINUOUS
 *  line-height multiplier is exempt from the line-box law) and this one is the measure SPLIT (the transcript
 *  takes the wider of two reading measures). Two axes that happen to share a member need two spellings —
 *  collapsing them would make one law's exemption move when the other's does. */
const TRANSCRIPT_SURFACE = '[data-slot="message-bubble"]';

/** The page-side expression the walker interpolates, so the transcript surface is spelled EXACTLY ONCE
 *  across the Node verdict layer and the in-page census (the `INACTIVE_KIND_EXPR` precedent). */
export const TRANSCRIPT_SURFACE_SELECTOR_JS = JSON.stringify(TRANSCRIPT_SURFACE);

/** The `<Text>` voices that ARE body prose — the app's own authored claim about what a block IS, which is
 *  the only thing that widens the population beyond the prose TAGS. `reading` is the content itself,
 *  `gloss` the quiet explanatory second line, `quiet` the muted body line: all three are copy a user reads
 *  in lines, all three take `--reading-measure-prose`. Every other voice names CHROME (a section's name, a
 *  datum and its label, a credit, a promoted item's title) or a display statement (`hero`/`masthead`/
 *  `focal`), and a heading is out of the band by law — those are `chromeVoice`, a measured exclusion.
 *  The vocabulary's home is `packages/ui/src/primitives/text/variants.ts`; this is the prose SUBSET. */
const PROSE_VOICES: ReadonlySet<string> = new Set(["gloss", "quiet", "reading"]);

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

/** CSS `ch` per rendered line: the box width over the MEASURED `0` advance plus this element's tracking.
 *  This is the unit the TOKENS are authored in (`--reading-measure: 75ch`), so the transcript arm judges
 *  in it. Null when the walker could not measure the advance: NO VERDICT beats a verdict from a guessed
 *  ratio (#464). */
function chPerLine(input: TextStyleInput): number | null {
  const chWidthPx = input.chWidthPx ?? 0;
  if (chWidthPx <= 0) {
    return null;
  }
  const advance = chWidthPx + input.letterSpacingPx;
  return advance > 0 ? input.rectWidth / advance : null;
}

/** LAW-CHARACTERS per rendered line: the box width over the AVERAGE GLYPH ADVANCE of this element's own
 *  running text, measured on the page's own canvas in the element's own font (ops/walker/census-text.ts).
 *  This is the unit skill §2 counts in, and it is NOT the `ch` count above — the average advance of real
 *  prose is ~2/3 of a `0`, so the same box holds ~1.5x as many law-characters as it does `ch` (#1183). */
function lawCharsPerLine(input: TextStyleInput): number | null {
  const glyphAdvancePx = input.glyphAdvancePx ?? 0;
  if (glyphAdvancePx <= 0) {
    return null;
  }
  const advance = glyphAdvancePx + input.letterSpacingPx;
  return advance > 0 ? input.rectWidth / advance : null;
}

/** IS THIS SAMPLE BODY PROSE? The tags are the structural half (`p`/`li`/`td`/…) and the VOICE is the
 *  authored half: `<Text as="span" voice="gloss">` renders a settings-row description that every reader
 *  reads in lines and no prose TAG covers, and excluding it is how a rule reporting `notProseTag=55` over
 *  64 text samples reached `affected=0` on a surface with a 117-character paragraph on it (#1183). */
function isProse(input: TextStyleInput): boolean {
  return input.isProseTag || PROSE_VOICES.has(input.ownVoice ?? "");
}

/** ONE line's measure under the arm that governs it. `measured`/`ceiling` share a unit; the companion
 *  number rides `report` because the two units are the exact confusion this rule was blind to, and a
 *  finding that prints only one of them cannot be checked against the token it names. */
interface LineMeasure {
  readonly measured: number;
  readonly ceiling: number;
  readonly unit: string;
  readonly report: string;
  readonly token: string;
}

function lineMeasure(input: TextStyleInput): LineMeasure | null {
  const cssCh = chPerLine(input);
  const lawChars = lawCharsPerLine(input);
  if (input.readingSurface === true) {
    return cssCh === null
      ? null
      : {
          measured: cssCh,
          ceiling: TRANSCRIPT_MAX_CH,
          unit: "CSS ch",
          report: `${Math.round(cssCh)} CSS ch (${lawChars === null ? "glyph advance unmeasured" : `${Math.round(lawChars)} characters`})`,
          token: "--reading-measure (75ch, the transcript measure)",
        };
  }
  return lawChars === null
    ? null
    : {
        measured: lawChars,
        ceiling: LINE_LENGTH_MAX_CHARS,
        unit: "characters",
        report: `${Math.round(lawChars)} characters (${cssCh === null ? "ch advance unmeasured" : `${Math.round(cssCh)} CSS ch`})`,
        token: "--reading-measure-prose (47ch = 67-73 characters)",
      };
}

function checkLineLength(input: TextStyleInput): Finding | null {
  if (!isProse(input) || input.totalTextLen <= LINE_LENGTH_TEXT_MIN || input.rectWidth <= 0 || input.fontSizePx <= 0) {
    return null;
  }
  const measure = lineMeasure(input);
  if (measure === null || measure.measured <= measure.ceiling) {
    return null;
  }
  return {
    rule: "line-length",
    severity: "P3",
    selector: input.selector,
    value: `${measure.report}/line`,
    message: `this line measures ${measure.report} — past the ${String(measure.ceiling)} ${measure.unit} ceiling, beyond which the eye loses the line-return. Cap the measure at ${measure.token} (skill §2, the #1145 split); CSS ch and law-characters are different units, which is why both are printed`,
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
 *  heading is not body copy, a node that is neither a prose tag nor a prose VOICE has no reading measure
 *  (`notProseTag` unlabelled · `chromeVoice` authored-as-chrome, #1183), an element with no own text has no
 *  alignment to judge, a `line-height: normal` computed value is no authored leading step to compare
 *  against the ramp, and RENDERED CAPS are the ratified micro-caps voice `tracking.micro` pairs with
 *  (`rendersAsCaps` above, issue #148). The rules' own thresholds — short text, zero tracking, a leading
 *  above the floor — stay JUDGED PASSES (`grayOnColorOutcome`'s precedent in checks-color.ts). The one
 *  WITHHOLDING is `line-length`'s: the walker measured no advance for the arm that governs the sample, and
 *  #464 already ruled that a measure computed from a guessed ratio is worse than no verdict — so it fails
 *  loud instead of printing a clean row over an unmeasured population. */
export function classifyTextStyle(input: TextStyleInput, rule: TextStyleRuleId): CandidateDisposition {
  if (input.srOnly) {
    return { kind: "excluded", reason: "srOnly" };
  }
  const excluded = textStyleExclusion(input, rule);
  if (excluded !== null) {
    return { kind: "excluded", reason: excluded };
  }
  if (rule === "line-length" && input.totalTextLen > LINE_LENGTH_TEXT_MIN && lineMeasure(input) === null) {
    // ONE reason per DENOMINATOR, never one label over two different failures: the transcript arm needs the
    // `0` advance and the prose arm needs the average glyph advance, and a run that cannot measure one of
    // them has a different blindness from a run that cannot measure the other.
    return { kind: "withheld", reason: input.readingSurface === true ? "chAdvanceUnmeasured" : "glyphAdvanceUnmeasured" };
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
    if (!isProse(input)) {
      // TWO LABELS, NOT ONE (#1183): an element carrying an authored CHROME voice is PROVED out of the
      // reading population by the app's own vocabulary, while an untagged, unvoiced node is merely markup
      // this rule cannot claim. Collapsing them printed `notProseTag=55` — a number that says nothing
      // about whether the census is right or the surface is unlabelled.
      return (input.ownVoice ?? "") === "" ? "notProseTag" : "chromeVoice";
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
