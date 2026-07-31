// The Waystone's GEOMETRY + TINT tables (charts/meter/waystone.tsx — RV-10). Component-free: the 96×96 dial
// maths (where an hour sits on the ring, the arc paths, the bezel ticks), the fixed star/cloud/particle
// lattices, and every token tint the layers paint with. Split out of the component so the stone stays under
// the §13.7 primitive size cap and so the pure geometry is readable on its own.
//
// Every color here is a theme token or a `color-mix()` over tokens — zero raw literals, so any seed theme
// restyles the stone for free (D71).
import type { WaystoneCloudLayer, WaystoneParticleLayer, WaystonePhase } from "./waystone-treatment";
import { waystoneBandTint } from "./waystone-treatment";

// ─── Geometry (viewBox units) ────────────────────────────────────────────────────────────────────
export const VIEW = 96;
export const C = VIEW / 2;
export const RING_R = 42;
export const RING_W = 5.5;
export const DISC_R = 35.5;
export const CLIP_R = 34;
export const MARKER_R = 3.3;
export const MARKER_STROKE = 1.6;
export const MARKER_HALO_R = 5.8;
export const SKY_XY = 10;
export const SKY_WH = 76;
const HOURS_IN_DAY = 24;
export const MINUTES_IN_HOUR = 60;
const DEG_FULL = 360;
const DEG_HALF = 180;
/** The bezel band between the sky disc and the dial ring — where the hour ticks and the marker's pointer live. */
const TICK_INNER = 36.3;
const TICK_OUTER = 38.7;
export const TICK_MAJOR_INNER = 35.9;
const TICK_MAJOR_OUTER = 39.2;
const TICK_EVERY_HOURS = 3;
const MAJOR_TICK_EVERY_HOURS = 6;
export const COORD_PRECISION = 2;
/** The particle lattice's vertical extent: enough rows to cover the disc plus one pitch above and below, so a
 *  one-pitch translate never exposes an empty band at either end. */
const LATTICE_TOP = -1;
const LATTICE_BOTTOM = 70;
const LATTICE_INSET = 10;
export const CLOUD_SLOTS = 4;
// Layer magnitudes — named so the geometry reads as design intent rather than sprinkled numbers.
export const SNOW_DOT_R = 1.15;
export const ASH_DOT_R = 0.85;
export const PARTICLE_OPACITY = 0.8;
export const MOON_MASK_SHIFT_X = 0.62;
export const MOON_MASK_SHIFT_Y = 0.42;
export const MOON_MASK_R = 0.92;
export const MOON_GLINT_X = 0.35;
export const MOON_GLINT_Y = 0.3;
export const MOON_GLINT_R = 0.22;
export const GLOW_R = 2.1;
export const GLOW_FLOOR = 0.1;
export const GLOW_ALTITUDE_GAIN = 0.14;
export const SKY_UNSET_OPACITY = 0.5;
/** The rest-state opacity of a band that is NOT the current one: quieter, but still unmistakably ITS color. */
export const ARC_REST_OPACITY = 0.72;
/** The current band's halo: how far it spreads past the ring, and how strongly (a hue-agnostic "we are here"
 *  — a pure brightness step reads on the gold bands and disappears on the indigo ones). */
export const ARC_GLOW_SPREAD = 4;
export const ARC_GLOW_OPACITY = 0.42;
export const TICK_W_MINOR = 1;
export const TICK_W_MAJOR = 1.5;

// ─── Tints (tokens + color-mix ONLY — the §12.1.9 one-home rule for the stone) ───────────────────
/** The dial band strokes. Each of the six segments wears its OWN band identity (`waystoneBandTint` — the sky
 *  that part of the day actually paints), lifted toward the foreground so a dark band still reads against the
 *  bezel; the CURRENT band is lifted further and runs at full opacity, so "we are here" is a brightness step
 *  within one hue family rather than the only color on an otherwise grey ring (owner, 2026-07-31). */
export function arcStroke(phase: WaystonePhase, lit: boolean): string {
  return `color-mix(in oklab, ${waystoneBandTint(phase)} ${lit ? ARC_LIT_MIX : ARC_REST_MIX}%, var(--color-foreground))`;
}
/** How much of the band's own hue survives the legibility lift — the LIT band keeps more of itself (it is
 *  already the brightest thing on the ring), a resting band trades a little hue for luminance. */
const ARC_LIT_MIX = 74;
const ARC_REST_MIX = 52;
export const TICK_STROKE = "color-mix(in oklab, var(--color-foreground) 30%, transparent)";
export const TICK_MAJOR_STROKE = "color-mix(in oklab, var(--color-foreground) 55%, transparent)";
/** The horizon silhouette — a foreground-shifted sidebar tone (polarity-safe contrast, no raw black). */
export const HORIZON_FILL = "color-mix(in oklab, var(--color-foreground) 25%, var(--color-sidebar))";
export const GABLE_FILL = "color-mix(in oklab, var(--color-primary) 45%, var(--color-sidebar))";
export const RAIN_STROKE = "color-mix(in oklab, var(--color-track-6) 80%, var(--color-foreground))";
export const SNOW_FILL = "color-mix(in oklab, var(--color-foreground) 85%, transparent)";
export const ASH_FILL = "color-mix(in oklab, var(--color-primary) 45%, var(--color-foreground))";
export const FOG_STROKE = "color-mix(in oklab, var(--color-foreground) 62%, transparent)";
export const WIND_STROKE = "color-mix(in oklab, var(--color-foreground) 45%, transparent)";
export const CLOUD_LIGHT = "color-mix(in oklab, var(--color-muted) 65%, var(--color-foreground))";
export const CLOUD_DARK = "color-mix(in oklab, var(--color-track-2) 55%, var(--color-foreground))";
export const BOLT_STROKE = "var(--color-highlight)";
export const FLASH_FILL = "color-mix(in oklab, var(--color-highlight) 60%, var(--color-foreground))";
export const STAR_FILL = "var(--color-foreground)";
export const MOON_GLINT = "color-mix(in oklab, var(--color-foreground) 40%, transparent)";

/** A point on a dial circle — noon at the top, midnight at the bottom, clockwise. */
function pointAt(hour: number, radius: number): { readonly x: number; readonly y: number } {
  const theta = (((hour / HOURS_IN_DAY) * DEG_FULL + DEG_HALF) * Math.PI) / DEG_HALF;
  return { x: C + radius * Math.sin(theta), y: C - radius * Math.cos(theta) };
}

/** The dial arc covering an hour span, drawn clockwise at the ring radius. */
export function arcPath(from: number, to: number): string {
  const a = pointAt(from, RING_R);
  const b = pointAt(to, RING_R);
  const large = to - from > HOURS_IN_DAY / 2 ? 1 : 0;
  return `M ${a.x.toFixed(COORD_PRECISION)} ${a.y.toFixed(COORD_PRECISION)} A ${RING_R} ${RING_R} 0 ${large} 1 ${b.x.toFixed(COORD_PRECISION)} ${b.y.toFixed(COORD_PRECISION)}`;
}

/** The marker's rotation from 12 o'clock, clockwise — the hand is DRAWN at noon and rotated to the hour, so a
 *  time change swings it around the ring (a translated marker would cut a chord across the sky). */
export function handAngle(hour: number, minute: number): number {
  return (((hour + minute / MINUTES_IN_HOUR) / HOURS_IN_DAY) * DEG_FULL + DEG_HALF) % DEG_FULL;
}

/** The bezel hour ticks — every 3h, with 00/06/12/18 longer + brighter (the cardinal read). */
export const HOUR_TICKS: readonly {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly major: boolean;
}[] = Array.from({ length: HOURS_IN_DAY / TICK_EVERY_HOURS }, (_, i) => {
  const hour = i * TICK_EVERY_HOURS;
  const major = hour % MAJOR_TICK_EVERY_HOURS === 0;
  const inner = pointAt(hour, major ? TICK_MAJOR_INNER : TICK_INNER);
  const outer = pointAt(hour, major ? TICK_MAJOR_OUTER : TICK_OUTER);
  return { key: `t${hour}`, x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, major };
});

/** The star field — ten fixed positions; each twinkles on its own delay (the `:nth-child` stagger in CSS). */
export const STAR_POSITIONS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 38, y: 32, r: 0.9 },
  { x: 56, y: 26, r: 0.7 },
  { x: 62, y: 40, r: 0.9 },
  { x: 45, y: 22, r: 0.6 },
  { x: 31, y: 42, r: 0.7 },
  { x: 68, y: 31, r: 0.8 },
  { x: 24, y: 34, r: 0.6 },
  { x: 52, y: 45, r: 0.7 },
  { x: 72, y: 46, r: 0.6 },
  { x: 41, y: 48, r: 0.8 },
];

/** The four cloud slots — a fixed set of puffs at different heights; the recipe's `count` lights the first N
 *  (opacity, not mount, so a weather change fades the deck in/out instead of popping it). */
export const CLOUD_SLOT_PATHS: readonly string[] = [
  "M 44 26 a 6 6 0 0 1 11 -3 a 7 7 0 0 1 12 3 z",
  "M 20 35 a 5 5 0 0 1 9 -3 a 6 6 0 0 1 10 3 z",
  "M 52 41 a 5 5 0 0 1 10 -3 a 6 6 0 0 1 11 3 z",
  "M 26 48 a 4.5 4.5 0 0 1 9 -3 a 5.5 5.5 0 0 1 10 3 z",
];

/** The lattice a particle layer falls on: `columns` evenly spread across the disc, each offset by a fraction of
 *  the pitch so the fall never reads as a grid, rows covering the disc plus one pitch of overscan. */
export function latticeCells(layer: WaystoneParticleLayer): readonly { readonly x: number; readonly y: number }[] {
  const cells: { x: number; y: number }[] = [];
  const span = SKY_WH - LATTICE_INSET * 2;
  for (let col = 0; col < layer.columns; col++) {
    const x = SKY_XY + LATTICE_INSET + (span * col) / Math.max(layer.columns - 1, 1);
    const offset = (layer.pitch * col) / layer.columns;
    for (let y = LATTICE_TOP + offset - layer.pitch; y < LATTICE_BOTTOM; y += layer.pitch) {
      cells.push({ x, y });
    }
  }
  return cells;
}

export const FALL_SPEED_CLASS: Readonly<Record<WaystoneParticleLayer["speed"], string>> = {
  fast: "orb-ws-fall-fast",
  mid: "orb-ws-fall-mid",
  slow: "orb-ws-fall-slow",
};

export const CLOUD_DRIFT_CLASS: Readonly<Record<WaystoneCloudLayer["drift"], string>> = {
  slow: "orb-ws-cloud-slow",
  mid: "orb-ws-cloud-mid",
  fast: "orb-ws-cloud-fast",
};
