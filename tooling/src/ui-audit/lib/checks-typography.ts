// Typography & copy-surface floors (ramp-bound type/leading/tracking/caps/justify/line-length)
// + the font/type-scale censuses. Pure. Provenance: lib/collect.ts header.
import type { Finding } from "../contract/findings.ts";
import type { FontCensusInput, TextStyleInput } from "../contract/samples.ts";
import { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, LEADING_FLOOR_EPSILON, RAMP_FLOOR_EPSILON_PX, RAMP_FONT_FACES, TEXT_MICRO_PX } from "./ramp.ts";

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

// ── ONE AUTHORED DECISION, ONE ROW (the #983 contract, extended to type) ─────────────────────────
// A TYPE-FLOOR breach is a property of the component, not of each render. On settings:appearance
// `undersized-ui-text` printed EIGHT rows whose selectors differed only by `:nth-of-type(1..8)` —
// `[data-slot=chat-style-cards] > button… > span[data-slot=text]` eight times, one repair. The other
// rules in this family stay per-element on purpose: `line-length`, `tight-leading`, `all-caps-body`,
// `justified-text` and the tracking pair judge THIS node's own copy, and two renders of one component
// can legitimately differ on them. Only the two SIZE floors are component-level.
const GROUPED_TYPE_RULES: ReadonlySet<string> = new Set(["text-below-ramp", "undersized-ui-text"]);

/** The representative cap bounds PRESENTATION only — never the affected or judged denominator. Five,
 *  matching `tap-target`, so one reader learns one number. */
const TYPE_REPRESENTATIVE_CAP = 5;

function typeDecisionKey(input: TextStyleInput, rule: string): string {
  // BOTH halves or neither: a sample set without authored identity keeps the historic
  // one-row-per-element contract by keying on its own selector, which can never collide.
  const target = input.authoredTarget;
  const home = input.authoredHome;
  return target === undefined || home === undefined ? `${rule} ${input.selector}` : `${rule} ${target} ${home}`;
}

interface TypeGroup {
  readonly finding: Finding;
  readonly selectors: string[];
}

/** Folds the size-floor findings of one sample family by authored decision. Every other finding
 *  passes through untouched and in order. */
export function groupTypeFindings(inputs: readonly TextStyleInput[]): Finding[] {
  const out: Finding[] = [];
  const groups = new Map<string, TypeGroup>();
  for (const input of inputs) {
    for (const finding of checkTextStyle(input)) {
      if (!GROUPED_TYPE_RULES.has(finding.rule)) {
        out.push(finding);
        continue;
      }
      const key = typeDecisionKey(input, finding.rule);
      const existing = groups.get(key);
      if (existing === undefined) {
        groups.set(key, { finding, selectors: [input.selector] });
      } else {
        existing.selectors.push(input.selector);
      }
    }
  }
  for (const { finding, selectors } of groups.values()) {
    if (selectors.length === 1) {
      out.push(finding);
      continue;
    }
    const representatives = selectors.slice(0, TYPE_REPRESENTATIVE_CAP);
    const capped = selectors.length - representatives.length;
    out.push({
      ...finding,
      value: `${finding.value} — ${String(selectors.length)} rendered instance(s) of one authored decision, ${String(representatives.length)} representative(s), ${String(capped)} capped`,
      message: `${finding.message}. This is ONE component rendered ${String(selectors.length)} times, not ${String(selectors.length)} repairs — fix the variant once`,
      representatives,
      population: { affected: selectors.length, judged: selectors.length, capped },
    });
  }
  return out;
}

// ── TYPE-HIERARCHY INVERSION: a caveat outweighed by what it bounds (#652) ───────────────────────────
//
// THE DEFECT. On the plugin consent screen the raw egress hostnames rendered at 15px, regular weight,
// full foreground — the loudest thing on the surface — while *"These exact hostnames, and nothing else."*,
// the sentence that makes the list an EXHAUSTIVE guarantee and therefore the whole reason it can be
// trusted, rendered at 10.5px muted: the smallest text on the screen. Verified preset-invariant across
// four appearance arms, so it is a range property, not a point measurement. The same file carried a
// second instance — "This plugin asks for N permissions this version of Orbweaver doesn't recognise" at
// 10.5px with no destructive treatment. The class is not cosmetic: a sentence whose whole job is to BOUND
// what the loud thing beside it means, set smaller than the thing it bounds, inverts the reading order of
// a security argument.
//
// WHY THIS IS NOT `flat-type-hierarchy`. That rule asks whether a PAGE has enough distinct steps. This
// one asks whether the steps are assigned to the right content — a page can have a perfect ramp and still
// hand its loudest step to a machine readout and its quietest to the guarantee.
//
// THE HARD PART, STATED HONESTLY. Semantic importance is NOT computable from the DOM, and plenty of good
// design renders a datum larger than its label. A rule that fires on every label/value pair is a wall,
// and a wall trains readers to skip the output (#644). So this rule never guesses: it reads the app's OWN
// AUTHORED CLAIMS about intent, and fires only where the author has said, in the markup, that the small
// thing is a bounding statement.
//
// THE FRAMING WAS CHOSEN BY MEASUREMENT, NOT BY TASTE. The issue offered two candidate anchors — the
// app's own `voice` axis, or the platform's ARIA roles. The voice arm was BUILT FIRST and REFUSED on its
// band: anchored on `data-voice="gloss"` it fired 21 times across 18 live surfaces (8 on
// settings:connections alone, 6 on the chat context tab), and reading them showed why — a gloss sentence
// under a heading, an accordion trigger, or a `stat-figure-value` is the RATIFIED caption pattern, not an
// inversion. A caption under a big number is what a caption is for. That rule was a wall, and a wall
// trains readers to skip the output (#644), so the anchor was narrowed to the one authored claim that
// admits no such reading.
//
// THE ANCHOR IS THE ALERT ROLE. `role=alert|alertdialog|status` is the author saying, in the markup, "this
// sentence bounds what you are about to do". Nothing in a sane design renders an ALERT as the quietest
// text in its own block while a neighbour shouts — the caption defence does not apply, because an alert
// is not a caption. That is what makes this rule narrow enough to be worth reading.
//
// THE FOUR CONDITIONS, each a narrowing rather than a heuristic:
//   1. ANCHOR — the node is inside `role=alert|alertdialog|status`.
//   2. SENTENCE SHAPE — its own text is a full sentence (>= CAVEAT_MIN_CHARS, terminal punctuation), which
//      separates a bounding claim from a status fragment ("Saved", "3 of 8").
//   3. A LARGER PARTNER IN THE SAME BLOCK — a text node sharing an ancestor within four levels, at least
//      CAVEAT_STEP_RATIO larger. Same-block is the bound that stops this becoming "is anything on the page
//      bigger than this sentence".
//   4. THE PARTNER IS NEITHER A HEADING NOR A CHROME LABEL — a heading, `label`, `kicker`,
//      `interactiveKicker` or `credit` exists to NAME the thing beside it, and naming something larger
//      than the prose under it is the ratified pattern in every one of those cases.
//
// WHAT IT WILL NOT CATCH, deliberately and by construction — this list is the price of not being a wall:
//   • THE ROW'S OWN HEADLINE EXAMPLE. *"These exact hostnames, and nothing else."* carries no alert role:
//     it is an ordinary `gloss`, and the only thing separating it from a legitimate caption is that a
//     human knows it is a completeness GUARANTEE. That is not in the DOM. The second instance the row
//     names — the unrecognised-permissions sentence at `plugin-grant-list.tsx` — IS `role="alert"` and is
//     exactly what this rule fires on, which is why the class is still worth a rule.
//   • An inversion of COLOUR or WEIGHT at the same type step. This rule is size-anchored.
//   • A warning written with no role at all, at a call site that skipped both vocabularies.
//   • A partner more than four ancestor levels away.
//   • Anything outside this design system: the exclusions are bound to @orb/ui's voice axis on purpose.
/** Long enough to be a bounding SENTENCE rather than a qualifier fragment. */
const CAVEAT_MIN_CHARS = 28;
/** One ramp step, with room for rounding: micro 10.5 → label 13 is 1.238, body 15 is 1.43. */
const CAVEAT_STEP_RATIO = 1.15;
const SENTENCE_END_RE = /[.!?]["')\]]?$/u;
/** Voices whose JOB is to name the thing beside them — a label above its caption is the ratified pattern,
 *  not an inversion, and treating one as a "louder partner" fires on every settings row in the product. */
const CHROME_LABEL_VOICES: ReadonlySet<string> = new Set(["credit", "interactiveKicker", "kicker", "label"]);

/** Does this sample carry an AUTHORED claim that it bounds something? The `gloss` voice was tried here
 *  first and measured as a wall (21 findings / 18 surfaces — see the block comment); the alert role is
 *  the claim that survives, because an alert is never a caption. */
function isCaveatCarrier(input: TextStyleInput): boolean {
  return input.alertContext === true;
}

/** A bounding SENTENCE, not a qualifier fragment: length plus terminal punctuation on the element's OWN
 *  text. `directTextLen` is the length the walker measured; the shape test needs the text itself, which
 *  the sample family does not carry — so length is the proxy and the punctuation test rides `directText`
 *  when present. */
function isSentenceShaped(input: TextStyleInput): boolean {
  return input.directTextLen >= CAVEAT_MIN_CHARS && SENTENCE_END_RE.test(input.directText ?? "");
}

/** Two samples sit in one block when their ancestor-id paths intersect (four levels each, from the
 *  walker). Absent paths decline — comparing globally is the false-positive machine. */
function sharesBlock(a: TextStyleInput, b: TextStyleInput): boolean {
  const left = a.blockPath;
  const right = b.blockPath;
  if (left === undefined || right === undefined || left.length === 0 || right.length === 0) {
    return false;
  }
  const seen = new Set(left);
  return right.some((id) => seen.has(id));
}

/** The loudest same-block partner that outweighs this caveat, or null. */
function outweighingPartner(caveat: TextStyleInput, all: readonly TextStyleInput[]): TextStyleInput | null {
  let loudest: TextStyleInput | null = null;
  for (const other of all) {
    if (other === caveat || other.srOnly || other.codeContext || other.directTextLen === 0) {
      continue;
    }
    if (other.isHeading || CHROME_LABEL_VOICES.has(other.voice ?? "") || other.fontSizePx < caveat.fontSizePx * CAVEAT_STEP_RATIO) {
      continue;
    }
    if (sharesBlock(caveat, other) && (loudest === null || other.fontSizePx > loudest.fontSizePx)) {
      loudest = other;
    }
  }
  return loudest;
}

/** The type-hierarchy-inversion lens (#652) — see the block comment above for the framing and its
 *  declared blind spots. A cross-sample fold, so it takes the whole family rather than one input. */
export function checkCaveatHierarchy(inputs: readonly TextStyleInput[]): Finding[] {
  const findings: Finding[] = [];
  for (const input of inputs) {
    if (input.srOnly || input.codeContext || !isCaveatCarrier(input) || !isSentenceShaped(input)) {
      continue;
    }
    const partner = outweighingPartner(input, inputs);
    if (partner === null) {
      continue;
    }
    findings.push({
      rule: "caveat-outweighed",
      severity: "P2",
      selector: input.selector,
      value: `${input.fontSizePx}px alert under a ${partner.fontSizePx}px sibling`,
      message: `this alert sentence BOUNDS what ${partner.selector} means, and renders ${(partner.fontSizePx / input.fontSizePx).toFixed(2)}× smaller than it — the warning whispers while the thing it qualifies shouts; lift the alert a step (the \`prose\` modifier does exactly this) or quiet its partner`,
      origin: "orbweaver",
    });
  }
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
