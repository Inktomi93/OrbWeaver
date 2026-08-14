// The POINTER seam — the only part of the weave that reads input (weave-lab-upgrades.md §1/§2/§5).
// Split from web-weave.tsx under the component-size-ui cap, and a real boundary besides: this is the
// adapter that turns "a cursor crossed the host box" into physics (a ringing strand, a web-wide
// shiver) and into a disturbance the weaver answers. Everything downstream of it is pure.
//
// It owns the mutable input state — the live plucks per strand, the decaying shiver, the last hit —
// because that state exists ONLY while a host is interactive, and a non-interactive weave never
// constructs one (its plucks map is null and the render's per-strand lookup short-circuits).

import type { WeavePoint, WeaveStrand, WovenWeb } from "./web-weave-geometry.ts";
import type { WeavePluck } from "./web-weave-physics.ts";
import { decayShiver, findStrandHit, PLUCK_LIFE_MS, PLUCK_MAX_PER_STRAND, raiseShiver } from "./web-weave-physics.ts";
import type { PreyState } from "./web-weave-prey.ts";
import { disturbPrey } from "./web-weave-prey.ts";

/** Pluck strengths: brushing past vs pressing on the silk (px of transverse displacement). */
const PLUCK_AMP_BRUSH = 4.5;
const PLUCK_AMP_PRESS = 10;
/** How near the cursor must pass a strand to ring it, and how far a DRAG must travel to ring again. */
const PLUCK_HIT_RADIUS_PX = 10.5;
const PLUCK_RETRIGGER_PX = 18;

export interface WeaveTouchInput {
  /** The host box — the element that receives the pointer and defines the coordinate origin. */
  readonly host: HTMLElement;
  /** The current web (rebuilt on resize, so it is read through a getter, never captured). */
  readonly getWeb: () => WovenWeb | null;
  /** Is the web listening right now? (Not while she is still building it; never in reduced motion.) */
  readonly accepts: (now: number) => boolean;
  /** Her prey machine, or null when she is hidden (`spider={false}`) or off. */
  readonly prey: PreyState | null;
}

export interface WeaveTouch {
  /** Live rings per strand — handed straight to the painters. */
  readonly plucks: ReadonlyMap<WeaveStrand, readonly WeavePluck[]>;
  /** Start/stop listening. */
  readonly attach: () => void;
  readonly detach: () => void;
  /** Advance one frame: decay the shiver, drop dead rings. Reports what the frame needs to know. */
  readonly step: (now: number, dt: number) => { shiver: number; ringing: boolean };
}

export function createWeaveTouch({ host, getWeb, accepts, prey }: WeaveTouchInput): WeaveTouch {
  const plucks = new Map<WeaveStrand, WeavePluck[]>();
  let shiver = 0;
  let lastHit: WeavePoint | null = null;

  const ring = (strand: WeaveStrand, s0: number, now: number, amp: number): void => {
    const live = plucks.get(strand) ?? [];
    live.push({ s0, t0: now, amp });
    if (live.length > PLUCK_MAX_PER_STRAND) {
      live.shift();
    }
    plucks.set(strand, live);
    shiver = raiseShiver(shiver);
  };

  const touch = (event: PointerEvent, amp: number): void => {
    const now = performance.now();
    const web = getWeb();
    if (web === null || !accepts(now)) {
      return;
    }
    const box = host.getBoundingClientRect();
    const at = { x: event.clientX - box.left, y: event.clientY - box.top };
    // Throttle a DRAG: one ring per re-trigger distance, or a sweep lays down a continuous smear.
    const smear = lastHit !== null && amp < PLUCK_AMP_PRESS && Math.hypot(at.x - lastHit.x, at.y - lastHit.y) < PLUCK_RETRIGGER_PX;
    const hit = smear ? null : findStrandHit(web.strands, at, PLUCK_HIT_RADIUS_PX);
    if (hit === null) {
      return;
    }
    ring(hit.strand, hit.s0, now, amp);
    lastHit = at;
    if (prey !== null) {
      disturbPrey(prey, hit.point, web.hub, now);
    }
  };

  const onMove = (event: PointerEvent): void => touch(event, PLUCK_AMP_BRUSH);
  const onDown = (event: PointerEvent): void => touch(event, PLUCK_AMP_PRESS);
  const onLeave = (): void => {
    lastHit = null;
  };

  return {
    plucks,
    attach: (): void => {
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerdown", onDown);
      host.addEventListener("pointerleave", onLeave);
    },
    detach: (): void => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerleave", onLeave);
    },
    step: (now: number, dt: number): { shiver: number; ringing: boolean } => {
      shiver = decayShiver(shiver, dt);
      let ringing = false;
      for (const [strand, list] of plucks) {
        const live = list.filter((pluck) => now - pluck.t0 <= PLUCK_LIFE_MS);
        if (live.length === 0) {
          plucks.delete(strand);
        } else {
          ringing = true;
          if (live.length !== list.length) {
            plucks.set(strand, live);
          }
        }
      }
      return { shiver, ringing };
    },
  };
}
