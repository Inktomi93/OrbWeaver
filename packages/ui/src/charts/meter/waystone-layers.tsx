// The Waystone's LAYER components (charts/meter/waystone.tsx — RV-10): the independently animated pieces of
// the living clock — the dial's label arcs, the sun/moon on its arc, the star field, the cloud deck, the
// falling particles, the sky wash + lightning, and the enveloping fog/wind bands. Split out of the component
// file so the stone stays under the §13.7 primitive size cap; each layer is decorative SVG (the whole
// composite is `aria-hidden` — the band's TEXT carries every datum).
//
// ONE ANIMATION PER ELEMENT: the CSS `animation` shorthand is not additive, so an enter-fade and a loop never
// share a class list — they ride separate nested groups (stacking them silently drops the loop; CT-caught).
import type { CSSProperties, ReactElement } from "react";
import { cn } from "#lib";
import {
  ARC_DIM,
  ARC_DIM_OPACITY,
  ARC_LIT,
  ASH_DOT_R,
  ASH_FILL,
  arcPath,
  BOLT_STROKE,
  CLOUD_DARK,
  CLOUD_DRIFT_CLASS,
  CLOUD_LIGHT,
  CLOUD_SLOT_PATHS,
  CLOUD_SLOTS,
  COORD_PRECISION,
  FALL_SPEED_CLASS,
  FLASH_FILL,
  FOG_STROKE,
  GLOW_ALTITUDE_GAIN,
  GLOW_FLOOR,
  GLOW_R,
  latticeCells,
  MOON_GLINT,
  MOON_GLINT_R,
  MOON_GLINT_X,
  MOON_GLINT_Y,
  PARTICLE_OPACITY,
  RAIN_STROKE,
  RING_W,
  SKY_WH,
  SKY_XY,
  SNOW_DOT_R,
  SNOW_FILL,
  STAR_FILL,
  STAR_POSITIONS,
  WIND_STROKE,
} from "./waystone-geometry";
import type { WaystoneBandLayer, WaystoneCelestial, WaystoneCloudLayer, WaystoneParticleLayer, WaystonePhase, WaystoneTreatment } from "./waystone-treatment";
import { WAYSTONE_PHASE_SPANS } from "./waystone-treatment";

/** Layer 5 — the falling particles. Rain draws slanted streaks, snow/ash draw motes (snow adds the lateral
 *  sway on an inner group, so the two axes compose without a bespoke keyframe per weather). */
function ParticleLayer({ layer }: { readonly layer: WaystoneParticleLayer }): ReactElement {
  const cells = latticeCells(layer);
  // The keyframe translates by `--orb-ws-pitch`, so one class serves every lattice spacing (the pitch is DATA).
  const style = { "--orb-ws-pitch": `${layer.pitch}px` } as CSSProperties;
  const motes =
    layer.kind === "rain" ? (
      <g stroke={RAIN_STROKE} strokeWidth="1.1" strokeLinecap="round">
        {cells.map((cell) => (
          <line key={`${cell.x}-${cell.y}`} x1={cell.x} y1={cell.y} x2={cell.x - layer.slant} y2={cell.y + layer.length} />
        ))}
      </g>
    ) : (
      <g fill={layer.kind === "snow" ? SNOW_FILL : ASH_FILL}>
        {cells.map((cell) => (
          <circle key={`${cell.x}-${cell.y}`} cx={cell.x} cy={cell.y} r={layer.kind === "snow" ? SNOW_DOT_R : ASH_DOT_R} />
        ))}
      </g>
    );
  // ONE animation per element: the `animation` shorthand is not additive, so the enter fade and the fall loop
  // live on SEPARATE nested groups (stacking them on one class list silently drops the fall — CT-caught).
  return (
    <g className="orb-ws-enter" data-slot="waystone-precip-enter">
      <g className={FALL_SPEED_CLASS[layer.speed]} style={style} opacity={PARTICLE_OPACITY} data-slot="waystone-precip" data-particles={layer.kind}>
        <g className={layer.sway ? "orb-ws-driftx" : undefined}>{motes}</g>
      </g>
    </g>
  );
}

/** Layer 4 — the cloud deck. Every slot is always mounted; `count` lights the first N by OPACITY so a weather
 *  change fades the deck rather than popping puffs in and out. */
function CloudLayer({ layer }: { readonly layer: WaystoneCloudLayer }): ReactElement {
  return (
    <g className={cn("orb-ws-transit", CLOUD_DRIFT_CLASS[layer.drift])} data-slot="waystone-clouds" data-cloud-count={layer.count} data-cloud-tone={layer.tone}>
      {CLOUD_SLOT_PATHS.slice(0, CLOUD_SLOTS).map((d, index) => (
        <path
          key={d}
          d={d}
          className="orb-ws-transit"
          fill={layer.tone === "dark" ? CLOUD_DARK : CLOUD_LIGHT}
          opacity={index < layer.count ? layer.opacity : 0}
        />
      ))}
    </g>
  );
}

/** Layer 7b — the enveloping bands: fog banks (slow drift + an opacity breath) or wind gusts (a fast sweep).
 *  Drawn IN FRONT of the horizon silhouette — this weather surrounds the place rather than falling on it. */
export function BandLayer({ layer }: { readonly layer: WaystoneBandLayer }): ReactElement {
  // One animation per element (see ParticleLayer): the enter fade wraps the drifting group, never shares it.
  if (layer.kind === "wind") {
    return (
      // TWO gust groups half a cycle apart: a single sweep spends most of its loop faded out, which reads as
      // "no wind" on any still frame — offset copies keep at least one gust on screen at all times.
      <g className="orb-ws-enter" data-slot="waystone-bands-enter">
        <g stroke={WIND_STROKE} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.8" className="orb-ws-gust" data-slot="waystone-wind">
          <path d="M 22 36 h 20 a 4 4 0 1 0 -4 -4" />
          <path d="M 30 47 h 26 a 3.5 3.5 0 1 1 -3.5 3.5" />
        </g>
        <g
          stroke={WIND_STROKE}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
          className="orb-ws-gust orb-ws-gust-b"
          data-slot="waystone-wind-b"
        >
          <path d="M 26 30 h 14 a 3 3 0 1 1 3 3" />
          <path d="M 24 53 h 22 a 3.5 3.5 0 1 0 -3.5 -3.5" />
        </g>
      </g>
    );
  }
  return (
    <g className="orb-ws-enter" data-slot="waystone-bands-enter">
      <g className="orb-ws-sway-slow" data-slot="waystone-fog">
        <g stroke={FOG_STROKE} strokeWidth="3.4" strokeLinecap="round" opacity="0.9" className={layer.breathe ? "orb-ws-breathe" : undefined}>
          <line x1="26" y1="38" x2="58" y2="38" />
          <line x1="36" y1="46" x2="70" y2="46" />
          <line x1="24" y1="54" x2="54" y2="54" />
          <line x1="38" y1="62" x2="68" y2="62" />
        </g>
      </g>
    </g>
  );
}

/** LAYER 0 — the 24h dial: the six label arcs (the one we are IN lit) over the neutral track. */
export function DialArcs({ litPhase }: { readonly litPhase: WaystonePhase }): ReactElement {
  return (
    <>
      {WAYSTONE_PHASE_SPANS.map((span) => (
        <path
          key={`${span.phase}-${span.from}`}
          d={arcPath(span.from, span.to)}
          className="orb-ws-transit"
          stroke={span.phase === litPhase ? ARC_LIT[span.phase] : ARC_DIM}
          strokeWidth={RING_W}
          fill="none"
          strokeLinecap="butt"
          opacity={span.phase === litPhase ? 1 : ARC_DIM_OPACITY}
          data-slot="waystone-arc"
          data-arc-phase={span.phase}
          data-lit={span.phase === litPhase}
        />
      ))}
    </>
  );
}

/** LAYER 2 — the sun or moon, drawn at the origin and TRANSLATED to its computed point on the arc, so ANY
 *  hour change slides it along the sky over the transit duration. Low = bigger, warmer, dimmer-glowing; high =
 *  small, pale and bright (the altitude is continuous in the hour). */
function CelestialBody({ body, veil, maskId }: { readonly body: WaystoneCelestial; readonly veil: number; readonly maskId: string }): ReactElement {
  const glow = GLOW_FLOOR + body.altitude * GLOW_ALTITUDE_GAIN;
  return (
    <g
      className="orb-ws-transit-move"
      style={{ translate: `${body.x.toFixed(COORD_PRECISION)}px ${body.y.toFixed(COORD_PRECISION)}px` }}
      opacity={veil}
      data-slot="waystone-celestial"
      data-body={body.body}
    >
      {/* The breath keyframe reads `--orb-ws-glow` as its FLOOR (an `opacity` attribute would lose to the
          animation); reduced motion drops the animation and the same value lands as the resting one. */}
      <circle
        cx={0}
        cy={0}
        r={body.r * GLOW_R}
        fill={body.fill}
        style={{ "--orb-ws-glow": glow.toFixed(COORD_PRECISION), opacity: glow } as CSSProperties}
        className="orb-ws-glow"
      />
      {body.body === "sun" ? (
        <circle cx={0} cy={0} r={body.r} fill={body.fill} />
      ) : (
        <>
          <circle cx={0} cy={0} r={body.r} fill={body.fill} mask={`url(#${maskId})`} />
          <circle cx={-body.r * MOON_GLINT_X} cy={body.r * MOON_GLINT_Y} r={body.r * MOON_GLINT_R} fill={MOON_GLINT} />
        </>
      )}
    </g>
  );
}

/** LAYERS 2-6 — everything the hour and the weather paint between the sky gradient and the horizon. */
export function SkyLayers({ treatment, maskId }: { readonly treatment: WaystoneTreatment; readonly maskId: string }): ReactElement {
  return (
    <>
      {/* LAYER 3 — the stars: individually staggered twinkles under one transitioned group opacity. */}
      <g fill={STAR_FILL} className="orb-ws-transit" opacity={treatment.starOpacity} data-slot="waystone-stars">
        {STAR_POSITIONS.map((star) => (
          <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r={star.r} className="orb-ws-star" />
        ))}
      </g>
      <CelestialBody body={treatment.celestial} veil={treatment.celestialOpacity} maskId={maskId} />
      {/* LAYER 4 — the cloud deck. */}
      <CloudLayer layer={treatment.clouds} />
      {/* LAYER 6a — the weather's full-sky wash, under the particles it tints. */}
      <rect
        x={SKY_XY}
        y={SKY_XY}
        width={SKY_WH}
        height={SKY_WH}
        className="orb-ws-transit"
        fill={treatment.wash === null ? "transparent" : treatment.wash.fill}
        opacity={treatment.wash === null ? 0 : treatment.wash.opacity}
        data-slot="waystone-wash"
      />
      {/* LAYER 5 — the falling particles (keyed so a weather change replays the fade-in). */}
      {treatment.particles === null ? null : <ParticleLayer key={treatment.particles.kind} layer={treatment.particles} />}
      {/* LAYER 6b — the storm: an occasional sky flash (removed under reduced motion) + the drawn bolt. */}
      {treatment.lightning ? (
        <g data-slot="waystone-storm">
          <rect x={SKY_XY} y={SKY_XY} width={SKY_WH} height={SKY_WH} fill={FLASH_FILL} opacity="0" className="orb-ws-strike" data-slot="waystone-flash" />
          <path
            d="M 47 30 L 41 43 h 5.5 l -4.5 13"
            stroke={BOLT_STROKE}
            strokeWidth="1.7"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="orb-ws-enter"
            data-slot="waystone-bolt"
          />
        </g>
      ) : null}
    </>
  );
}
