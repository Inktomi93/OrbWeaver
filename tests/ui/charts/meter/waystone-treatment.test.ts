// The Waystone's time × weather matrix (RV-10). The owner bar: a full variety of time-of-day and weather
// treatments, no combination falling through to a generic default — built as a CONTINUOUS time axis (the sky
// interpolates across an hour-keyed stop table; the sun/moon walks a computed arc) crossed with EIGHT discrete
// weather layer recipes. So this pins:
//   • the palette-stop TABLE — each stop's hour + its tokens (the palette is the design), monotonic + wrapping;
//   • the INTERPOLATION at representative hours — 6h golden, 12h day, 18h golden, 22h dark, plus the property
//     that every hour differs from its neighbour (the "every hour looks subtly different" claim);
//   • the CELESTIAL arc — sun by day, moon by night, rising left → peaking overhead → setting right, wrapping
//     across midnight;
//   • the eight WEATHER recipes — each layer slot present, each weather distinct on multiple axes;
//   • the dial's discrete label bands still matching the contract's nearest-TIME_OF_DAY_HOURS rule (the ring
//     names what the band's TEXT names).
import type { WaystoneParticleLayer, WaystonePhase, WaystoneWeather } from "@orb/ui/meter";
import {
  resolveWaystoneTreatment,
  WAYSTONE_PHASE_SPANS,
  WAYSTONE_PHASES,
  WAYSTONE_SKY_STOPS,
  WAYSTONE_WEATHERS,
  waystoneCelestialAt,
  waystonePhaseAtHour,
  waystoneSkyAt,
  waystoneStarOpacityAt,
  waystoneWeatherRecipe,
} from "@orb/ui/meter";
import { expect, test } from "../../../support/fixtures";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Every color the matrix emits must be a token or a `color-mix` over tokens (D71). */
const TOKEN_COLOR_RE = /^(var\(--|color-mix\(in oklab,)/u;
/** An interpolated sky nests one mix over two token recipes — the tell that it blended, not snapped. */
const NESTED_MIX_RE = /^color-mix\(in oklab, color-mix\(/u;
const WASH_MIX_RE = /^color-mix\(in oklab,/u;
const BODY_RE = /^(sun|moon)$/u;

/** The particle layer of a weather that must HAVE one — throws (rather than optional-chaining) so a recipe
 *  that silently lost its particles fails loudly instead of comparing `undefined`s. */
function particlesOf(weather: WaystoneWeather): WaystoneParticleLayer {
  const particles = waystoneWeatherRecipe(weather).particles;
  if (particles === null) {
    throw new Error(`${weather} should carry a particle layer`);
  }
  return particles;
}

// ── The palette stop table ──────────────────────────────────────────────────────────────────────
test("the sky stop table is a valid 24h ramp: ascending hours, in range, every color a token or a token mix", () => {
  expect(WAYSTONE_SKY_STOPS.length).toBeGreaterThan(6);
  let previous = -1;
  for (const stop of WAYSTONE_SKY_STOPS) {
    expect(stop.hour, `stop ${stop.hour} out of order`).toBeGreaterThan(previous);
    expect(stop.hour).toBeLessThan(24);
    previous = stop.hour;
    for (const color of [stop.value.from, stop.value.to]) {
      expect(color, `stop ${stop.hour} emitted a raw color literal`).toMatch(TOKEN_COLOR_RE);
    }
    expect(Number.parseFloat(stop.value.cy)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(stop.value.cy)).toBeLessThanOrEqual(100);
  }
  // The table starts at midnight so the wrap-around segment (last stop → 0h) is the deep-night ramp.
  expect(WAYSTONE_SKY_STOPS[0]?.hour).toBe(0);
});

test("the GOLDEN windows are real: ~5-7h and ~17-19h reach for the ember token, the middle of the day never does", () => {
  // This is how dawn/dusk differentiation ships WITHOUT a `dusk` write-vocabulary member (owner ruling): the
  // golden hours are the only daylight skies tinted with --color-primary.
  for (const hour of [5.5, 6, 7, 17, 18, 18.5]) {
    expect(waystoneSkyAt(hour).from, `hour ${hour} should glow`).toContain("var(--color-primary)");
  }
  for (const hour of [9, 10, 12, 14, 15]) {
    expect(waystoneSkyAt(hour).from, `hour ${hour} should NOT glow`).not.toContain("var(--color-primary)");
  }
  // Midday sits high (a dome), the golden hours sit low (light at the horizon) — the other golden-hour tell.
  expect(Number.parseFloat(waystoneSkyAt(12).cy)).toBeLessThan(40);
  expect(Number.parseFloat(waystoneSkyAt(6).cy)).toBeGreaterThan(60);
  expect(Number.parseFloat(waystoneSkyAt(18).cy)).toBeGreaterThan(60);
  // Deep night is the darkest recipe: the blue track over the raw background, no ember, no gold.
  expect(waystoneSkyAt(22).from).toContain("var(--color-track-2)");
  expect(waystoneSkyAt(22).from).not.toContain("var(--color-primary)");
});

test("the sky INTERPOLATES: an hour between two stops blends both, and every half-hour of the day differs", () => {
  // Exactly on a stop = that stop's recipe, untouched (no pointless wrapper mix).
  expect(waystoneSkyAt(12)).toEqual(WAYSTONE_SKY_STOPS.find((s) => s.hour === 12)?.value);
  // Between stops = a nested color-mix over BOTH neighbours — the browser blends it in oklab, so the
  // interpolated sky is still fully theme-reactive (no resolved RGB anywhere).
  const between = waystoneSkyAt(10.5);
  expect(between.from).toMatch(NESTED_MIX_RE);
  expect(between.from).toContain("var(--color-track-3)");
  // Every hour looks subtly different — no two adjacent half-hours resolve to the same sky.
  const seen = new Set<string>();
  for (let h = 0; h < 24; h += 0.5) {
    seen.add(JSON.stringify(waystoneSkyAt(h)));
  }
  expect(seen.size).toBe(48);
  // …and the axis WRAPS: 23:30 is a blend toward midnight, not a fallback.
  expect(waystoneSkyAt(23.5).from).toContain("color-mix");
  expect(waystoneSkyAt(24)).toEqual(waystoneSkyAt(0));
});

// ── The celestial arc — the clock a cold viewer reads ───────────────────────────────────────────
test("the sun holds the sky 05:00-19:00 and the moon holds the rest — the handover is the day's shape", () => {
  expect(waystoneCelestialAt(5).body).toBe("sun");
  expect(waystoneCelestialAt(12).body).toBe("sun");
  expect(waystoneCelestialAt(18.9).body).toBe("sun");
  expect(waystoneCelestialAt(19).body).toBe("moon");
  expect(waystoneCelestialAt(0).body).toBe("moon");
  expect(waystoneCelestialAt(4.9).body).toBe("moon");
});

test("both bodies walk a real arc: rising left, peaking overhead mid-watch, setting right (wrapping midnight)", () => {
  // The sun's x is strictly increasing across its watch, and its altitude peaks at solar noon.
  const daytime = [5, 7, 9, 12, 15, 17, 18.9];
  for (let i = 1; i < daytime.length; i++) {
    const previous = waystoneCelestialAt(daytime[i - 1] ?? 0);
    const current = waystoneCelestialAt(daytime[i] ?? 0);
    expect(current.x, `sun should move right from ${daytime[i - 1]} to ${daytime[i]}`).toBeGreaterThan(previous.x);
  }
  expect(waystoneCelestialAt(12).altitude).toBeGreaterThan(0.99);
  expect(waystoneCelestialAt(12).y).toBeLessThan(waystoneCelestialAt(6).y);
  expect(waystoneCelestialAt(6).y).toBeLessThan(60);
  // A low body is bigger and warmer (the horizon illusion); a high one is small and pale.
  expect(waystoneCelestialAt(6).r).toBeGreaterThan(waystoneCelestialAt(12).r);
  expect(waystoneCelestialAt(6).fill).toContain("var(--color-primary)");
  expect(waystoneCelestialAt(12).fill).not.toContain("var(--color-primary)");
  // The moon's watch wraps midnight: it rises at 19:00 on the left and peaks around 00:00.
  expect(waystoneCelestialAt(20).x).toBeLessThan(waystoneCelestialAt(0).x);
  expect(waystoneCelestialAt(0).x).toBeLessThan(waystoneCelestialAt(3).x);
  expect(waystoneCelestialAt(0).altitude).toBeGreaterThan(0.99);
  // Every color it emits stays a token recipe (D71 — the interpolated tint included).
  for (const hour of HOURS) {
    expect(waystoneCelestialAt(hour).fill).toMatch(TOKEN_COLOR_RE);
  }
});

test("the star ramp is lit through the night, dark through the day, and continuous across both edges", () => {
  expect(waystoneStarOpacityAt(0)).toBe(1);
  expect(waystoneStarOpacityAt(2)).toBe(1);
  expect(waystoneStarOpacityAt(12)).toBe(0);
  expect(waystoneStarOpacityAt(14)).toBe(0);
  // Fading out through dawn, fading back in through dusk — never a step.
  expect(waystoneStarOpacityAt(5.5)).toBeLessThan(waystoneStarOpacityAt(4));
  expect(waystoneStarOpacityAt(7)).toBeLessThan(waystoneStarOpacityAt(5.5));
  expect(waystoneStarOpacityAt(19)).toBeGreaterThan(waystoneStarOpacityAt(17.5));
  expect(waystoneStarOpacityAt(21)).toBeGreaterThan(waystoneStarOpacityAt(19));
  for (const hour of HOURS) {
    expect(waystoneStarOpacityAt(hour)).toBeGreaterThanOrEqual(0);
    expect(waystoneStarOpacityAt(hour)).toBeLessThanOrEqual(1);
  }
});

// ── The discrete weather axis ───────────────────────────────────────────────────────────────────
test("EXHAUSTIVE: all eight weather recipes carry every layer slot, and no two are the same stack", () => {
  const seen = new Map<string, string>();
  for (const weather of WAYSTONE_WEATHERS) {
    const recipe = waystoneWeatherRecipe(weather);
    // Every weather has a cloud deck and an overlay identity — a missing layer is the silent-default failure
    // mode this table exists to make impossible.
    expect(recipe.clouds.count, `${weather} has no cloud deck`).toBeGreaterThan(0);
    expect(recipe.overlay, `${weather} has no overlay identity`).not.toBe(undefined);
    const sig = JSON.stringify(recipe);
    expect(seen.get(sig), `${weather} paints the same stack as ${seen.get(sig)}`).toBeUndefined();
    seen.set(sig, weather);
  }
  expect(seen.size).toBe(WAYSTONE_WEATHERS.length);
  // Three INDEPENDENT signals per weather (deck · veil · overlay), so a 64px stone still reads "storm" vs
  // "rain" when individual drops are sub-pixel.
  expect(new Set(WAYSTONE_WEATHERS.map((w) => waystoneWeatherRecipe(w).celestialOpacity)).size).toBe(WAYSTONE_WEATHERS.length);
  expect(new Set(WAYSTONE_WEATHERS.map((w) => JSON.stringify(waystoneWeatherRecipe(w).clouds))).size).toBe(WAYSTONE_WEATHERS.length);
  // `clear` is a real treatment (an unveiled sky), never a fallthrough.
  expect(waystoneWeatherRecipe("clear").overlay).toBe("none");
  expect(waystoneWeatherRecipe("clear").wash).toBeNull();
  expect(waystoneWeatherRecipe("clear").particles).toBeNull();
  expect(waystoneWeatherRecipe(null)).toEqual(waystoneWeatherRecipe("clear"));
});

test("the storm is the loudest cell on every air axis; the particle layers are animatable by construction", () => {
  const storm = waystoneWeatherRecipe("storm");
  const rain = waystoneWeatherRecipe("rain");
  expect(storm.clouds.drift).toBe("fast");
  expect(storm.clouds.tone).toBe("dark");
  expect(storm.lightning).toBe(true);
  expect(rain.lightning).toBe(false);
  expect(storm.celestialOpacity).toBeLessThan(rain.celestialOpacity);
  expect(particlesOf("storm").columns).toBeGreaterThan(particlesOf("rain").columns);
  expect(particlesOf("storm").slant).toBeGreaterThan(particlesOf("rain").slant);
  for (const weather of WAYSTONE_WEATHERS) {
    const particles = waystoneWeatherRecipe(weather).particles;
    if (particles === null) {
      continue;
    }
    // The fall keyframe translates by exactly one pitch — a zero pitch would freeze the loop.
    expect(particles.pitch, `${weather} pitch`).toBeGreaterThan(0);
    expect(particles.columns, `${weather} columns`).toBeGreaterThan(0);
    // Rain draws streaks (a length + a slant); motes have neither.
    expect(particles.kind === "rain" ? particles.length > 0 : particles.length === 0).toBe(true);
  }
  expect(particlesOf("snow").sway).toBe(true);
  expect(particlesOf("snow").speed).toBe("slow");
  expect(particlesOf("rain").speed).toBe("fast");
  // The enveloping bands are the OTHER geometry family — fog breathes, wind gusts.
  expect(waystoneWeatherRecipe("fog").bands).toEqual({ kind: "fog", breathe: true });
  expect(waystoneWeatherRecipe("wind").bands).toEqual({ kind: "wind", breathe: false });
  expect(waystoneWeatherRecipe("rain").bands).toBeNull();
  // Every wash that exists is a token recipe.
  const washFills = WAYSTONE_WEATHERS.map((w) => waystoneWeatherRecipe(w).wash).filter((wash) => wash !== null);
  expect(washFills.length).toBeGreaterThan(0);
  expect(washFills.every((wash) => WASH_MIX_RE.test(wash.fill))).toBe(true);
});

test("the composed treatment is the two axes joined: any hour × any weather is a complete, distinct stack", () => {
  const seen = new Set<string>();
  for (const hour of HOURS) {
    for (const weather of WAYSTONE_WEATHERS) {
      const t = resolveWaystoneTreatment(hour, weather);
      expect(t.sky.from).toMatch(TOKEN_COLOR_RE);
      expect(t.celestial.body).toMatch(BODY_RE);
      expect(t.overlay).toBe(waystoneWeatherRecipe(weather).overlay);
      seen.add(JSON.stringify(t));
    }
  }
  expect(seen.size).toBe(HOURS.length * WAYSTONE_WEATHERS.length);
  expect(resolveWaystoneTreatment(21, null)).toEqual(resolveWaystoneTreatment(21, "clear"));
});

// ── The dial's discrete label bands ─────────────────────────────────────────────────────────────
test("the dial's hour buckets match the contract's nearest-TIME_OF_DAY_HOURS label for every hour of the day", () => {
  // TIME_OF_DAY_HOURS = dawn 6 · morning 9 · afternoon 14 · evening 18 · night 21 · midnight 0, resolved by
  // NON-WRAPPING |rep - hour| with ties to the earlier label (contracts/rpg/ambient + the reminder's inverse).
  // Hour 23 is therefore `night`, not `midnight` — the lit arc must follow the label, not intuition.
  const expected: readonly WaystonePhase[] = [
    "midnight",
    "midnight",
    "midnight",
    "dawn",
    "dawn",
    "dawn",
    "dawn",
    "dawn",
    "morning",
    "morning",
    "morning",
    "morning",
    "afternoon",
    "afternoon",
    "afternoon",
    "afternoon",
    "afternoon",
    "evening",
    "evening",
    "evening",
    "night",
    "night",
    "night",
    "night",
  ];
  expect(HOURS.map((hour) => waystonePhaseAtHour(hour))).toEqual([...expected]);
});

test("the dial's phase spans tile the whole 24h ring exactly once (no gap, no overlap, one arc per label)", () => {
  let cursor = 0;
  for (const span of WAYSTONE_PHASE_SPANS) {
    expect(span.from).toBe(cursor);
    expect(span.to).toBeGreaterThan(span.from);
    cursor = span.to;
  }
  expect(cursor).toBe(24);
  expect(new Set(WAYSTONE_PHASE_SPANS.map((s) => s.phase)).size).toBe(WAYSTONE_PHASES.length);
});
