// The prey response — the five-state machine, driven the way
// the loop drives it: a synthetic list of disturbances against a fixed frame clock, no pointer, no rAF.
//
// The behaviours that matter (and the ones a naive cursor-follower gets wrong):
//   • she FREEZES before she moves (the alert beat) — she does not track the cursor like a turret;
//   • she runs to WHERE IT LANDED, arrives, palpates, and goes home to the hub;
//   • she ignores a touch on her own doorstep;
//   • speed is in px/MS: a long frame moves her further, never faster;
//   • the whole run is deterministic — the same event list twice gives the same path.

import { buildWeb } from "@orb/ui/web-weave";
import { describe } from "vitest";
import type { SpiderPose } from "../../../../packages/ui/src/art/web-weave/web-weave-character.ts";
import { WEAVE_CHARACTER_PRESETS } from "../../../../packages/ui/src/art/web-weave/web-weave-character.ts";
import type { PreyState } from "../../../../packages/ui/src/art/web-weave/web-weave-prey.ts";
import { createPreyState, disturbPrey, preyPose } from "../../../../packages/ui/src/art/web-weave/web-weave-prey.ts";
import { expect, test } from "../../../support/fixtures.ts";

const BOX = { width: 1280, height: 800, hub: { x: 0.5, y: 0.42 }, seed: 7 } as const;
const CHARACTER = WEAVE_CHARACTER_PRESETS.full;
const FRAME_MS = 16;
/** The freeze the spec names (ms). */
const ALERT_MS = 170;
/** Her own doorstep — a touch inside this is ignored (px). */
const DEADZONE_PX = 24;

interface Frame {
  readonly now: number;
  readonly mode: PreyState["mode"];
  readonly pose: SpiderPose;
}

/** Run the machine for `frames` frames from `from`, disturbing it at the listed times. */
interface RunInput {
  readonly hub: { x: number; y: number };
  readonly frames: number;
  readonly from: number;
  readonly events?: readonly { at: number; point: { x: number; y: number } }[];
}

function run(state: PreyState, { hub, frames, from, events = [] }: RunInput): Frame[] {
  const out: Frame[] = [];
  for (let i = 0; i < frames; i++) {
    const now = from + i * FRAME_MS;
    for (const event of events) {
      if (event.at > now - FRAME_MS && event.at <= now) {
        disturbPrey(state, event.point, hub, now);
      }
    }
    out.push({ now, mode: state.mode, pose: preyPose(state, { hub, now, dt: FRAME_MS, character: CHARACTER, still: false }) });
  }
  return out;
}

describe("preyPose — the five-state response", () => {
  const web = buildWeb(BOX);
  const hub = web.hub;
  const target = { x: hub.x + 260, y: hub.y + 120 };

  test("rest → alert → sprint → inspect → return → rest, in that order", () => {
    const state = createPreyState();
    const frames = run(state, { hub, frames: 400, from: 1000, events: [{ at: 1016, point: target }] });
    const order: string[] = [];
    for (const frame of frames) {
      if (order.at(-1) !== frame.mode) {
        order.push(frame.mode);
      }
    }
    expect(order).toEqual(["rest", "alert", "sprint", "inspect", "return", "rest"]);
  });

  test("she FREEZES first — no ground is covered during the alert beat", () => {
    const state = createPreyState();
    const frames = run(state, { hub, frames: 40, from: 1000, events: [{ at: 1016, point: target }] });
    const alert = frames.filter((f) => f.mode === "alert");
    expect(alert.length).toBeGreaterThan(1);
    for (const frame of alert) {
      expect(Math.hypot(frame.pose.x - hub.x, frame.pose.y - hub.y)).toBeLessThan(1);
      expect(frame.pose.moving).toBe(false);
    }
    // …and the freeze lasts the beat, not a frame.
    const span = (alert.at(-1) as Frame).now - (alert[0] as Frame).now;
    expect(span).toBeGreaterThanOrEqual(ALERT_MS - 2 * FRAME_MS);
    // …while she TURNS to face it: the freeze is a read, not a stall.
    expect((alert.at(-1) as Frame).pose.angle).not.toBe((alert[0] as Frame).pose.angle);
  });

  test("she reaches what she is chasing, palpates it, and comes home", () => {
    const state = createPreyState();
    const frames = run(state, { hub, frames: 400, from: 1000, events: [{ at: 1016, point: target }] });
    const arrived = frames.find((f) => f.mode === "inspect") as Frame;
    expect(Math.hypot(arrived.pose.x - target.x, arrived.pose.y - target.y)).toBeLessThan(6);
    // Inspecting shows in the pose the painter reads (front legs tap), and she is NOT "moving".
    expect(arrived.pose.tap).toBe(1);
    expect(arrived.pose.moving).toBe(false);
    // Home again at the hub, head-down, settled.
    const last = frames.at(-1) as Frame;
    expect(last.mode).toBe("rest");
    expect(Math.hypot(last.pose.x - hub.x, last.pose.y - hub.y)).toBeLessThan(2);
    expect(last.pose.tap).toBe(0);
  });

  test("she runs FLAT OUT on the way there and strolls on the way back", () => {
    const state = createPreyState();
    const frames = run(state, { hub, frames: 400, from: 1000, events: [{ at: 1016, point: target }] });
    const speed = (mode: PreyState["mode"]): number => {
      const legs = frames.filter((f) => f.mode === mode);
      let far = 0;
      for (let i = 1; i < legs.length; i++) {
        far += Math.hypot((legs[i] as Frame).pose.x - (legs[i - 1] as Frame).pose.x, (legs[i] as Frame).pose.y - (legs[i - 1] as Frame).pose.y);
      }
      return far / Math.max(1, legs.length - 1);
    };
    expect(speed("sprint")).toBeGreaterThan(speed("return"));
    // The sprint reads as a sprint to the painter too.
    expect(frames.some((f) => f.pose.sprinting)).toBe(true);
  });

  test("a touch on her own doorstep is ignored — she does not chase her own feet", () => {
    const state = createPreyState();
    const onTheHub = { x: hub.x + DEADZONE_PX / 2, y: hub.y };
    const frames = run(state, { hub, frames: 30, from: 1000, events: [{ at: 1016, point: onTheHub }] });
    expect(frames.every((f) => f.mode === "rest")).toBe(true);
  });

  test("speed is px per MILLISECOND — a long frame covers more ground, at the same pace", () => {
    const hop = (dt: number): number => {
      const state = createPreyState();
      preyPose(state, { hub, now: 1000, dt, character: CHARACTER, still: false });
      disturbPrey(state, target, hub, 1000);
      // Past the alert beat, then one frame of running.
      preyPose(state, { hub, now: 1000 + ALERT_MS + 1, dt, character: CHARACTER, still: false });
      const before = { x: state.x, y: state.y };
      preyPose(state, { hub, now: 1000 + ALERT_MS + 1 + dt, character: CHARACTER, dt, still: false });
      return Math.hypot(state.x - before.x, state.y - before.y);
    };
    // Same burst phase would differ, so compare a long frame against a short one generously: the point
    // is that dt SCALES the step rather than being ignored.
    expect(hop(48)).toBeGreaterThan(hop(16));
  });

  test("the same event list twice gives the same path (no clock, no randomness)", () => {
    const events = [
      { at: 1016, point: target },
      { at: 4000, point: { x: hub.x - 300, y: hub.y - 90 } },
    ];
    const trace = (): string[] =>
      run(createPreyState(), { hub, frames: 500, from: 1000, events }).map(
        (f) => `${f.mode}:${f.pose.x.toFixed(4)},${f.pose.y.toFixed(4)},${f.pose.angle.toFixed(4)}`,
      );
    expect(trace()).toEqual(trace());
  });

  test("a fresh disturbance mid-inspect re-triggers the whole response", () => {
    const state = createPreyState();
    const second = { x: hub.x - 220, y: hub.y + 200 };
    const frames = run(state, {
      hub,
      frames: 400,
      from: 1000,
      events: [
        { at: 1016, point: target },
        { at: 2600, point: second },
      ],
    });
    // She ends up having visited BOTH — the second alert lands after the first inspect began.
    const alerts = frames.filter((f, i) => f.mode === "alert" && frames[i - 1]?.mode !== "alert");
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });
});
