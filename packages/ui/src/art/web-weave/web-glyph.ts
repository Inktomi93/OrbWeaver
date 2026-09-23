// The condensed orb-web GLYPH — the brand mark's parametric form (D173
// "one emblem, every scale": the favicon IS the settled web's final
// frame, and this module is that frame as maths). Split from web-weave-geometry.ts under the
// component-size-ui cap; consumed by the icon seal (primitives/icons/orb-web.ts), the client
// WeaveGlyph mark, and WebSpinner's dash metrics. Pure — no DOM, no colors.

import type { WeavePoint } from "./web-weave-geometry.ts";

const TAU = Math.PI * 2;

// ─── The condensed glyph (favicon = the settled web's final frame — §8 "one emblem, every scale") ──

export interface WebGlyphSpoke {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface WebGlyphGeometry {
  /** The square viewBox edge (32 — matches the shipped favicon assets). */
  readonly viewBox: number;
  readonly spokes: readonly WebGlyphSpoke[];
  /** The open spiral as one SVG path — the deliberate asymmetry that makes it a WEB, not an asterisk. */
  readonly spiralPath: string;
  /** Polyline length of the spiral — the WebSpinner's silk-pulse dash period rides this. */
  readonly spiralLength: number;
  /** The dew drop near the spiral's outer run (mark A's second deliberate asymmetry). */
  readonly dew: WeavePoint;
  readonly hub: { readonly x: number; readonly y: number; readonly r: number };
}

export interface WebGlyphInput {
  readonly spokes: number;
  readonly turns: number;
  readonly spiralEndRadius: number;
  /** The square viewBox edge; radii below are 32-space and scale with it. The 24 arm exists for the
   *  lucide seal (createLucideIcon hardcodes a 24 viewBox). @defaultValue 32 */
  readonly view?: number;
}

const GLYPH_VIEW = 32;
const GLYPH_SPOKE_INNER = 2.6;
const GLYPH_SPOKE_OUTER = 13.6;
const GLYPH_SPIRAL_START_R = 4;
const GLYPH_SPIRAL_SAMPLES = 96;
const GLYPH_HUB_R = 1.9;
/** Where on the spiral the dew condenses (fraction of arc) — the upper-right drop of mark A. */
const GLYPH_DEW_FRAC = 0.82;
const GLYPH_PRECISION = 2;

/** Generate the orb-web glyph (the brand mark's parametric form). Pure; presets below. */
export function webGlyph({ spokes, turns, spiralEndRadius, view = GLYPH_VIEW }: WebGlyphInput): WebGlyphGeometry {
  const scale = view / GLYPH_VIEW;
  const center = view / 2;
  const spokeLines: WebGlyphSpoke[] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU - Math.PI / 2;
    spokeLines.push({
      x1: center + Math.cos(a) * GLYPH_SPOKE_INNER * scale,
      y1: center + Math.sin(a) * GLYPH_SPOKE_INNER * scale,
      x2: center + Math.cos(a) * GLYPH_SPOKE_OUTER * scale,
      y2: center + Math.sin(a) * GLYPH_SPOKE_OUTER * scale,
    });
  }
  let path = "";
  let length = 0;
  let prev: WeavePoint | null = null;
  let dew: WeavePoint = { x: center, y: center };
  for (let i = 0; i <= GLYPH_SPIRAL_SAMPLES; i++) {
    const s = i / GLYPH_SPIRAL_SAMPLES;
    const th = -Math.PI / 2 + s * turns * TAU;
    const r = (GLYPH_SPIRAL_START_R + s * (spiralEndRadius - GLYPH_SPIRAL_START_R)) * scale;
    const x = center + Math.cos(th) * r;
    const y = center + Math.sin(th) * r;
    path += `${i === 0 ? "M" : "L"} ${x.toFixed(GLYPH_PRECISION)} ${y.toFixed(GLYPH_PRECISION)} `;
    if (prev !== null) {
      length += Math.hypot(x - prev.x, y - prev.y);
    }
    if (s <= GLYPH_DEW_FRAC) {
      dew = { x, y };
    }
    prev = { x, y };
  }
  return {
    viewBox: view,
    spokes: spokeLines,
    spiralPath: path.trim(),
    spiralLength: length,
    dew,
    hub: { x: center, y: center, r: GLYPH_HUB_R * scale },
  };
}

/** The display cut (mark A): 8 spokes, 2.6 open turns — wordmark rows, hero marks, spinner md/lg. */
export const WEB_GLYPH_DISPLAY: WebGlyphGeometry = webGlyph({ spokes: 8, turns: 2.6, spiralEndRadius: 13.5 });
/** The 16px cut (the favicon discipline, §8): fewer elements, wider rings — tab strips, spinner sm. */
export const WEB_GLYPH_COMPACT: WebGlyphGeometry = webGlyph({ spokes: 6, turns: 1.7, spiralEndRadius: 10.6 });
