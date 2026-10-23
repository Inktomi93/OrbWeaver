import { expect, test } from "@orb/testkit/node";
import { WEAVE_CHARACTER_PRESETS } from "#ui/art/web-weave/web-weave-character.ts";
import type { WeaveStrand } from "#ui/art/web-weave/web-weave-geometry.ts";
import { buildWeb } from "#ui/art/web-weave/web-weave-geometry.ts";
import { createPreyState, disturbPrey, preyPose } from "#ui/art/web-weave/web-weave-prey.ts";

test("prey retargets a chase and returns to rest without replacing its mounted instance", () => {
  const state = createPreyState();
  const original = state;
  const hub = { x: 50, y: 50 };
  const initialTarget = { x: 150, y: 50 };
  const nextTarget = { x: 180, y: 80 };
  const input = { hub, still: true, character: WEAVE_CHARACTER_PRESETS.calm };
  preyPose(state, { ...input, now: 0, dt: 0 });
  disturbPrey(state, initialTarget, hub, 1);
  const alertEnds = state.until;
  preyPose(state, { ...input, now: alertEnds - 1, dt: 0 });
  expect(state).toMatchObject({ mode: "alert", target: initialTarget, x: hub.x, y: hub.y });
  preyPose(state, { ...input, now: alertEnds, dt: 0 });
  expect(state.mode).toBe("sprint");
  disturbPrey(state, nextTarget, hub, alertEnds + 1);
  expect(state).toMatchObject({ mode: "sprint", target: nextTarget, until: alertEnds });
  preyPose(state, { ...input, now: alertEnds + 2, dt: 1_000_000 });
  preyPose(state, { ...input, now: alertEnds + 3, dt: 0 });
  expect(state).toMatchObject({ mode: "inspect", target: nextTarget, x: nextTarget.x, y: nextTarget.y });
  const inspectionEnds = state.until;
  preyPose(state, { ...input, now: inspectionEnds, dt: 0 });
  expect(state.mode).toBe("return");
  preyPose(state, { ...input, now: inspectionEnds + 1, dt: 1_000_000 });
  preyPose(state, { ...input, now: inspectionEnds + 2, dt: 0 });
  expect(state).toMatchObject({ mode: "rest", target: null, x: hub.x, y: hub.y });
  expect(state).toBe(original);
});

test("built spirals retain per-point birth times while ordinary strands use their shared time window", () => {
  const web = buildWeb({ width: 640, height: 480, hub: { x: 0.5, y: 0.42 }, seed: 7 });
  expect(web.aux.vt).toBeDefined();
  expect(web.capture.vt).toBeDefined();
  const spirals = web.strands.filter(
    (strand): strand is Extract<WeaveStrand, { readonly kind: "aux" | "capture" }> => strand.kind === "aux" || strand.kind === "capture",
  );
  expect(spirals).toHaveLength(2);
  for (const strand of spirals) {
    expect(strand.vt.length).toBe(strand.pts.length);
    expect(strand.vt[0]).toBe(strand.t0);
    expect(strand.vt.at(-1)).toBe(strand.t1);
  }
  for (const strand of web.strands.filter((candidate) => candidate.kind !== "aux" && candidate.kind !== "capture")) {
    expect(strand.vt).toBeUndefined();
  }
});
