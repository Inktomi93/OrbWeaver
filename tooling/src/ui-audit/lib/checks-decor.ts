// Accent borders (side-tab / border-accent-on-rounded) + chromatic glow shadows (dark-glow,
// sanctioned axes exempt). Pure. Provenance: lib/collect.ts header.

import type { Rgb } from "@orb/tooling/_shared/wcag";
import { relativeLuminance, rgbChroma } from "@orb/tooling/_shared/wcag";
import type { CandidateDisposition, Finding } from "../contract/findings.ts";
import type { AccentBorderInput, GlowShadowInput } from "../contract/samples.ts";
import { findColorToken } from "./css-color.ts";
import { REM_PX } from "./ramp.ts";

const ACCENT_BORDER_MIN_CHROMA = 25;

const ACCENT_BORDER_MIN_ALPHA = 0.5;

const ACCENT_BORDER_MIN_PX = 2;

const ACCENT_DOMINANCE_FACTOR = 2;

const HAIRLINE_MAX_PX = 1;

const SIDE_TAB_BARE_MIN_PX = 3;

const HORIZONTAL_BAND_MAX_PX = 12;

const BORDER_SIDES = ["top", "right", "bottom", "left"] as const;

type BorderSide = (typeof BORDER_SIDES)[number];
type AccentBorderRuleId = "border-accent-on-rounded" | "side-tab";

/** One side's verdict: every accent-border rule it violates (a single edge can be two tells at once —
 *  a chromatic side band AND a border fighting the corner radius). */
function classifyAccentSide(input: AccentBorderInput, side: BorderSide): readonly AccentBorderRuleId[] {
  const w = input.widths[side];
  const color = input.colors[side];
  if (w < ACCENT_BORDER_MIN_PX || color === null || (color.a ?? 1) < ACCENT_BORDER_MIN_ALPHA || rgbChroma(color) < ACCENT_BORDER_MIN_CHROMA) {
    return [];
  }
  const maxOther = Math.max(...BORDER_SIDES.filter((s) => s !== side).map((s) => input.widths[s]));
  // Dominant-edge gate: the accent side is ≥2px AND the other sides are hairline or half it.
  if (!(maxOther <= HAIRLINE_MAX_PX || w >= maxOther * ACCENT_DOMINANCE_FACTOR)) {
    return [];
  }
  return side === "left" || side === "right" ? classifyVerticalEdge(input, w) : classifyHorizontalEdge(input, w);
}

/** A left/right accent edge. A RADIUS MAKES IT BOTH TELLS (issue #188): the rule as born returned
 *  "side-tab" alone here, so the live home resume card — a 3px accent edge on a 10px-radius panel, the
 *  textbook shape of BOTH §6 bans — could never report `border-accent-on-rounded`, which was reachable
 *  from a top/bottom edge only. A border fighting a rounded corner does not care which corner it hits. */
function classifyVerticalEdge(input: AccentBorderInput, w: number): readonly AccentBorderRuleId[] {
  if (input.badgeLike) {
    return [];
  }
  if (input.radius > 0) {
    return ["border-accent-on-rounded", "side-tab"];
  }
  return w >= SIDE_TAB_BARE_MIN_PX ? ["side-tab"] : [];
}

/** A top/bottom accent edge: rounded ⇒ the corner-fighting tell; otherwise a bare 3–12px chromatic band,
 *  with tab underlines exempt (an active-tab indicator is the affordance, not a decoration). */
function classifyHorizontalEdge(input: AccentBorderInput, w: number): readonly AccentBorderRuleId[] {
  if (input.radius > 0) {
    return ["border-accent-on-rounded"];
  }
  if (!input.tabContext && w >= SIDE_TAB_BARE_MIN_PX && w <= HORIZONTAL_BAND_MAX_PX) {
    return ["side-tab"];
  }
  return [];
}

/** The two accent-border rules' shared disposition. The census is every visible element carrying a
 *  \>=2px border (ops/walker/census-decor.ts), so both declines below are RATIFIED EXEMPTIONS — measured
 *  facts that put the candidate outside the rule's semantic population — and both are counted rather
 *  than dropped, so widening one is visible in the denominator instead of arriving as a quieter clean
 *  run. Everything else is judged: the width/chroma/dominance gates are the rule's own question, and a
 *  "no" to them is a pass (the `grayOnColorOutcome` precedent in checks-color.ts). */
export function classifyAccentBorder(input: AccentBorderInput, rule: AccentBorderRuleId): CandidateDisposition {
  if (input.statusContext) {
    return { kind: "excluded", reason: "statusRegionAccent" };
  }
  if (input.listRowSelected) {
    return { kind: "excluded", reason: "ratifiedListRowSelection" };
  }
  if (input.artPane) {
    return { kind: "excluded", reason: "illustratedPickerArt" };
  }
  return { kind: "judged", finding: checkAccentBorder(input).find((finding) => finding.rule === rule) ?? null };
}

export function checkAccentBorder(input: AccentBorderInput): Finding[] {
  // A live status/alert region wears a colored single-edge border as a severity accent.
  if (input.statusContext) {
    return [];
  }
  // RATIFIED (owner, 2026-08-22, issue #485): the selected-row left accent — a 2px `border-l-primary` on a
  // `rounded-control` row, homed as `@orb/ui`'s `SELECTION_RAIL` fragment (packages/ui/src/lib/
  // selection-rail.ts) — is the app-wide SELECTION idiom, not a decorative card tell, so it is exempt from
  // both §6 accent-border bans. The sample's predicate is deliberately BOTH halves (carrier identity AND
  // `data-selected`): an unselected row wearing a hardcoded accent, and any non-carrier rounded box with a
  // left edge, stay judged — that is what keeps this exemption from widening into the rule's real target.
  // The carrier set is the FRAGMENT's, not one primitive's: #1823 gave the config band the same pair, which
  // is why the walker's selector is `SELECTION_RAIL_SEL` rather than a list-row-only one.
  if (input.listRowSelected) {
    return [];
  }
  // THE PICTURE IS NOT THE PRODUCT (#1642). Inside an illustrated picker's art aperture
  // (`[data-slot=picker-cell-art]`, the shared `@orb/ui` PickerCell anatomy) the accent stripe is the
  // cell's SUBJECT: the chat-style cells render mini transcript lines in each skin's own classes and
  // inherit that skin's 3px accent through `stripeOf` precisely so a reader can tell the skins apart,
  // and the density/elevation cells draw their axis the same way. Judging it reported the DIAGRAM (4
  // findings on `[data-slot=chat-style-cards]`, 2× side-tab + 2× border-accent-on-rounded) while saying
  // nothing about any surface a user reads. Keyed on the shared slot, never one feature's selector —
  // the exemption's REACH is FOUR pickers, not the one that reported it: ast-grep on
  // `<RadioGroupPickerItem art=…>` (787 tsx, 2026-09-05) finds chat style, density, elevation and the
  // theme LOOKS picker, whose `ThemeMiniSurface` swatch paints a card with the theme's own radius and
  // hairline — a theme swatch is a picture of a design too. The sample stays counted in the denominator.
  if (input.artPane) {
    return [];
  }
  const findings: Finding[] = [];
  const seenRules = new Set<AccentBorderRuleId>();
  for (const side of BORDER_SIDES) {
    for (const rule of classifyAccentSide(input, side)) {
      if (seenRules.has(rule)) {
        continue;
      }
      seenRules.add(rule);
      findings.push({
        rule,
        severity: "P3",
        selector: input.selector,
        value: `border-${side}: ${input.widths[side]}px${input.radius > 0 ? ` + radius ${input.radius}px` : ""}`,
        message:
          rule === "side-tab"
            ? "a thick chromatic accent border on one edge of a card is the most recognizable generated-UI tell — use a subtler accent or remove it"
            : "a thick accent border fighting rounded corners — remove the border or the radius; they contradict each other",
        origin: "impeccable",
      });
    }
  }
  return findings;
}

const GLOW_MIN_CHROMA = 30;

const GLOW_MIN_BLUR_PX = 4;

const GLOW_MIN_ALPHA = 0.05;

const GLOW_BLUR_INDEX = 2; // shadow lengths: offset-x, offset-y, blur, [spread]
const DARK_BACKDROP_MAX_LUM = 0.1;

const SHADOW_LAYER_SPLIT_RE = /,(?![^(]*\))/;

const SHADOW_LENGTH_RE = /(-?\d*\.?\d+)(px|rem|em)?/g;

// COLOUR READING IS `lib/css-color.ts`'s JOB, NEVER A REGEX HERE (#983-family, 2026-09-01). This
// file used to carry `SHADOW_COLOR_RE = /rgba?\([^)]*\)/i` plus a `/[\d.]+/g` channel scrape, which
// made `glow-shadow` blind to every OKLCH value — i.e. to every colour a tokens-only tree can
// author, since raw colours are gate-RED at source. Measured with a two-direction control: the same
// zero-offset chromatic halo FIRED as `rgba(255,90,40,.55)` and was SILENT as
// `oklch(0.7 0.19 40 / 0.55)`. `@orb/kit/safe-color` is the one colour clamp and re-deriving a
// colour regex is banned outright by UI-Primitives-and-Reuse.md §13.9.
function parseShadowLayer(layer: string): { color: Rgb; lengths: number[] } | null {
  const token = findColorToken(layer);
  if (token === null) {
    return null;
  }
  const color = token.color;
  const stripped = `${layer.slice(0, token.start)} ${layer.slice(token.end)}`;
  const lengths: number[] = [];
  SHADOW_LENGTH_RE.lastIndex = 0;
  let m = SHADOW_LENGTH_RE.exec(stripped);
  while (m !== null) {
    let v = Number.parseFloat(m[1] as string);
    if (m[2] === "rem" || m[2] === "em") {
      v *= REM_PX;
    }
    lengths.push(v);
    m = SHADOW_LENGTH_RE.exec(stripped);
  }
  return { color, lengths };
}

/** A chromatic blurred layer's glow classification: "halo" (zero-offset), "dark-bg", or null. */
function classifyGlowLayer(layer: string, onDark: boolean): "halo" | "dark-bg" | null {
  const parsed = parseShadowLayer(layer);
  if (parsed === null || rgbChroma(parsed.color) < GLOW_MIN_CHROMA || (parsed.color.a ?? 1) <= GLOW_MIN_ALPHA) {
    return null;
  }
  const blur = parsed.lengths[GLOW_BLUR_INDEX];
  if (blur === undefined || blur <= GLOW_MIN_BLUR_PX) {
    return null;
  }
  if (parsed.lengths[0] === 0 && parsed.lengths[1] === 0) {
    return "halo";
  }
  return onDark ? "dark-bg" : null;
}

function scanShadowValue(value: string, prop: string, onDark: boolean, selector: string): Finding | null {
  if (value === "") {
    return null;
  }
  for (const layer of value.split(SHADOW_LAYER_SPLIT_RE)) {
    const verdict = classifyGlowLayer(layer, onDark);
    if (verdict === null) {
      continue;
    }
    return {
      rule: "glow-shadow",
      severity: "P3",
      selector,
      value: `${prop}: ${verdict === "halo" ? "zero-offset chromatic halo" : "chromatic blur on dark backdrop"}`,
      // MEASURED TRUTH, not the old clobber rationale (SKILL.md retraction + the re-taken 2026-09-01
      // composition receipt: ring layers serialize FIRST in the composed box-shadow, so a utility-form
      // glow does not clobber the focus ring). The sanctioned forms are named below; everything else —
      // a hand-spelled halo, a layer over content, a near-miss of the token — is the glow tell.
      message:
        "a colored glow shadow — the sanctioned forms are the rationed accent glow (--shadow-glow) on a DEDICATED pseudo layer (absolute, pointer-events-none, behind the content, inset to the box, carrying no other paint) on selected/active carriers, and the token-exact primary-CTA hover treatment (--shadow-cta-glow, which the focus ring composes over); any other chromatic glow is the generated-UI glow tell",
      origin: "impeccable",
    };
  }
  return null;
}

/** `glow-shadow`'s disposition. The census is every visible shadow-carrying layer including
 *  `::before`/`::after` (ops/walker/census-glow.ts), and the ONE decline that is not the rule's own
 *  question is the sanctioned carrier — an owner effect axis or the structurally-recognised dedicated
 *  glow layer. Counting it keeps the exemption's REACH visible: a widening `isDedicatedGlowLayer` shows
 *  up as a growing `excluded(sanctionedGlowCarrier)`, where before it only showed up as more silence. */
export function classifyGlowShadow(input: GlowShadowInput): CandidateDisposition {
  if (input.sanctioned === true) {
    return { kind: "excluded", reason: "sanctionedGlowCarrier" };
  }
  return { kind: "judged", finding: checkGlowShadow(input) };
}

export function checkGlowShadow(input: GlowShadowInput): Finding | null {
  // An owner effect carrier is exempt — the SAME mechanism `checkRadialGlow` has always used. Until
  // the colour reader was repaired this arm did not exist, because colour-blindness was doing the
  // exemption's job by accident (the carriers author OKLCH, which the old regex could not spell).
  if (input.sanctioned === true) {
    return null;
  }
  const onDark = input.backdropColor !== null && relativeLuminance(input.backdropColor) < DARK_BACKDROP_MAX_LUM;
  return scanShadowValue(input.boxShadow, "box-shadow", onDark, input.selector) ?? scanShadowValue(input.textShadow, "text-shadow", onDark, input.selector);
}
