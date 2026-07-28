// Waystone — the rpg panel's SIGNATURE composite (panel-redesign DESIGN.md §2/§12): a 24-hour DIAL ring
// (the day's phases as fixed arcs — dawn ember → day gold → dusk ember-violet → night blue) around a SKY
// disc (time-of-day gradient + weather overlay + the horizon silhouette with one ember-lit gable — "a
// place, seen from its sky"; the MA-3 minimap promise). The ember MARKER sits at the current hour (noon
// top, midnight bottom) — the marker's ANGLE is the datum's shape, but the composite is entirely
// `aria-hidden` DECORATION (tracker-kit a11y model): the band's TEXT lines carry every datum, so the
// circle carries ZERO text. Homed in charts/meter (the magnitude-display family; inline data-viz svg is
// legal only in charts/**, §13.7) — the one new sibling family member beside RingGauge/CoinFigure.
//
// Nullable-honesty (§12.2.1): `hour: null` (ambient clock unset) ⇒ NO marker, NEUTRAL ring (all arcs at
// track-bg), a plain dim sky, no overlay — the signature element gets the same honesty as every meter.
// `weather: null` ⇒ no overlay layer (an unresolvable weather type renders NO overlay; the band text
// still names it — text is the datum, the sky just stays plain).
//
// Every color is a theme token or a `color-mix()` over tokens (the sanctioned tint idiom — zero raw
// literals, so any seed theme restyles the stone for free). The precipitation drift rides `animate-pulse`
// (the ONE ambient motion; the global reduced-motion floor REMOVES it outright).
import type { ReactElement } from "react";
import { useId } from "react";
import { cn } from "#lib";
import type { WaystonePhase, WaystoneWeather } from "./variants";
import { waystoneVariants } from "./variants";

/** The CLOSED weather-overlay vocabulary the sky disc can draw — the ONE importable union home lives in
 *  `variants.ts` (a component-free module, so the const can't be re-exported beside a component; the TYPE
 *  is). The consumer resolves its free-string weather onto this (the glyph-resolver seam); an unresolvable
 *  type maps to `null` = no overlay. */
export type { WaystoneWeather } from "./variants";

export interface WaystoneProps {
  /** Current hour 0–23 (fractional ok), noon at the top of the dial, midnight at the bottom.
   *  `null` = ambient clock unset: neutral ring, no marker, plain dim sky (§12.2.1). */
  hour: number | null;
  /** Minute 0–59 — refines the marker angle. @defaultValue 0 */
  minute?: number;
  /** The resolved weather overlay; `null` = no overlay layer. @defaultValue null */
  weather?: WaystoneWeather | null;
  /** sm = the mobile/floor 64px stone; md = the 76px band stone. @defaultValue "md" */
  size?: "sm" | "md";
  className?: string;
}

// ─── Geometry (viewBox units; mirrors the approved mock byte-for-byte) ───────────────────────────
const VIEW = 96;
const C = VIEW / 2;
const RING_R = 42;
const RING_W = 5.5;
const DISC_R = 35.5;
const CLIP_R = 34;
const MARKER_R = 3.4;
const MARKER_STROKE = 1.6;
const SKY_XY = 10;
const SKY_WH = 76;
const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
const DEG_FULL = 360;
const DEG_HALF = 180;

// ─── The tint recipes (tokens + color-mix ONLY — the §12.1.9 one-home rule for the stone) ────────
const ARC_DAWN = "color-mix(in oklab, var(--color-primary) 65%, var(--color-track-3))";
const ARC_DAY = "color-mix(in oklab, var(--color-track-3) 80%, var(--color-background))";
const ARC_DUSK = "color-mix(in oklab, var(--color-primary) 75%, var(--color-track-4))";
const ARC_NIGHT = "color-mix(in oklab, var(--color-track-2) 40%, var(--color-background))";
/** The horizon silhouette — a foreground-shifted sidebar tone (polarity-safe contrast, no raw black). */
const HORIZON_FILL = "color-mix(in oklab, var(--color-foreground) 25%, var(--color-sidebar))";
const GABLE_FILL = "color-mix(in oklab, var(--color-primary) 45%, var(--color-sidebar))";
const SUN_FILL = "color-mix(in oklab, var(--color-track-3) 85%, var(--color-foreground))";
const RAIN_STROKE = "color-mix(in oklab, var(--color-track-6) 80%, var(--color-foreground))";
const SNOW_FILL = "color-mix(in oklab, var(--color-foreground) 85%, transparent)";
const FOG_STROKE = "color-mix(in oklab, var(--color-foreground) 35%, transparent)";

/** Per-phase sky radial-gradient stops (the mock's four skies, token-mixed). */
const SKY_STOPS: Readonly<Record<WaystonePhase, { readonly from: string; readonly to: string; readonly cy: string }>> = {
  dawn: {
    from: "color-mix(in oklab, var(--color-primary) 42%, var(--color-background))",
    to: "color-mix(in oklab, var(--color-track-2) 16%, var(--color-background))",
    cy: "70%",
  },
  day: {
    from: "color-mix(in oklab, var(--color-track-3) 45%, var(--color-background))",
    to: "color-mix(in oklab, var(--color-track-3) 14%, var(--color-background))",
    cy: "30%",
  },
  dusk: {
    from: "color-mix(in oklab, var(--color-primary) 50%, var(--color-track-4))",
    to: "color-mix(in oklab, var(--color-track-4) 18%, var(--color-background))",
    cy: "70%",
  },
  night: {
    from: "color-mix(in oklab, var(--color-track-2) 26%, var(--color-background))",
    to: "color-mix(in oklab, var(--color-track-2) 8%, var(--color-background))",
    cy: "30%",
  },
};

/** The four FIXED phase arcs (dawn 5–7h · day 7–18h · dusk 18–20h · night 20–5h) — precomputed `d`
 *  strings from the approved mock (the arc segmentation is the day's real shape, not per-render math). */
const PHASE_ARCS: readonly { readonly d: string; readonly stroke: string }[] = [
  { d: "M 7.43 58.87 A 42 42 0 0 1 7.43 37.13", stroke: ARC_DAWN },
  { d: "M 7.43 37.13 A 42 42 0 0 1 90.00 48.00", stroke: ARC_DAY },
  { d: "M 90.00 48.00 A 42 42 0 0 1 84.37 69.00", stroke: ARC_DUSK },
  { d: "M 84.37 69.00 A 42 42 0 0 1 7.43 58.87", stroke: ARC_NIGHT },
];

const DAWN_START = 5;
const DAY_START = 7;
const DUSK_START = 18;
const NIGHT_START = 20;

/** Day phase from the hour (matches the arc segmentation above). */
function phaseOf(hour: number): WaystonePhase {
  if (hour >= DAWN_START && hour < DAY_START) {
    return "dawn";
  }
  if (hour >= DAY_START && hour < DUSK_START) {
    return "day";
  }
  if (hour >= DUSK_START && hour < NIGHT_START) {
    return "dusk";
  }
  return "night";
}

/** Marker position on the ring — noon top, midnight bottom, clockwise. */
function markerAt(hour: number, minute: number): { readonly x: number; readonly y: number } {
  const dayFraction = (hour + minute / MINUTES_IN_HOUR) / HOURS_IN_DAY;
  const theta = ((dayFraction * DEG_FULL + DEG_HALF) * Math.PI) / DEG_HALF;
  return { x: C + RING_R * Math.sin(theta), y: C - RING_R * Math.cos(theta) };
}

/** The star field (night/dawn skies) — fixed mock geometry. */
function Stars(): ReactElement {
  return (
    <g fill="var(--color-foreground)" opacity="0.7">
      <circle cx="38" cy="32" r="0.9" />
      <circle cx="56" cy="26" r="0.7" />
      <circle cx="62" cy="40" r="0.9" />
      <circle cx="45" cy="22" r="0.6" />
      <circle cx="31" cy="42" r="0.7" />
    </g>
  );
}

/** The weather overlay layer — rain lines · storm bolt · snow dots · fog bands (mock geometry). The
 *  precipitation drift is the panel's ONE ambient animation (`animate-pulse`; reduced-motion REMOVES it). */
function WeatherOverlay({ weather }: { readonly weather: WaystoneWeather }): ReactElement | null {
  if (weather === "clear") {
    return null;
  }
  if (weather === "rain") {
    return (
      <g stroke={RAIN_STROKE} strokeWidth="1.1" strokeLinecap="round" opacity="0.75" className="animate-pulse">
        <line x1="36" y1="36" x2="33" y2="43" />
        <line x1="46" y1="33" x2="43" y2="40" />
        <line x1="56" y1="37" x2="53" y2="44" />
        <line x1="50" y1="45" x2="47" y2="52" />
        <line x1="40" y1="48" x2="37" y2="55" />
      </g>
    );
  }
  if (weather === "storm") {
    return (
      <g>
        <g stroke={RAIN_STROKE} strokeWidth="1.1" strokeLinecap="round" opacity="0.7" className="animate-pulse">
          <line x1="36" y1="38" x2="33" y2="45" />
          <line x1="58" y1="38" x2="55" y2="45" />
        </g>
        <path d="M 47 32 L 42 43 h 5 l -4 11" stroke="var(--color-highlight)" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </g>
    );
  }
  if (weather === "snow") {
    return (
      <g fill={SNOW_FILL} opacity="0.85" className="animate-pulse">
        <circle cx="38" cy="36" r="1.2" />
        <circle cx="50" cy="31" r="1" />
        <circle cx="59" cy="39" r="1.2" />
        <circle cx="44" cy="46" r="1" />
        <circle cx="54" cy="50" r="1.1" />
      </g>
    );
  }
  return (
    <g stroke={FOG_STROKE} strokeWidth="2.6" strokeLinecap="round" opacity="0.7">
      <line x1="32" y1="40" x2="58" y2="40" />
      <line x1="38" y1="47" x2="66" y2="47" />
      <line x1="30" y1="54" x2="52" y2="54" />
    </g>
  );
}

/** The waystone — a pure-SVG decorative composite; pair it with the band's text lines (the datum). */
export function Waystone({ hour, minute = 0, weather = null, size = "md", className }: WaystoneProps): ReactElement {
  const gradientId = useId();
  const clipId = useId();
  const slots = waystoneVariants({ size });
  const phase = hour === null ? null : phaseOf(hour);
  const sky = phase === null ? null : SKY_STOPS[phase];
  const marker = hour === null ? null : markerAt(hour, minute);

  return (
    <svg aria-hidden={true} className={cn(slots.root(), className)} data-slot="waystone" viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <defs>
        {sky === null ? null : (
          <radialGradient id={gradientId} cx="50%" cy={sky.cy} r="85%">
            <stop offset="0%" stopColor={sky.from} />
            <stop offset="100%" stopColor={sky.to} />
          </radialGradient>
        )}
        <clipPath id={clipId}>
          <circle cx={C} cy={C} r={CLIP_R} />
        </clipPath>
      </defs>

      {/* The 24h dial ring: track + (clock set) the four phase arcs. */}
      <circle cx={C} cy={C} r={RING_R} className={slots.track()} stroke="currentColor" strokeWidth={RING_W} fill="none" />
      {phase === null
        ? null
        : PHASE_ARCS.map((arc) => <path key={arc.d} d={arc.d} stroke={arc.stroke} strokeWidth={RING_W} fill="none" strokeLinecap="butt" />)}

      {/* The sky disc: gradient sky (or the plain dim unset sky) + celestial layer + horizon + gable + weather. */}
      <circle cx={C} cy={C} r={DISC_R} fill="var(--color-sidebar)" />
      <g clipPath={`url(#${clipId})`}>
        {sky === null ? (
          <rect x={SKY_XY} y={SKY_XY} width={SKY_WH} height={SKY_WH} fill="var(--color-muted)" opacity="0.5" data-slot="waystone-sky-unset" />
        ) : (
          <rect x={SKY_XY} y={SKY_XY} width={SKY_WH} height={SKY_WH} fill={`url(#${gradientId})`} />
        )}
        {phase === "day" ? <circle cx="48" cy="32" r="6.5" fill={SUN_FILL} opacity="0.9" /> : null}
        {phase === "night" || phase === "dawn" ? <Stars /> : null}
        <path d="M 16 58 Q 30 50 42 56 T 80 55 L 80 82 L 16 82 Z" fill={HORIZON_FILL} opacity="0.85" />
        <path d="M 44 56 l 3 -6 3 6 Z" fill={GABLE_FILL} opacity="0.9" />
        {weather === null || phase === null ? null : <WeatherOverlay weather={weather} />}
      </g>
      <circle cx={C} cy={C} r={DISC_R} fill="none" stroke="var(--color-border)" strokeWidth="1" />

      {/* The ember hour marker — angle IS the time; absent when the clock is unset. */}
      {marker === null ? null : (
        <circle
          cx={marker.x}
          cy={marker.y}
          r={MARKER_R}
          fill="var(--color-primary)"
          stroke="var(--color-sidebar)"
          strokeWidth={MARKER_STROKE}
          data-slot="waystone-marker"
        />
      )}
    </svg>
  );
}
