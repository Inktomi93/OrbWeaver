// Ornament censuses: radial-gradient washes, decorative stripe/grid patterns, icon tiles above
// headings, static motion offenders. Pure. Provenance: lib/collect.ts header.

import type { Rgb } from "@orb/tooling/_shared/wcag";
import { rgbChroma } from "@orb/tooling/_shared/wcag";
import type { Finding } from "../contract/findings.ts";
import type { BgPatternInput, IconTileInput, MotionStaticInput, RadialGlowInput } from "../contract/samples.ts";
import { parseRgbTokens } from "./checks-decor.ts";

const RADIAL_MIN_WIDTH_PX = 240;

const RADIAL_MIN_HEIGHT_PX = 160;

const RADIAL_FADE_MAX_ALPHA = 0.05;

const HALO_MIN_STOP_ALPHA = 0.45;

const SPOTLIGHT_MIN_CHROMA = 24;

const SPOTLIGHT_MAX_STOPS = 2;

const RADIAL_MIN_STOPS = 2;

const RADIAL_COLOR_TOKEN_RE = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/i;

const TRANSPARENT_KEYWORD_RE = /^transparent$/i;

const RADIAL_GRADIENT_HEAD_RE = /(repeating-)?radial-gradient\(/gi;

const HEX_SHORT_LEN = 3;

const HEX_LONG_LEN = 6;

const HEX_RADIX = 16;

const HEX_PAIR = 2;

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

function hexToRgbNode(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === HEX_SHORT_LEN ? [...h].map((c) => c + c).join("") : h.slice(0, HEX_LONG_LEN);
  return {
    r: Number.parseInt(full.slice(0, HEX_PAIR), HEX_RADIX),
    g: Number.parseInt(full.slice(HEX_PAIR, HEX_PAIR * 2), HEX_RADIX),
    b: Number.parseInt(full.slice(HEX_PAIR * 2, HEX_PAIR * HEX_SHORT_LEN), HEX_RADIX),
    a: 1,
  };
}

interface RadialStop {
  readonly color: Rgb | null;
  readonly transparent: boolean;
}

function parseRadialStopToken(arg: string): RadialStop {
  const tok = RADIAL_COLOR_TOKEN_RE.exec(arg);
  if (tok === null) {
    return { color: null, transparent: false };
  }
  if (TRANSPARENT_KEYWORD_RE.test(tok[0])) {
    return { color: null, transparent: true };
  }
  const color = tok[0].startsWith("#") ? hexToRgbNode(tok[0]) : parseRgbTokens(tok[0]);
  return { color, transparent: color !== null && (color.a ?? 1) <= RADIAL_FADE_MAX_ALPHA };
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

/** The FIRST non-repeating radial-gradient's color-stop args, or null (repeating-* is a
 *  pattern, not a glow; unparseable color spaces yield too few stops and refuse). */
function extractRadialStopArgs(value: string): string[] | null {
  RADIAL_GRADIENT_HEAD_RE.lastIndex = 0;
  let g = RADIAL_GRADIENT_HEAD_RE.exec(value);
  while (g !== null) {
    if (g[1] === undefined) {
      const open = value.indexOf("(", g.index);
      const end = closingParenIndex(value, open);
      if (end < 0) {
        return null;
      }
      const args = splitTopLevelCommas(value.slice(open + 1, end)).filter((a) => RADIAL_COLOR_TOKEN_RE.test(a));
      return args.length >= RADIAL_MIN_STOPS ? args : null;
    }
    g = RADIAL_GRADIENT_HEAD_RE.exec(value);
  }
  return null;
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

export function checkRadialGlow(input: RadialGlowInput): Finding | null {
  if (input.sanctioned || input.width < RADIAL_MIN_WIDTH_PX || input.height < RADIAL_MIN_HEIGHT_PX) {
    return null;
  }
  const args = extractRadialStopArgs(input.value);
  if (args === null) {
    return null;
  }
  const stops = args.map(parseRadialStopToken);
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
        "a declared transition on a layout property (width/height/padding/margin) — per-frame layout when it runs; motion law §3.7 is compositor-only (transform/opacity), with only the measured-var accordion/collapsible panels exempt",
      origin: "impeccable",
    };
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
