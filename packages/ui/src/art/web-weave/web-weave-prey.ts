// PREY RESPONSE — what the weaver does when something hits her web (weave-lab-upgrades.md §2).
//
// A five-state machine, and the order is the whole point:
//
//   rest ──disturbance──▶ alert ──170ms──▶ sprint ──arrived──▶ inspect ──inspectMs──▶ return ──▶ rest
//
// She FREEZES first. A real orb-weaver reads the vibration before she moves, and skipping that beat
// is what makes a chasing cursor-follower look like a video-game sprite instead of an animal. Then
// she scurries — in bursts, not at a constant crawl — palpates what she found with her front legs,
// and walks home at a fraction of the sprint speed.
//
// Pure and deterministic: every transition is a function of (state, event, now, dt). Vitest drives it
// with a synthetic list of disturbances; nothing here reads a clock, a pointer or the DOM.

import type { CharacterPreset, SpiderPose } from "./web-weave-character.ts";
import { HEAD_DOWN } from "./web-weave-character.ts";
import type { WeavePoint } from "./web-weave-geometry.ts";
import { wrapToPi } from "./web-weave-math.ts";

/** The machine's five states — internal; callers read `PreyState["mode"]` if they need it. */
const PREY_MODES = ["rest", "alert", "sprint", "inspect", "return"] as const;
type PreyMode = (typeof PREY_MODES)[number];

/** The freeze: she reads the vibration before she commits (ms). */
const ALERT_MS = 170;
/** Her own doorstep — a touch this close to the hub is her, not prey (px). */
const HUB_DEADZONE_PX = 24;
/** Close enough to count as arrived (px). */
const ARRIVE_PX = 5;
/** The scurry: speed pulses rather than a constant glide. */
const BURST_FLOOR = 0.55;
const BURST_GAIN = 0.85;
const BURST_HZ = 0.012;
/** The walk home is unhurried compared with the pounce. */
const RETURN_SPEED_FRAC = 0.45;
/** Turn rates: onto the target when alert, into the run while moving, back to head-down at rest. */
const ALERT_TURN_RATE = 0.3;
const RUN_TURN_RATE = 0.35;
const REST_TURN_RATE = 0.1;
/** Her resting bob (shared spelling with the non-interactive rest pose). */
const REST_BOB_PX = 0.9;
const REST_BOB_HZ = 0.0009;

/** The machine's mutable state — one per mounted web, owned by the component, stepped per frame. */
export interface PreyState {
  mode: PreyMode;
  x: number;
  y: number;
  angle: number;
  /** Wall-clock ms at which the current timed mode ends (alert, inspect). */
  until: number;
  target: WeavePoint | null;
  /** False until the first frame has placed her at the hub. */
  placed: boolean;
}

export function createPreyState(): PreyState {
  return { mode: "rest", x: 0, y: 0, angle: HEAD_DOWN, until: 0, target: null, placed: false };
}

/** Something touched the web at `at`. Ignored on her own doorstep — she does not chase her own feet. */
export function disturbPrey(state: PreyState, at: WeavePoint, hub: WeavePoint, now: number): void {
  if (Math.hypot(at.x - hub.x, at.y - hub.y) < HUB_DEADZONE_PX) {
    return;
  }
  state.target = at;
  // A hit lands while she is already sprinting? Keep running — re-freezing mid-pounce reads as a stutter.
  if (state.mode === "rest" || state.mode === "inspect" || state.mode === "return") {
    state.mode = "alert";
    state.until = now + ALERT_MS;
  }
}

/** Turn a fraction of the way toward a bearing (shortest arc). */
function face(state: PreyState, to: WeavePoint, rate: number): void {
  state.angle += wrapToPi(Math.atan2(to.y - state.y, to.x - state.x) - state.angle) * rate;
}

/** Step toward a point at `speed` px/ms, in bursts. True once she is there. */
function stepToward(state: PreyState, to: WeavePoint, speed: number, clock: { now: number; dt: number }): boolean {
  const { now, dt } = clock;
  const distance = Math.hypot(to.x - state.x, to.y - state.y);
  if (distance < ARRIVE_PX) {
    return true;
  }
  const burst = BURST_FLOOR + BURST_GAIN * Math.abs(Math.sin(now * BURST_HZ));
  const travel = Math.min(distance, speed * burst * dt);
  state.x += ((to.x - state.x) / distance) * travel;
  state.y += ((to.y - state.y) / distance) * travel;
  face(state, to, RUN_TURN_RATE);
  return false;
}

export interface PreyStepInput {
  readonly hub: WeavePoint;
  readonly now: number;
  /** Frame delta (ms) — she moves in px/ms, so a long frame moves her further, not faster. */
  readonly dt: number;
  readonly character: CharacterPreset;
  /** Reduced motion: no bob. */
  readonly still: boolean;
}

/** Her pose right now, from the state the step just left behind. */
function poseOf(state: PreyState, over: { moving?: boolean; sprinting?: boolean; tap?: number; bob?: number }): SpiderPose {
  return {
    x: state.x,
    y: state.y + (over.bob ?? 0),
    angle: state.angle,
    moving: over.moving ?? false,
    sprinting: over.sprinting ?? false,
    tap: over.tap ?? 0,
  };
}

/** The chase half: alert → sprint → inspect → return. Null when she is simply resting. */
function chasePose(state: PreyState, { hub, now, dt, character }: PreyStepInput): SpiderPose | null {
  const clock = { now, dt };
  const target = state.target;
  if (state.mode === "alert" && target !== null) {
    face(state, target, ALERT_TURN_RATE);
    if (now >= state.until) {
      state.mode = "sprint";
    }
    return poseOf(state, {});
  }
  if (state.mode === "sprint" && target !== null) {
    if (!stepToward(state, target, character.sprint, clock)) {
      return poseOf(state, { moving: true, sprinting: true });
    }
    state.mode = "inspect";
    state.until = now + character.inspectMs;
    return poseOf(state, { tap: 1 });
  }
  if (state.mode === "inspect") {
    if (now >= state.until) {
      state.mode = "return";
    }
    return poseOf(state, { tap: 1 });
  }
  if (state.mode === "return") {
    if (stepToward(state, hub, character.sprint * RETURN_SPEED_FRAC, clock)) {
      state.mode = "rest";
      state.target = null;
      return poseOf(state, {});
    }
    return poseOf(state, { moving: true });
  }
  return null;
}

/** Advance the machine one frame and report her pose. */
export function preyPose(state: PreyState, input: PreyStepInput): SpiderPose {
  const { hub, now, still } = input;
  if (!state.placed) {
    state.x = hub.x;
    state.y = hub.y;
    state.placed = true;
  }
  const chasing = chasePose(state, input);
  if (chasing !== null) {
    return chasing;
  }
  // Rest: at the hub, settling back to head-down, breathing.
  state.x = hub.x;
  state.y = hub.y;
  state.angle += wrapToPi(HEAD_DOWN - state.angle) * REST_TURN_RATE;
  return poseOf(state, { bob: still ? 0 : Math.sin(now * REST_BOB_HZ) * REST_BOB_PX });
}
