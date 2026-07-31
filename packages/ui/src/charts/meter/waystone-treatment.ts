// The Waystone's TIME × WEATHER matrix — pure data + total resolvers (RV-10). Component-free on purpose: the
// whole visual truth of the stone is a LAYER RECIPE (which sky, where the sun/moon sits, how lit the stars
// are, how many clouds and how fast they run, which particles fall and at what angle, which bands drift,
// whether lightning strikes, how much the weather veils the sky) — data a unit test can walk exhaustively.
//
// THE TWO AXES ARE DIFFERENT KINDS (owner ruling 2026-07-31):
//  • TIME is CONTINUOUS. The stone renders from `clock.hour` DIRECTLY, not from the six `TIME_OF_DAY` labels:
//    the sky interpolates across an hour-keyed stop table, and the sun/moon walks a real arc computed from the
//    hour. Every hour looks subtly different, and the deliberate GOLDEN stops (~5-7h and ~17-19h) make dawn
//    and dusk glow distinctly — which is how dawn/dusk differentiation ships WITHOUT growing the model's write
//    vocabulary (a `dusk` beside `evening` would just invite the model to dither between near-synonyms). The
//    labels stay what the band's TEXT says. In narrated mode a lite clock only ever holds a label's
//    representative hour (`TIME_OF_DAY_HOURS`) — that number is a perfectly good render input.
//  • WEATHER is DISCRETE — a CLOSED vocabulary a free `weather.type` string resolves onto, owning the air
//    layers. Unresolvable ⇒ `null` ⇒ the clear recipe (§12.2.1 nullable-honesty; the band TEXT still names the
//    weather — text is the datum).
//
// `@orb/ui` may not import `@orb/contracts` (the sealed-ui cake, D54), so the ONE thing this module mirrors
// from the contract is the label→hour BANDING used to light the dial's arcs (`WAYSTONE_PHASE_SPANS`), pinned
// by a unit test against the contract's own inversion rule.
//
// Every color is a theme token or a `color-mix()` over tokens — INCLUDING the interpolation, which nests a
// `color-mix` over two token recipes rather than computing RGB in JS (zero raw literals, so any seed theme
// restyles the stone for free, D71, and the browser does the blending in oklab).

/** The dial's label bands — one member per `TIME_OF_DAY` label (the ring is the DISCRETE layer: it shows which
 *  named part of the day we are in, matching the band's text, while the sky reads the exact hour). */
export const WAYSTONE_PHASES = ["dawn", "morning", "afternoon", "evening", "night", "midnight"] as const;
export type WaystonePhase = (typeof WAYSTONE_PHASES)[number];

/** The CLOSED weather vocabulary. A free `weather.type` string resolves onto this (or to `null` = clear). */
export const WAYSTONE_WEATHERS = ["clear", "cloudy", "rain", "storm", "snow", "fog", "wind", "ash"] as const;
export type WaystoneWeather = (typeof WAYSTONE_WEATHERS)[number];

/** The identity of a weather's air-layer stack (`none` = the unveiled sky IS the treatment, not a fallback) —
 *  one member per weather plus `none`, declared as the axis tuple so the union derives rather than re-spells. */
export const WAYSTONE_OVERLAY_KINDS = ["none", "clouds", "rain", "storm", "snow", "fog", "wind", "ash"] as const;
export type WaystoneOverlayKind = (typeof WAYSTONE_OVERLAY_KINDS)[number];

/** The sky disc's radial-gradient recipe — `cy` puts the light source low (a dawn/dusk glow at the horizon) or
 *  high (a midday/midnight dome). Interpolated per hour; a phase change crossfades between two of these. */
export interface WaystoneSky {
  readonly from: string;
  readonly to: string;
  readonly cy: string;
}

/** The sun or moon at its computed point on the day's arc — the stone's primary "what time is it" read. Both
 *  the position and the tint are hour-continuous (a low body is bigger and warmer; a high one small + pale). */
export interface WaystoneCelestial {
  readonly body: "sun" | "moon";
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly fill: string;
  /** 0 at the horizon → 1 at the arc's peak; drives the glow's strength. */
  readonly altitude: number;
}

/** The drifting cloud deck — present in EVERY weather, its density/speed/tone the weather's coarsest read. */
export interface WaystoneCloudLayer {
  readonly count: number;
  readonly opacity: number;
  readonly drift: "slow" | "mid" | "fast";
  readonly tone: "light" | "dark";
}

/** The falling-particle field. `pitch` is the lattice spacing the fall animation translates by (exactly one
 *  pitch per cycle ⇒ a seamless loop); `slant` angles the streak; `sway` adds the lateral drift snow needs. */
export interface WaystoneParticleLayer {
  readonly kind: "rain" | "snow" | "ash";
  readonly columns: number;
  readonly pitch: number;
  readonly speed: "fast" | "mid" | "slow";
  readonly slant: number;
  readonly length: number;
  readonly sway: boolean;
}

/** Horizontal weather that ENVELOPS the place (drawn in front of the horizon silhouette, not falling on it). */
export interface WaystoneBandLayer {
  readonly kind: "fog" | "wind";
  readonly breathe: boolean;
}

/** The weather's veil over the whole sky — the second half of "storm at noon must not look like clear at noon". */
export interface WaystoneWash {
  readonly fill: string;
  readonly opacity: number;
}

/** The WEATHER half of a cell: the air layers. */
export interface WaystoneWeatherRecipe {
  readonly overlay: WaystoneOverlayKind;
  readonly clouds: WaystoneCloudLayer;
  readonly particles: WaystoneParticleLayer | null;
  readonly bands: WaystoneBandLayer | null;
  readonly lightning: boolean;
  readonly wash: WaystoneWash | null;
  /** How much of the sun/moon survives the weather (1 = unveiled, 0.15 = a smudge behind the storm). */
  readonly celestialOpacity: number;
}

/** One resolved cell: the continuous backdrop for this hour + the discrete air layers for this weather. */
export interface WaystoneTreatment extends WaystoneWeatherRecipe {
  readonly sky: WaystoneSky;
  readonly celestial: WaystoneCelestial;
  /** Group opacity of the star field — a transition, so stars fade in through dusk and out through dawn. */
  readonly starOpacity: number;
}

// ─── The interpolation primitive ──────────────────────────────────────────────────────────────────
const HOURS_IN_DAY = 24;
const PCT = 100;
const MIX_PRECISION = 1;

/** Blend two token color recipes in oklab. The browser does the blending — we never resolve a token to RGB in
 *  JS, so the output stays theme-reactive (and a seed theme swap restyles a mid-interpolation sky for free). */
function mixColor(a: string, b: string, t: number): string {
  if (t <= 0) {
    return a;
  }
  if (t >= 1) {
    return b;
  }
  return `color-mix(in oklab, ${a} ${((1 - t) * PCT).toFixed(MIX_PRECISION)}%, ${b})`;
}

/** Find the pair of stops bracketing `hour` on a 24h wrap-around table, plus the 0-1 position between them. */
function bracket<T>(stops: readonly { readonly hour: number; readonly value: T }[], hour: number): { readonly a: T; readonly b: T; readonly t: number } {
  const h = ((hour % HOURS_IN_DAY) + HOURS_IN_DAY) % HOURS_IN_DAY;
  const last = stops.at(-1) ?? stops[0];
  if (last === undefined || stops[0] === undefined) {
    throw new Error("waystone: empty stop table");
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a !== undefined && b !== undefined && h >= a.hour && h < b.hour) {
      return { a: a.value, b: b.value, t: (h - a.hour) / (b.hour - a.hour) };
    }
  }
  // Past the final stop: wrap around to the first (the table's midnight end is its midnight start).
  const span = HOURS_IN_DAY - last.hour + stops[0].hour;
  return { a: last.value, b: stops[0].value, t: span === 0 ? 0 : (h - last.hour) / span };
}

// ─── The SKY stop table — the continuous time axis ────────────────────────────────────────────────
// Deliberate GOLDEN windows at ~5-7h and ~17-19h: those stops reach for `--color-primary` (the ember), which
// nothing between 8h and 16h does — that contrast IS the dawn/dusk differentiation, and the test asserts it.
const SKY_STOPS: readonly { readonly hour: number; readonly value: WaystoneSky }[] = [
  {
    hour: 0,
    value: { from: "color-mix(in oklab, var(--color-track-2) 16%, var(--color-background))", to: "var(--color-background)", cy: "22%" },
  },
  {
    hour: 4,
    value: {
      from: "color-mix(in oklab, var(--color-track-2) 24%, var(--color-background))",
      to: "color-mix(in oklab, var(--color-track-2) 6%, var(--color-background))",
      cy: "28%",
    },
  },
  {
    hour: 5.5,
    value: {
      from: "color-mix(in oklab, var(--color-primary) 45%, var(--color-track-4))",
      to: "color-mix(in oklab, var(--color-track-2) 18%, var(--color-background))",
      cy: "80%",
    },
  },
  {
    hour: 7,
    value: {
      from: "color-mix(in oklab, var(--color-primary) 40%, var(--color-track-3))",
      to: "color-mix(in oklab, var(--color-track-2) 14%, var(--color-background))",
      cy: "68%",
    },
  },
  {
    hour: 9,
    value: {
      from: "color-mix(in oklab, var(--color-track-3) 52%, var(--color-background))",
      to: "color-mix(in oklab, var(--color-track-2) 26%, var(--color-background))",
      cy: "52%",
    },
  },
  {
    hour: 12,
    value: {
      from: "color-mix(in oklab, var(--color-track-3) 72%, var(--color-background))",
      to: "color-mix(in oklab, var(--color-track-3) 34%, var(--color-background))",
      cy: "26%",
    },
  },
  {
    hour: 15,
    value: {
      from: "color-mix(in oklab, var(--color-track-3) 60%, var(--color-background))",
      to: "color-mix(in oklab, var(--color-track-3) 28%, var(--color-background))",
      cy: "36%",
    },
  },
  {
    hour: 17,
    value: {
      from: "color-mix(in oklab, var(--color-primary) 55%, var(--color-track-3))",
      to: "color-mix(in oklab, var(--color-track-4) 20%, var(--color-background))",
      cy: "74%",
    },
  },
  {
    hour: 18.5,
    value: {
      from: "color-mix(in oklab, var(--color-primary) 62%, var(--color-track-4))",
      to: "color-mix(in oklab, var(--color-track-4) 22%, var(--color-background))",
      cy: "84%",
    },
  },
  {
    hour: 20,
    value: {
      from: "color-mix(in oklab, var(--color-track-4) 40%, var(--color-track-2))",
      to: "color-mix(in oklab, var(--color-track-4) 14%, var(--color-background))",
      cy: "58%",
    },
  },
  {
    hour: 22,
    value: {
      from: "color-mix(in oklab, var(--color-track-2) 30%, var(--color-background))",
      to: "color-mix(in oklab, var(--color-track-2) 10%, var(--color-background))",
      cy: "32%",
    },
  },
];

/** The sky at an exact hour — the two bracketing stops, blended. Exactly ON a stop returns that stop's recipe
 *  untouched (no wrapper mix, no reformatted `cy` — the authored palette is what paints). */
export function waystoneSkyAt(hour: number): WaystoneSky {
  const { a, b, t } = bracket(SKY_STOPS, hour);
  if (t <= 0) {
    return a;
  }
  if (t >= 1) {
    return b;
  }
  return {
    from: mixColor(a.from, b.from, t),
    to: mixColor(a.to, b.to, t),
    cy: `${(Number.parseFloat(a.cy) + (Number.parseFloat(b.cy) - Number.parseFloat(a.cy)) * t).toFixed(MIX_PRECISION)}%`,
  };
}

/** The stop table, exported so the test can pin each stop's hour + tokens (the palette IS the design). */
export const WAYSTONE_SKY_STOPS = SKY_STOPS;

// ─── The celestial arc — the clock a cold viewer reads ────────────────────────────────────────────
const SUNRISE = 5;
const SUNSET = 19;
const DAY_SPAN = SUNSET - SUNRISE;
const NIGHT_SPAN = HOURS_IN_DAY - DAY_SPAN;
const ARC_LEFT = 22;
const ARC_WIDTH = 52;
const ARC_BASE_Y = 54;
const ARC_RISE = 28;
const BODY_R_LOW = 6.4;
const BODY_R_SHRINK = 0.9;

const SUN_LOW = "color-mix(in oklab, var(--color-primary) 82%, var(--color-track-3))";
const SUN_HIGH = "color-mix(in oklab, var(--color-track-3) 45%, var(--color-foreground))";
const MOON_LOW = "color-mix(in oklab, var(--color-foreground) 60%, var(--color-track-4))";
const MOON_HIGH = "color-mix(in oklab, var(--color-foreground) 88%, var(--color-track-2))";

/** The sun (05:00-19:00) or the moon (19:00-05:00) at its exact point on the arc: rises left, peaks overhead
 *  at the middle of its watch, sets right. Continuous in the hour, so ANY advance slides it visibly. */
export function waystoneCelestialAt(hour: number): WaystoneCelestial {
  const h = ((hour % HOURS_IN_DAY) + HOURS_IN_DAY) % HOURS_IN_DAY;
  const isDay = h >= SUNRISE && h < SUNSET;
  const u = isDay ? (h - SUNRISE) / DAY_SPAN : (((h - SUNSET + HOURS_IN_DAY) % HOURS_IN_DAY) % HOURS_IN_DAY) / NIGHT_SPAN;
  const altitude = Math.sin(Math.PI * u);
  return {
    body: isDay ? "sun" : "moon",
    x: ARC_LEFT + ARC_WIDTH * u,
    y: ARC_BASE_Y - ARC_RISE * altitude,
    r: BODY_R_LOW - BODY_R_SHRINK * altitude,
    fill: isDay ? mixColor(SUN_LOW, SUN_HIGH, altitude) : mixColor(MOON_LOW, MOON_HIGH, altitude),
    altitude,
  };
}

// ─── The star ramp — lit through the night, out through the day ───────────────────────────────────
const STAR_STOPS: readonly { readonly hour: number; readonly value: number }[] = [
  { hour: 0, value: 1 },
  { hour: 4, value: 1 },
  { hour: 5.5, value: 0.5 },
  { hour: 7, value: 0.08 },
  { hour: 8, value: 0 },
  { hour: 16, value: 0 },
  { hour: 17.5, value: 0.12 },
  { hour: 19, value: 0.45 },
  { hour: 20.5, value: 0.8 },
  { hour: 22, value: 1 },
];

/** Star-field opacity at an exact hour (0 in daylight) — the darkness ramp, transitioned in the component. */
export function waystoneStarOpacityAt(hour: number): number {
  const { a, b, t } = bracket(STAR_STOPS, hour);
  return Number.parseFloat((a + (b - a) * t).toFixed(2));
}

// ─── The eight weathers (the DISCRETE axis) ───────────────────────────────────────────────────────
const WEATHER_RECIPES: Readonly<Record<WaystoneWeather, WaystoneWeatherRecipe>> = {
  clear: {
    overlay: "none",
    clouds: { count: 1, opacity: 0.22, drift: "slow", tone: "light" },
    particles: null,
    bands: null,
    lightning: false,
    wash: null,
    celestialOpacity: 1,
  },
  cloudy: {
    overlay: "clouds",
    clouds: { count: 4, opacity: 0.62, drift: "mid", tone: "light" },
    particles: null,
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-muted) 70%, var(--color-track-2))", opacity: 0.22 },
    celestialOpacity: 0.55,
  },
  rain: {
    overlay: "rain",
    clouds: { count: 3, opacity: 0.5, drift: "mid", tone: "dark" },
    particles: { kind: "rain", columns: 4, pitch: 12, speed: "fast", slant: 2.5, length: 6, sway: false },
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-track-6) 55%, var(--color-track-2))", opacity: 0.3 },
    celestialOpacity: 0.3,
  },
  storm: {
    overlay: "storm",
    clouds: { count: 4, opacity: 0.72, drift: "fast", tone: "dark" },
    particles: { kind: "rain", columns: 6, pitch: 10, speed: "fast", slant: 4.5, length: 7, sway: false },
    bands: null,
    lightning: true,
    wash: { fill: "color-mix(in oklab, var(--color-track-2) 60%, var(--color-background))", opacity: 0.48 },
    celestialOpacity: 0.15,
  },
  snow: {
    overlay: "snow",
    clouds: { count: 3, opacity: 0.45, drift: "slow", tone: "light" },
    particles: { kind: "snow", columns: 5, pitch: 16, speed: "slow", slant: 0, length: 0, sway: true },
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-foreground) 60%, var(--color-track-2))", opacity: 0.2 },
    celestialOpacity: 0.5,
  },
  fog: {
    overlay: "fog",
    clouds: { count: 2, opacity: 0.3, drift: "slow", tone: "light" },
    particles: null,
    bands: { kind: "fog", breathe: true },
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-foreground) 45%, var(--color-muted))", opacity: 0.34 },
    celestialOpacity: 0.25,
  },
  wind: {
    overlay: "wind",
    clouds: { count: 3, opacity: 0.4, drift: "fast", tone: "light" },
    particles: null,
    bands: { kind: "wind", breathe: false },
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-track-6) 40%, var(--color-muted))", opacity: 0.14 },
    celestialOpacity: 0.85,
  },
  ash: {
    overlay: "ash",
    clouds: { count: 3, opacity: 0.45, drift: "mid", tone: "dark" },
    particles: { kind: "ash", columns: 6, pitch: 10, speed: "mid", slant: 1, length: 0, sway: true },
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-primary) 35%, var(--color-track-4))", opacity: 0.26 },
    celestialOpacity: 0.35,
  },
};

/** The air-layer recipe for a weather (`null` ⇒ clear). TOTAL by construction — an exhaustive Record over the
 *  union, so a new weather member fails tsc here rather than painting a silent default. */
export function waystoneWeatherRecipe(weather: WaystoneWeather | null): WaystoneWeatherRecipe {
  return WEATHER_RECIPES[weather ?? "clear"];
}

/** Resolve the full stack for an exact hour and a weather: the continuous backdrop + the discrete air layers. */
export function resolveWaystoneTreatment(hour: number, weather: WaystoneWeather | null): WaystoneTreatment {
  return {
    ...waystoneWeatherRecipe(weather),
    sky: waystoneSkyAt(hour),
    celestial: waystoneCelestialAt(hour),
    starOpacity: waystoneStarOpacityAt(hour),
  };
}

// ─── The dial ring's label arcs (the DISCRETE time layer) ─────────────────────────────────────────
// These mirror the contract's nearest-representative-hour inversion of TIME_OF_DAY_HOURS (dawn 6 · morning 9 ·
// afternoon 14 · evening 18 · night 21 · midnight 0, ties to the earlier label), so the arc the marker sits in
// is the phase the band's TEXT names. `night` runs to the end of the dial — the non-wrapping nearest rule keeps
// hour 23 in `night`, and midnight owns only 0-2.

/** One dial segment: the label band it belongs to and the hour span it covers (24h dial, noon at the top). */
export interface WaystonePhaseSpan {
  readonly phase: WaystonePhase;
  readonly from: number;
  readonly to: number;
}

export const WAYSTONE_PHASE_SPANS: readonly WaystonePhaseSpan[] = [
  { phase: "midnight", from: 0, to: 3 },
  { phase: "dawn", from: 3, to: 7.5 },
  { phase: "morning", from: 7.5, to: 11.5 },
  { phase: "afternoon", from: 11.5, to: 16.5 },
  { phase: "evening", from: 16.5, to: 19.5 },
  { phase: "night", from: 19.5, to: 24 },
];

/** The label band whose dial segment contains this hour — drives which arc is LIT (the marker always sits on
 *  the lit arc, so the ring reads "we are here, in this named part of the day"). */
export function waystonePhaseAtHour(hour: number): WaystonePhase {
  const span = WAYSTONE_PHASE_SPANS.find((s) => hour >= s.from && hour < s.to);
  return span?.phase ?? "midnight";
}
