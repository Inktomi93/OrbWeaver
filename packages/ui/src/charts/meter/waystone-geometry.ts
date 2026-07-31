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
export const MARKER_STROKE = 1.2;
export const MARKER_HALO_R = 6.4;
/** Where the pointer's halo sits on the radius — mid-needle, so the glow reads as the hand's own anchor. */
export const MARKER_HALO_R_POS = 40;
// The POINTER needle, drawn at 12 o'clock and rotated to the hour (the hand's shape must communicate "I am
// the time pointer" — a bare dot near the rim reads as a stray dot; owner round 2). Radii, outermost first:
// a flat cap OUTSIDE the ring, a shoulder at the ring's inner edge, and a tapered tip touching the sky disc,
// so the needle visibly CROSSES the band it marks instead of floating beside it.
const POINTER_TIP_R = 34.6;
const POINTER_SHOULDER_R = 40.6;
const POINTER_CAP_R = 45.6;
const POINTER_HALF_W = 3.4;
const POINTER_CAP_HALF_W = 2.2;
export const SKY_XY = 10;
export const SKY_WH = 76;
const HOURS_IN_DAY = 24;
export const MINUTES_IN_HOUR = 60;
const DEG_FULL = 360;
const DEG_HALF = 180;
/** The bezel band between the sky disc and the dial ring — where the hour ticks and the marker's pointer live. */
/** The bezel band between the sky disc and the dial ring — where the cardinal glyphs and the hand's tip live. */
export const BEZEL_R = 37.5;
/** The cardinal glyph radius: as large as the bezel allows, because at 76px anything smaller is a dot. */
export const CARDINAL_R = 3.1;
export const CARDINAL_STROKE = 1.1;
export const CARDINAL_RAY_W = 1;
export const CARDINAL_RAY_GAP = 1.5;
/** Four rays, not eight: at the sizes this ships at, more than four is mush. Degrees around the sun glyph. */
const QUARTER_TURN = 90;
const RAY_COUNT = 4;
export const CARDINAL_RAYS: readonly number[] = Array.from({ length: RAY_COUNT }, (_, i) => i * QUARTER_TURN);
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
/** The rest-state opacity of a band that is NOT the current one. High on purpose: the bands are UI CHROME
 *  telling six sections apart, so they stay vivid — the current one wins on its halo, not by drowning the
 *  others (owner round 2: at 76px a 0.72 wash made every band read as the same dusty pastel). */
export const ARC_REST_OPACITY = 0.9;
/** The current band's halo: how far it spreads past the ring, and how strongly (a hue-agnostic "we are here"
 *  — a pure brightness step reads on the gold bands and disappears on the indigo ones). */
export const ARC_GLOW_SPREAD = 4;
export const ARC_GLOW_OPACITY = 0.42;
/** The hairline break between adjacent bands, in HOURS of dial. Six sections at 76px need a visible seam even
 *  where neighbouring hues are close — the segmentation is structural, not only chromatic. */
export const ARC_GAP_HOURS = 0.17;

// ─── The dial band ramp — UI chrome, deliberately vivid ──────────────────────────────────────────
// Round 2 (owner, at ACTUAL 76px): deriving the band color straight from the sky kept the right HUE but
// inherited the sky's atmospheric wash — low chroma, mid lightness, six near-identical dusty pastels, worse
// in light mode. The fix keeps ONE source of hue truth and normalizes the rest: the HUE ANGLE still comes
// from `waystoneBandTint` (the sky that band paints), while LIGHTNESS and CHROMA are a deliberate UI ramp at
// candy-level saturation. Atmosphere lives on the DISC; the ring is an instrument scale.
//
// The ramp also SEPARATES the same-hue pairs, which is why hue alone could never have worked: morning and
// afternoon both derive from the day track (light/airy vs full bright), night and midnight both from the
// night track (deep blue vs darkest indigo).
//
// Rendered with CSS relative color syntax — `oklch(from <tint> L C h)` — the idiom this stylesheet already
// uses. Zero raw color literals: the hue is a token derivation, L/C are scalars.
interface WaystoneBandRamp {
  readonly l: number;
  readonly c: number;
}
const ARC_BAND_RAMP: Readonly<Record<WaystonePhase, WaystoneBandRamp>> = {
  dawn: { l: 0.74, c: 0.105 },
  morning: { l: 0.88, c: 0.055 },
  afternoon: { l: 0.76, c: 0.12 },
  evening: { l: 0.62, c: 0.115 },
  night: { l: 0.5, c: 0.09 },
  midnight: { l: 0.37, c: 0.07 },
};
/** The lit band is its own color, one step brighter + richer — the halo carries the rest of the emphasis. */
const ARC_LIT_L_GAIN = 0.06;
const ARC_LIT_C_GAIN = 0.02;

/** One dial band's stroke: the band's own hue at the normalized ramp, shifted per POLARITY by the two vars
 *  the stylesheet sets (a light theme needs darker, slightly richer bands to read against a light bezel).
 *  Defaults inline so the stone still paints correctly if it ever renders outside the stylesheet's scope. */
export function arcStroke(phase: WaystonePhase, lit: boolean): string {
  const band = ARC_BAND_RAMP[phase];
  const l = lit ? band.l + ARC_LIT_L_GAIN : band.l;
  const c = lit ? band.c + ARC_LIT_C_GAIN : band.c;
  return `oklch(from ${waystoneBandTint(phase)} calc(${l} + var(--orb-ws-band-l, 0)) calc(${c} * var(--orb-ws-band-c, 1)) h)`;
}

// ─── Tints (tokens + color-mix ONLY — the §12.1.9 one-home rule for the stone) ───────────────────
/** The horizon silhouette — a foreground-shifted sidebar tone (polarity-safe contrast, no raw black). It
 *  renders FULLY OPAQUE: at 0.85 the rain fell straight through the hill, which broke the one depth cue the
 *  stone has. Any softening belongs in the fill, never in the opacity. */
/** The noon sun + midnight moon on the bezel — the two marks that teach the 24h convention. Both are lifted
 *  toward the foreground so they read over ANY of the six band hues they sit against. */
export const CARDINAL_SUN = "color-mix(in oklab, var(--color-sky-ember) 62%, var(--color-sky-star))";
export const CARDINAL_MOON = "color-mix(in oklab, var(--color-sky-star) 88%, var(--color-sky-night-horizon))";
export const HORIZON_FILL = "color-mix(in oklab, var(--color-foreground) 25%, var(--color-sidebar))";
export const GABLE_FILL = "color-mix(in oklab, var(--color-foreground) 42%, var(--color-sidebar))";
/** The lit window — the one ember in the landscape, and the reason the horizon is a PLACE and not a shape. */
export const GABLE_WINDOW_FILL = "var(--color-primary)";
/** The window's floor glow by day and how much brighter it burns as the sky darkens (it tracks starOpacity). */
export const GABLE_WINDOW_FLOOR = 0.25;
export const GABLE_WINDOW_GAIN = 0.7;
// The homestead on the ridge. Its base sits BELOW the silhouette's ridge line at this x (which runs y≈57.3),
// so the walls are SEATED in the hill instead of floating above it — the flat-base-on-a-slope tell. Scaled up
// from the original 4.75px speck: at the shipped size this reads as a building with a lit window.
const GABLE_BASE_Y = 59.2;
const GABLE_X = 42.4;
const GABLE_W = 9.2;
const GABLE_WALL_H = 5.4;
const GABLE_ROOF_H = 4.6;
export const RAIN_STROKE = "var(--color-sky-rain)";
export const RAIN_W = 1.1;
export const SNOW_FILL = "var(--color-sky-star)";
export const ASH_FILL = "var(--color-sky-ash)";
/** Roughly one ashfall mote in eight is still burning — the only warm thing in a grey fall. */
export const ASH_EMBER_FILL = "color-mix(in oklab, var(--color-sky-ember) 70%, var(--color-sky-ash))";
export const FOG_FILL = "var(--color-sky-cloud)";
export const WIND_FILL = "var(--color-sky-cloud)";
export const CLOUD_LIGHT = "var(--color-sky-cloud)";
export const CLOUD_DARK = "var(--color-sky-cloud-dark)";
export const BOLT_STROKE = "var(--color-highlight)";
export const FLASH_FILL = "color-mix(in oklab, var(--color-highlight) 55%, var(--color-sky-star))";
export const STAR_FILL = "var(--color-sky-star)";
export const MOON_GLINT = "color-mix(in oklab, var(--color-sky-night-horizon) 60%, transparent)";

/** The homestead: walls seated in the ridge, a pitched roof, drawn as ONE path so it silhouettes cleanly. */
export const GABLE_PATH = [
  `M ${GABLE_X} ${GABLE_BASE_Y}`,
  `L ${GABLE_X} ${GABLE_BASE_Y - GABLE_WALL_H}`,
  `L ${GABLE_X + GABLE_W / 2} ${GABLE_BASE_Y - GABLE_WALL_H - GABLE_ROOF_H}`,
  `L ${GABLE_X + GABLE_W} ${GABLE_BASE_Y - GABLE_WALL_H}`,
  `L ${GABLE_X + GABLE_W} ${GABLE_BASE_Y}`,
  "Z",
].join(" ");
/** The window: a real opening in the wall, sized to read at the shipped stone size. */
const GABLE_WINDOW_W = 2.2;
const GABLE_WINDOW_H = 2.6;
const GABLE_WINDOW_DROP = 0.9;
export const GABLE_WINDOW = {
  x: GABLE_X + GABLE_W / 2 - GABLE_WINDOW_W / 2,
  y: GABLE_BASE_Y - GABLE_WALL_H + GABLE_WINDOW_DROP,
  w: GABLE_WINDOW_W,
  h: GABLE_WINDOW_H,
} as const;

/** The pointer needle as one path, drawn pointing UP (12 o'clock); the hand group rotates it to the hour.
 *  Tapered tip inward at the sky, straight flanks across the bezel, a squared cap just outside the ring. */
export const POINTER_PATH = [
  `M ${C} ${C - POINTER_TIP_R}`,
  `L ${C - POINTER_HALF_W} ${C - POINTER_SHOULDER_R}`,
  `L ${C - POINTER_CAP_HALF_W} ${C - POINTER_CAP_R}`,
  `L ${C + POINTER_CAP_HALF_W} ${C - POINTER_CAP_R}`,
  `L ${C + POINTER_HALF_W} ${C - POINTER_SHOULDER_R}`,
  "Z",
].join(" ");

/** THE hour→angle mapping — the dial's single geometric home. Degrees CLOCKWISE from 12 o'clock, so noon sits
 *  at the top and midnight at the bottom. Everything angular on the stone goes through this one function: the
 *  band arcs, the cardinal glyphs, and the hour hand's rotation. (A second table with its own origin is
 *  exactly how a ring drifts out of agreement with its own hand.) */
export function hourAngle(hour: number): number {
  return ((((hour / HOURS_IN_DAY) * DEG_FULL + DEG_HALF) % DEG_FULL) + DEG_FULL) % DEG_FULL;
}

/** A point on a dial circle at a given hour — noon at the top, midnight at the bottom, clockwise. */
export function pointAt(hour: number, radius: number): { readonly x: number; readonly y: number } {
  const theta = (hourAngle(hour) * Math.PI) / DEG_HALF;
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
  return hourAngle(hour + minute / MINUTES_IN_HOUR);
}

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

/** One drop/mote: its lattice position plus a deterministic JITTER — a scale (length/width/radius), an alpha,
 *  and for ash whether this one is still burning. Real precipitation is irregular; a perfect grid at one
 *  length and one opacity reads as a texture swatch. */
export interface WaystoneLatticeCell {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly alpha: number;
  readonly ember: boolean;
}

/** A stable pseudo-random in [0,1) from two ints — deterministic, so the fall is identical every render (no
 *  Math.random in a component, no re-jitter on every paint). */
// The classic one-line hash: two large coprime-ish multipliers into sin(), scaled past any float grid. The
// constants carry no meaning beyond "big and unrelated" — that is the whole point of a hash.
const HASH_A = 127.1;
const HASH_B = 311.7;
const HASH_SCALE = 43_758.545;
function jitter(a: number, b: number): number {
  const n = Math.sin(a * HASH_A + b * HASH_B) * HASH_SCALE;
  return n - Math.floor(n);
}

/** The lattice a particle layer falls on: `columns` evenly spread across the disc, each offset by a fraction of
 *  the pitch so the fall never reads as a grid, rows covering the disc plus one pitch of overscan. The PITCH is
 *  exact (the loop's seam depends on it); everything else is jittered. */
export function latticeCells(layer: WaystoneParticleLayer): readonly WaystoneLatticeCell[] {
  const cells: WaystoneLatticeCell[] = [];
  const span = SKY_WH - LATTICE_INSET * 2;
  for (let col = 0; col < layer.columns; col++) {
    const base = SKY_XY + LATTICE_INSET + (span * col) / Math.max(layer.columns - 1, 1);
    const offset = (layer.pitch * col) / layer.columns;
    let row = 0;
    for (let y = LATTICE_TOP + offset - layer.pitch; y < LATTICE_BOTTOM; y += layer.pitch) {
      const seed = jitter(col, row);
      const seedB = jitter(row, col + HASH_SEED_OFFSET);
      cells.push({
        x: Number.parseFloat((base + (seed - HALF) * LATTICE_X_JITTER).toFixed(COORD_PRECISION)),
        y: Number.parseFloat(y.toFixed(COORD_PRECISION)),
        scale: Number.parseFloat((1 - LATTICE_SCALE_JITTER * HALF + seedB * LATTICE_SCALE_JITTER).toFixed(COORD_PRECISION)),
        alpha: Number.parseFloat((LATTICE_ALPHA_FLOOR + seed * (1 - LATTICE_ALPHA_FLOOR)).toFixed(COORD_PRECISION)),
        ember: seedB > EMBER_CUTOFF,
      });
      row++;
    }
  }
  return cells;
}
const HASH_SEED_OFFSET = 7;
const HALF = 0.5;
const LATTICE_X_JITTER = 3.2;
const LATTICE_SCALE_JITTER = 0.55;
const LATTICE_ALPHA_FLOOR = 0.5;
const EMBER_CUTOFF = 0.875;

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
