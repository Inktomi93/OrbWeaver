// WHO THE WEAVER IS — her pose shape and her character presets.
//
// This module exists to be the FLOOR of the spider trio: the pose engine (web-weave-spider.ts), the
// prey machine (web-weave-prey.ts) and the painter (web-weave-spider-body.ts) all speak these types,
// and two of them call each other — homing the vocabulary here is what keeps that from being an
// import cycle.

/** Head-down at the hub — the posture a resting orb-weaver actually holds. */
export const HEAD_DOWN = Math.PI / 2;

export interface SpiderPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly moving: boolean;
  /** Running flat out — the painter swaps in the sprint gait. */
  readonly sprinting: boolean;
  /** 0..1 — inspecting: the front two legs palpate. */
  readonly tap: number;
}

/** One character's motion dial-set. */
export interface CharacterPreset {
  /** Forward-only speed pulses on a walk (0 = a constant glide). */
  readonly burst: number;
  readonly gaitHz: number;
  readonly gaitAmp: number;
  /** Fraction of the remaining turn taken per frame — she swings round, never snaps. */
  readonly turnRate: number;
  /** Sprint speed when answering a disturbance (px/ms). */
  readonly sprint: number;
  /** How long she palpates what she found (ms). */
  readonly inspectMs: number;
  /** Idle twitches at rest. */
  readonly twitch: boolean;
}

/** The weaver's character (weave-lab §3). `turnRate` is the SHIPPED 0.22, not the lab's 0.18 — the
 *  value the owner's "turbo" ruling tuned. */
export const CALM_CHARACTER: CharacterPreset = { burst: 0, gaitHz: 0.012, gaitAmp: 0.2, turnRate: 0.22, sprint: 0.16, inspectMs: 500, twitch: false };

/** Sprint overrides the character's gait — the legs blur regardless of who she is. */
export const SPRINT_GAIT = { gaitHz: 0.034, gaitAmp: 0.36 } as const;
/** Leg swing while she is still. */
export const REST_GAIT_AMP = 0.05;

/** Burst locomotion: a forward-only speed pulse over an eased walk. The derivative of
 *  `p − a·sin(4πp)/(4π)` is `1 − a·cos(4πp)`, which stays positive whenever a stays below 1 — so she surges and
 *  eases but never stalls or walks backwards. */
const BURST_CYCLES = 2;
const BURST_RADIANS = Math.PI * 2 * BURST_CYCLES;
export const burstEase = (p: number, amount: number): number => p - (amount * Math.sin(BURST_RADIANS * p)) / BURST_RADIANS;
