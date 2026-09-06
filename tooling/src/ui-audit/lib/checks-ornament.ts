// Ornament censuses: radial-gradient washes, decorative stripe/grid patterns, icon tiles above
// headings, static motion offenders. Pure. Provenance: lib/collect.ts header.

import type { Rgb } from "@orb/tooling/_shared/wcag";
import { rgbChroma } from "@orb/tooling/_shared/wcag";
import type { CandidateDisposition, Finding } from "../contract/findings.ts";
import type { BgPatternInput, IconTileInput, MotionStaticInput, RadialGlowInput } from "../contract/samples.ts";
import { findColorToken } from "./css-color.ts";

const RADIAL_MIN_WIDTH_PX = 240;

const RADIAL_MIN_HEIGHT_PX = 160;

const RADIAL_FADE_MAX_ALPHA = 0.05;

const HALO_MIN_STOP_ALPHA = 0.45;

const SPOTLIGHT_MIN_CHROMA = 24;

const SPOTLIGHT_MAX_STOPS = 2;

const RADIAL_MIN_STOPS = 2;

// A stop ARG is a colour when `lib/css-color.ts` can read one out of it — never a regex here. This
// file used to carry `/rgba?\(…\)|#hex|transparent/`, which made `radial-halo` and
// `radial-spotlight-glow` blind to every OKLCH wash, i.e. to every gradient a tokens-only tree can
// author (measured 2026-09-01 with an rgb/oklch control pair; see css-color.ts's header). Colour
// blindness was never the right way to avoid false positives on the sanctioned effect carriers —
// `RadialGlowInput.sanctioned` is that mechanism, and it is unchanged.
const TRANSPARENT_KEYWORD_RE = /^\s*transparent\s*$/iu;

const RADIAL_GRADIENT_HEAD_RE = /(repeating-)?radial-gradient\(/gi;

function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    }
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

interface RadialStop {
  readonly color: Rgb | null;
  readonly transparent: boolean;
}

/** `transparent` is checked BEFORE the reader: the kit parses it to a real `rgba(0,0,0,0)`, and this
 *  rule's whole shape gate is "does the gradient fade OUT", so the keyword has to stay a distinct
 *  fact rather than collapsing into a zero-alpha colour. */
function parseRadialStopToken(arg: string): RadialStop {
  if (TRANSPARENT_KEYWORD_RE.test(arg)) {
    return { color: null, transparent: true };
  }
  const tok = findColorToken(arg);
  if (tok === null) {
    return { color: null, transparent: false };
  }
  return { color: tok.color, transparent: (tok.color.a ?? 1) <= RADIAL_FADE_MAX_ALPHA };
}

/** Does this gradient argument carry a colour at all? A stop arg is `<colour> [position]`, so the
 *  position tokens (`0%`, `70%`) and the shape prelude (`circle`, `at 50% 40%`) answer no.
 *
 *  ANSWERING "no" IS NOT THE SAME AS "not a colour" — see `radialArgKind`: an arg this predicate
 *  declines is either structural (a position/prelude token) or a colour the reader could not READ, and
 *  conflating the two is what let an unresolved stop be dropped silently. */
function isStopArg(arg: string): boolean {
  return TRANSPARENT_KEYWORD_RE.test(arg) || findColorToken(arg) !== null;
}

/** The radial prelude + `<position>` vocabulary: shape, extent keywords, `at`, the position keywords, and
 *  the `in <colour-space> [<hue> hue]` interpolation clause. Closed by the grammar (CSS Images 3 §3.4 +
 *  CSS Color 4 §12), so a token outside it is not something this reader is entitled to ignore. */
const RADIAL_STRUCTURAL_WORD_RE =
  /^(circle|ellipse|at|closest-side|closest-corner|farthest-side|farthest-corner|in|shorter|longer|increasing|decreasing|hue|top|bottom|left|right|center|srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz|xyz-d50|xyz-d65|hsl|hwb|lch|oklch)$/iu;

/** A `<length-percentage>` or bare number — a stop position, a colour hint, or a prelude radius. */
const RADIAL_LENGTH_TOKEN_RE = /^[+-]?(\d+\.?\d*|\.\d+)(px|em|rem|ex|ch|vw|vh|vmin|vmax|cm|mm|in|pt|pc|q|%)?$/iu;

/** Math functions resolve to a length; their INNARDS are arithmetic, never a colour. */
const RADIAL_MATH_FN_RE = /^(calc|min|max|clamp|round)\(/iu;

/** Whitespace split at paren depth 0, with each balanced `fn(...)` span kept whole as one token — a bare
 *  `.split(/\s+/)` shreds `calc(50% + 10px)` into three tokens, two of which look like garbage. */
function splitTopLevelTokens(arg: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of arg) {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    }
    if (/\s/u.test(ch) && depth === 0) {
      if (cur !== "") {
        tokens.push(cur);
      }
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur !== "") {
    tokens.push(cur);
  }
  return tokens;
}

/** THE THREE-WAY SPLIT THIS RULE ALWAYS OWED (#1808, from #1504 claim 4). `colour` = the reader read it;
 *  `structural` = every token is prelude/position/math, i.e. the arg CARRIES no colour by construction;
 *  `unresolved` = neither — a colour-shaped arg the reader declined (`color-mix()` and `hwb()` come back
 *  null from `css-color.ts` BY DESIGN, per its header) or a token outside the grammar. Dropping the third
 *  class into the second is what let a three-stop wash be judged on two stops. */
function radialArgKind(arg: string): "colour" | "structural" | "unresolved" {
  if (isStopArg(arg)) {
    return "colour";
  }
  const tokens = splitTopLevelTokens(arg);
  if (tokens.length === 0) {
    return "structural";
  }
  const structural = tokens.every((token) => RADIAL_STRUCTURAL_WORD_RE.test(token) || RADIAL_LENGTH_TOKEN_RE.test(token) || RADIAL_MATH_FN_RE.test(token));
  return structural ? "structural" : "unresolved";
}

/** Index of the `)` closing the paren opened at `openIdx`, or -1. */
function closingParenIndex(value: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < value.length; i += 1) {
    if (value[i] === "(") {
      depth += 1;
    } else if (value[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** What the FIRST non-repeating radial-gradient in a value yielded (repeating-* is a pattern, not a
 *  glow). `stops` = the whole colour-stop list, every arg accounted for; `unresolved` = at least one
 *  colour-shaped arg the reader could not read, so no stop list exists to judge; `absent` = no radial
 *  glow question here at all (no gradient, an unbalanced value, or fewer than `RADIAL_MIN_STOPS`
 *  readable stops, which is this rule answering "no"). */
type RadialStopScan = { readonly kind: "stops"; readonly args: readonly string[] } | { readonly kind: "unresolved" } | { readonly kind: "absent" };

/** THE STOP LIST, WHOLE OR NOT AT ALL (#1808, from #1504 claim 4). This used to `.filter(isStopArg)` and
 *  measure `RADIAL_MIN_STOPS` against the SURVIVORS, so a three-stop wash carrying one unreadable stop
 *  cleared the two-stop minimum and was judged on an incomplete gradient — while this docstring claimed
 *  "unparseable color spaces yield too few stops and refuse", which was true only when the unreadable
 *  stops happened to outnumber the readable ones. Every arg is now classified, and one `unresolved` arg
 *  refuses the whole gradient. */
function scanRadialStops(value: string): RadialStopScan {
  RADIAL_GRADIENT_HEAD_RE.lastIndex = 0;
  let g = RADIAL_GRADIENT_HEAD_RE.exec(value);
  while (g !== null) {
    if (g[1] === undefined) {
      const open = value.indexOf("(", g.index);
      const end = closingParenIndex(value, open);
      if (end < 0) {
        return { kind: "absent" };
      }
      const parts = splitTopLevelCommas(value.slice(open + 1, end));
      if (parts.some((arg) => radialArgKind(arg) === "unresolved")) {
        return { kind: "unresolved" };
      }
      const args = parts.filter(isStopArg);
      return args.length >= RADIAL_MIN_STOPS ? { kind: "stops", args } : { kind: "absent" };
    }
    g = RADIAL_GRADIENT_HEAD_RE.exec(value);
  }
  return { kind: "absent" };
}

/** True when the gradient's LAST stop fades out (transparent / near-zero alpha) — a gradient
 *  between two visible surfaces is a background, not a floating glow. */
function fadesOut(stops: readonly RadialStop[]): boolean {
  const last = stops.at(-1) as RadialStop;
  if (last.transparent) {
    return true;
  }
  const lastAlpha = last.color === null ? 1 : (last.color.a ?? 1);
  return lastAlpha <= RADIAL_FADE_MAX_ALPHA;
}

/** The judged verdict alone. An `unresolved` gradient answers `null` here because a `Finding | null`
 *  return has no way to say "I could not read this" — the LOUD refusal is `classifyRadialGlow`'s, which
 *  is the only leg that can reach the population row. */
export function checkRadialGlow(input: RadialGlowInput): Finding | null {
  if (input.sanctioned || input.width < RADIAL_MIN_WIDTH_PX || input.height < RADIAL_MIN_HEIGHT_PX) {
    return null;
  }
  const scan = scanRadialStops(input.value);
  if (scan.kind !== "stops") {
    return null;
  }
  const stops = scan.args.map(parseRadialStopToken);
  if (!fadesOut(stops)) {
    return null;
  }
  const colored = stops.filter((s): s is RadialStop & { color: Rgb } => !s.transparent && s.color !== null && (s.color.a ?? 1) > RADIAL_FADE_MAX_ALPHA);
  if (colored.length === 0 || colored.every((s) => rgbChroma(s.color) < SPOTLIGHT_MIN_CHROMA)) {
    return null; // nothing visible, or a neutral vignette — a legitimate lighting move
  }
  if (colored.some((s) => (s.color.a ?? 1) >= HALO_MIN_STOP_ALPHA)) {
    return {
      rule: "radial-halo",
      severity: "P2",
      selector: input.selector,
      value: `saturated radial wash on ${Math.round(input.width)}×${Math.round(input.height)}`,
      message:
        "a saturated chromatic radial wash used as a background glow — the generated-UI halo tell; ground the surface with a solid or subtly shifted background",
      origin: "impeccable",
    };
  }
  if (colored.length <= SPOTLIGHT_MAX_STOPS) {
    return {
      rule: "radial-spotlight-glow",
      severity: "P3",
      selector: input.selector,
      value: `low-alpha radial spotlight on ${Math.round(input.width)}×${Math.round(input.height)}`,
      message:
        "a translucent accent radial 'spotlight' behind a surface — sanctioned only on the owner effect carriers (empty-state aura, media-grid spotlight, weave glow); anywhere else it is the reflex decoration tell",
      origin: "impeccable",
    };
  }
  return null;
}

/** The two radial rules' shared disposition. The census is every visible radial-gradient layer, element
 *  and pseudo (ops/walker/census-glow.ts). Two declines are not this rule's own question:
 *
 *  - the owner-sanctioned effect carrier — `excluded`, a measured fact, and it is checked FIRST so an
 *    exempt carrier can never mint a NO VERDICT off a gradient nobody was going to judge anyway;
 *  - a gradient carrying a colour-shaped arg the ONE reader could not read — `withheld` (#1808). The
 *    stops that DID parse are not a smaller gradient, they are a partial measurement, and the polarity
 *    law (contract/findings.ts) says absence of measurement is NO VERDICT.
 *
 *  Every other `null` from the check (too small, does not fade out, neutral chroma, too few stops) is the
 *  rule ANSWERING "no", which `grayOnColorOutcome` in checks-color.ts rules a judged pass rather than an
 *  exclusion. The two rules split ONE detector run, so each publishes the same denominator and only its
 *  own affected count — and therefore the same refusal, which belongs to the gradient, not to one rule. */
export function classifyRadialGlow(input: RadialGlowInput, rule: "radial-halo" | "radial-spotlight-glow"): CandidateDisposition {
  if (input.sanctioned) {
    return { kind: "excluded", reason: "sanctionedGlowCarrier" };
  }
  if (scanRadialStops(input.value).kind === "unresolved") {
    return { kind: "withheld", reason: "unresolvedGradientStop" };
  }
  const finding = checkRadialGlow(input);
  return { kind: "judged", finding: finding?.rule === rule ? finding : null };
}

const PATTERN_MIN_WIDTH_PX = 100;

const PATTERN_MIN_HEIGHT_PX = 40;

export function checkBgPattern(input: BgPatternInput): Finding | null {
  if (input.width < PATTERN_MIN_WIDTH_PX || input.height < PATTERN_MIN_HEIGHT_PX) {
    return null;
  }
  if (input.kind === "stripe") {
    return {
      rule: "stripe-background",
      severity: "P3",
      selector: input.selector,
      value: "repeating-linear-gradient surface decoration",
      message:
        "repeating-gradient stripes as surface decoration are a generated-UI signature — reach for a deliberate texture (the sanctioned grain axis) or leave the surface plain",
      origin: "impeccable",
    };
  }
  return {
    rule: "grid-line-background",
    severity: "P3",
    selector: input.selector,
    value: `two-axis gradient grid (cell ${input.backgroundSize})`,
    message: "a decorative grid-line background drawn with tiled hairline gradients — reserve grid overlays for actual canvas/map/measurement surfaces",
    origin: "impeccable",
  };
}

/** The two background-pattern rules' disposition. A sample carries exactly one `kind`, so the OTHER
 *  rule's census excludes it by a measured fact — `stripe-background` and `grid-line-background` are
 *  different populations drawn from one walker sweep, and pretending a stripe was "judged clean" by the
 *  grid rule would inflate both denominators. The size floor stays a judged pass: "is this big enough to
 *  be surface decoration" is the rule's own question. */
export function classifyBgPattern(input: BgPatternInput, rule: "grid-line-background" | "stripe-background"): CandidateDisposition {
  if ((input.kind === "stripe") !== (rule === "stripe-background")) {
    return { kind: "excluded", reason: "otherPatternKind" };
  }
  return { kind: "judged", finding: checkBgPattern(input) };
}

const TILE_MIN_PX = 32;

const TILE_MAX_PX = 128;

const TILE_MIN_ASPECT = 0.7;

const TILE_MAX_ASPECT = 1.4;

const TILE_BG_MIN_ALPHA = 0.1;

const TILE_ICON_MAX_FILL = 0.95;

const TILE_STACK_SLACK_PX = 4;

const CIRCLE_RADIUS_FACTOR = 2; // radius ≥ width/2 = a circle = an avatar, not the tile template

function iconTileShapeMatches(input: IconTileInput): boolean {
  const w = input.siblingWidth;
  const h = input.siblingHeight;
  if (w < TILE_MIN_PX || w > TILE_MAX_PX || h < TILE_MIN_PX || h > TILE_MAX_PX) {
    return false;
  }
  const aspect = w / h;
  if (aspect < TILE_MIN_ASPECT || aspect > TILE_MAX_ASPECT) {
    return false;
  }
  const tileVisible = input.siblingBgAlpha > TILE_BG_MIN_ALPHA || input.siblingHasBgImage || input.siblingBorderWidth > 0;
  if (!tileVisible || input.siblingRadiusPx >= w / CIRCLE_RADIUS_FACTOR) {
    return false;
  }
  if (!input.hasIconChild || (input.iconChildWidth > 0 && input.iconChildWidth >= w * TILE_ICON_MAX_FILL)) {
    return false;
  }
  // Vertical stacking: the tile must end above where the heading starts.
  return !(input.headingTop > 0 && input.siblingBottom > 0 && input.siblingBottom > input.headingTop + TILE_STACK_SLACK_PX);
}

export function checkIconTile(input: IconTileInput): Finding | null {
  if (!iconTileShapeMatches(input)) {
    return null;
  }
  return {
    rule: "icon-tile-stack",
    severity: "P3",
    selector: input.siblingSelector,
    value: `${Math.round(input.siblingWidth)}×${Math.round(input.siblingHeight)}px icon tile above ${input.headingTag} "${input.headingText}"`,
    message:
      "a rounded-square icon container stacked above a heading is the universal generated feature-card template — put the icon beside the heading or let it sit in flow without its own container",
    origin: "impeccable",
  };
}

/** The two static-motion rules' disposition. The walker gathers three sample KINDS into one array
 *  (`bounce-name`, `overshoot-bezier`, `layout-transition`) and each rule owns a disjoint subset, so the
 *  other kinds are an exclusion rather than a phantom clean judgment. `panelExempt` is the motion law's
 *  own §3.7 carve-out (the measured-var accordion/collapsible panels) and is likewise a closed
 *  exclusion — the count is what makes a widening `PANEL_EXEMPT_SEL` visible instead of silent. An
 *  `overshoot-bezier` sample whose curve re-parses inside the legal band is a judged pass. */
export function classifyMotionStatic(input: MotionStaticInput, rule: "bounce-easing" | "layout-transition"): CandidateDisposition {
  if ((input.kind === "layout-transition") !== (rule === "layout-transition")) {
    return { kind: "excluded", reason: "otherMotionKind" };
  }
  if (rule === "layout-transition" && input.panelExempt) {
    return { kind: "excluded", reason: "panelExempt" };
  }
  return { kind: "judged", finding: checkMotionStatic(input) };
}

export function checkMotionStatic(input: MotionStaticInput): Finding | null {
  if (input.kind === "layout-transition") {
    if (input.panelExempt) {
      return null;
    }
    return {
      rule: "layout-transition",
      severity: "P3",
      selector: input.selector,
      value: `transition: ${input.value}`,
      message:
        "a declared transition on a layout property (width/height/padding/margin) — per-frame layout when it runs; motion law §3.7 is compositor-only (transform/opacity), with only the measured-var accordion/collapsible panels exempt. §3.7's 2026-08-22 interactive-state carve-out is PAINT-ONLY COLOUR and does not reach a layout property, whatever triggers it",
      origin: "impeccable",
    };
  }
  if (input.kind === "overshoot-bezier") {
    const bezierOvershootMinY = -0.1;
    const bezierOvershootMaxY = 1.1;
    const match = /cubic-bezier\(\s*[\d.-]+\s*,\s*([\d.-]+)\s*,\s*[\d.-]+\s*,\s*([\d.-]+)\s*\)/u.exec(input.value);
    const y1 = Number.parseFloat(match?.[1] ?? "NaN");
    const y2 = Number.parseFloat(match?.[2] ?? "NaN");
    if (!(y1 < bezierOvershootMinY || y1 > bezierOvershootMaxY || y2 < bezierOvershootMinY || y2 > bezierOvershootMaxY)) {
      return null;
    }
  }
  return {
    rule: "bounce-easing",
    severity: "P2",
    selector: input.selector,
    value: input.value,
    message:
      "bounce/elastic/overshoot easing on programmatic motion — banned by the motion law (§4.3: no spring-overshoot outside genuinely gesture-driven surfaces); use --ease-out-expo",
    origin: "impeccable",
  };
}
