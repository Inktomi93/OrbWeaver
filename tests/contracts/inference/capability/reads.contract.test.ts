// contracts/inference/capability/reads — the message-handling ladder's reads: the strictness order, the
// floor clamp every turn runs, and the levels the preset knob may offer on a model. One home for the rank:
// SHAPE and the client's knob both read these, so a level added to `ROLE_HANDLING` moves both at once.

import type { RoleHandling } from "@orb/contracts/inference";
import {
  clampRoleHandling,
  completeSamplerOrder,
  GENERATION_FLOOR,
  isStricterRoleHandling,
  ROLE_HANDLING,
  roleHandlingFloorOf,
  SETTABLE_WINDOW_FLOOR,
  USER_ROLE_HANDLING,
  userRoleHandlingOptions,
  windowForPreset,
} from "@orb/contracts/inference";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("the strictness order is the tuple order", () => {
  test("slotted sits between merge and semi-strict", () => {
    expect(isStricterRoleHandling("slotted", "merge")).toBe(true);
    expect(isStricterRoleHandling("semi-strict", "slotted")).toBe(true);
    expect(isStricterRoleHandling("merge", "merge")).toBe(false);
  });
});

describe("clampRoleHandling — the stricter of the model floor and the preset knob", () => {
  test("every (floor, knob) pair resolves to the later of the two in ROLE_HANDLING", () => {
    for (const floor of ROLE_HANDLING) {
      for (const knob of ROLE_HANDLING) {
        const expected: RoleHandling = ROLE_HANDLING.indexOf(knob) > ROLE_HANDLING.indexOf(floor) ? knob : floor;
        expect(clampRoleHandling(floor, knob), `${floor} × ${knob}`).toBe(expected);
      }
    }
  });

  test("an unset knob runs the floor", () => {
    for (const floor of ROLE_HANDLING) {
      expect(clampRoleHandling(floor, undefined)).toBe(floor);
    }
  });

  test("an unmeasured model runs the fail-closed floor, whatever the knob asks", () => {
    expect(clampRoleHandling(roleHandlingFloorOf(GENERATION_FLOOR), "none")).toBe("strict");
    expect(clampRoleHandling(roleHandlingFloorOf({ ...GENERATION_FLOOR, turns: undefined }), undefined)).toBe("strict");
  });
});

describe("the preset knob offers only user levels at or above the model floor", () => {
  test("`slotted` is model-only: the knob never offers it", () => {
    expect(USER_ROLE_HANDLING).toStrictEqual(["none", "merge", "semi-strict", "strict"]);
  });

  test("a slotted floor offers semi-strict and strict; a none floor offers every user level", () => {
    expect(userRoleHandlingOptions("slotted")).toStrictEqual(["semi-strict", "strict"]);
    expect(userRoleHandlingOptions("none")).toStrictEqual(USER_ROLE_HANDLING);
    expect(userRoleHandlingOptions("strict")).toStrictEqual(["strict"]);
  });
});

describe("completeSamplerOrder — the order a server runs for a preset's (D295)", () => {
  const server = ["penalties", "topK", "topA", "typicalP", "topP", "temperature"] as const;

  test("the preset's orderable stages lead in its order; the server's others follow in the server's order", () => {
    expect(completeSamplerOrder(["temperature", "minP", "topK"], server)).toStrictEqual(["temperature", "topK", "penalties", "topA", "typicalP", "topP"]);
  });

  test("no preset order is the server's own default order", () => {
    expect(completeSamplerOrder(undefined, server)).toStrictEqual(server);
  });

  // llama.cpp appends adaptive-P after the chain whatever its place in `samplers` (common/sampling.cpp).
  test("a stage that picks the token runs last wherever the preset put it", () => {
    const llama = ["penalties", "dry", "topK", "topP", "temperature", "adaptiveP"] as const;
    expect(completeSamplerOrder(["adaptiveP", "temperature", "topK"], llama)).toStrictEqual(["temperature", "topK", "penalties", "dry", "topP", "adaptiveP"]);
  });
});

// Ollama's native route sends the window as `num_ctx`, so the preset's Max context is what the server runs.
describe("windowForPreset — a route whose window the request sets runs the preset's Max context", () => {
  const floor = { ...GENERATION_FLOOR, context: { window: 4096, windowEstimated: true, settable: { max: 32_768 } } };

  test("the preset's window is sent and budgeted, and is no longer an estimate", () => {
    expect(windowForPreset(floor, 16_384).context).toStrictEqual({ window: 16_384, settable: { max: 32_768 } });
  });

  test("a preset above the model's trained maximum runs at that maximum", () => {
    expect(windowForPreset(floor, 65_536).context.window).toBe(32_768);
  });

  // A typo such as 1 would otherwise become the server's whole window.
  test("a preset below the settable floor runs at the floor, and a trained maximum below the floor caps it", () => {
    expect(windowForPreset(floor, 1).context.window).toBe(SETTABLE_WINDOW_FLOOR);
    const tiny = { ...floor, context: { window: 1024, settable: { max: 1024 } } };
    expect(windowForPreset(tiny, 1).context.window).toBe(1024);
  });

  test("with no preset window the resolved one stands", () => {
    expect(windowForPreset(floor, undefined)).toBe(floor);
  });

  test("the preset beats a declared window: it is the per-chat knob for what this route sends", () => {
    const declared = { ...floor, context: { window: 8192, settable: { max: 32_768 } } };
    expect(windowForPreset(declared, 16_384).context.window).toBe(16_384);
  });

  test("a route the request cannot set keeps the server's window: the preset only lowers the fit", () => {
    const served = { ...GENERATION_FLOOR, context: { window: 4096, windowEstimated: true } };
    expect(windowForPreset(served, 16_384)).toBe(served);
  });
});
