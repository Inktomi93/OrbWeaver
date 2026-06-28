// infra/providers/resolve-chat — THE funnel: `(UserIntent × ModelCapability) → resolved wire knobs`.
// This is the ONE home for the gating/guard policy both sealed chat runners consume, so the assertions
// here are the canonical record of that policy: the on/off decision, the effort-levels clamp, the
// Opus-4.8 adaptive/budget guard (Esoteric §8), the display gate, the per-knob sampling capability-gate,
// and the output-cap clamp — each with its human-readable `warning`. Pure + deterministic (no clock).
//
// resolve-chat.ts is a top-level providers file (not a barrel), so — like local-light/model-cache — the
// test reaches it by relative path rather than the `@orb/server/*` barrel exports map.

import type { ModelCapability } from "@orb/contracts/connection";
import { describe, expect, test } from "vitest";
import { resolveChat } from "../../../../packages/server/src/infra/providers/resolve-chat.ts";

// A fully-capable model: every sampling range present, every flag on, an effort ladder. Tests narrow it
// down (drop a range / flip a flag / switch the reasoning mode) to exercise each gate in isolation.
const FULL: ModelCapability = {
  reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] },
  sampling: {
    temperature: { min: 0, max: 2 },
    topP: { min: 0, max: 1 },
    topK: { min: 0, max: 100 },
    frequencyPenalty: { min: -2, max: 2 },
    presencePenalty: { min: -2, max: 2 },
    repetitionPenalty: { min: 0, max: 2 },
    seed: true,
    logitBias: true,
    stop: true,
  },
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
};

function withReasoning(reasoning: ModelCapability["reasoning"]): ModelCapability {
  return { ...FULL, reasoning };
}
function withSampling(sampling: ModelCapability["sampling"]): ModelCapability {
  return { ...FULL, sampling };
}

describe("resolveChat — the reasoning on/off decision", () => {
  test("OFF when the user named no effort (undefined is not 'asked')", () => {
    const out = resolveChat({}, FULL);
    expect(out.reasoning).toEqual({ mode: "effort", enabled: false });
  });

  test("OFF when the user picked effort:'none' explicitly", () => {
    expect(resolveChat({ effort: "none" }, FULL).reasoning.enabled).toBe(false);
  });

  test("OFF when the model cannot reason, even with a real effort", () => {
    const cap = withReasoning({ mode: "none", enabled: false });
    expect(resolveChat({ effort: "high" }, cap).reasoning.enabled).toBe(false);
  });

  test("ON when the model can reason AND the user named a real effort", () => {
    expect(resolveChat({ effort: "high" }, FULL).reasoning.enabled).toBe(true);
  });
});

describe("resolveChat — effort clamped to the model's effortLevels", () => {
  test("a listed effort rides through", () => {
    expect(resolveChat({ effort: "high" }, FULL).reasoning.effort).toBe("high");
  });

  test("an UNLISTED effort is dropped + warned (but reasoning stays ON)", () => {
    // FULL lists low/medium/high — `minimal` isn't among them.
    const out = resolveChat({ effort: "minimal" }, FULL);
    expect(out.reasoning.enabled).toBe(true);
    expect(out.reasoning.effort).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "effort_dropped",
      message: 'effort "minimal" ignored: model lists low, medium, high',
    });
  });

  test("when the model lists NO levels, the effort passes through", () => {
    const cap = withReasoning({ mode: "effort", enabled: true });
    expect(resolveChat({ effort: "xhigh" }, cap).reasoning.effort).toBe("xhigh");
  });
});

describe("resolveChat — the Opus-4.8 adaptive/budget guard (Esoteric §8)", () => {
  test("adaptive DROPS an explicit budget + warns (sending it 400s the model); effort survives", () => {
    const cap = withReasoning({ mode: "adaptive", enabled: true, effortLevels: ["high"] });
    const out = resolveChat({ effort: "high", thinkingBudgetTokens: 4096 }, cap);
    expect(out.reasoning.mode).toBe("adaptive");
    expect(out.reasoning.budgetTokens).toBeUndefined();
    expect(out.reasoning.effort).toBe("high");
    expect(out.warnings.some((w) => w.code === "adaptive_budget_dropped")).toBe(true);
  });
});

describe("resolveChat — budget mode (clamp + default)", () => {
  const cap = withReasoning({
    mode: "budget",
    enabled: true,
    budgetRange: { min: 1024, max: 8192 },
  });

  test("clamps an over-range budget down to max", () => {
    expect(
      resolveChat({ effort: "high", thinkingBudgetTokens: 99_999 }, cap).reasoning.budgetTokens,
    ).toBe(8192);
  });

  test("clamps an under-range budget up to min", () => {
    expect(
      resolveChat({ effort: "high", thinkingBudgetTokens: 10 }, cap).reasoning.budgetTokens,
    ).toBe(1024);
  });

  test("defaults to the model's max budget when the user named no depth", () => {
    expect(resolveChat({ effort: "high" }, cap).reasoning.budgetTokens).toBe(8192);
  });

  test("budget mode never rides the effort dial (the wire XOR upstream)", () => {
    expect(resolveChat({ effort: "high" }, cap).reasoning.effort).toBeUndefined();
  });
});

describe("resolveChat — the Anthropic display gate", () => {
  test("a listed display mode is kept", () => {
    const cap = withReasoning({ mode: "effort", enabled: true, displayModes: ["summarized"] });
    expect(
      resolveChat({ effort: "high", thinkingDisplay: "summarized" }, cap).reasoning.display,
    ).toBe("summarized");
  });

  test("an unlisted display mode is dropped + warned", () => {
    const cap = withReasoning({ mode: "effort", enabled: true, displayModes: ["summarized"] });
    const out = resolveChat({ effort: "high", thinkingDisplay: "omitted" }, cap);
    expect(out.reasoning.display).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "display_dropped",
      message: 'thinkingDisplay "omitted" ignored: model does not support it',
    });
  });

  test("dropped when the model exposes no displayModes at all", () => {
    const out = resolveChat({ effort: "high", thinkingDisplay: "summarized" }, FULL);
    expect(out.reasoning.display).toBeUndefined();
    expect(out.warnings.some((w) => w.code === "display_dropped")).toBe(true);
  });
});

describe("resolveChat — sampling capability-gating", () => {
  test("numeric knobs are clamped to their ranges", () => {
    const cap = withSampling({ temperature: { min: 0, max: 1 }, topP: { min: 0.1, max: 0.9 } });
    const out = resolveChat({ temperature: 1.5, topP: 0.05 }, cap);
    expect(out.sampling.temperature).toBe(1);
    expect(out.sampling.topP).toBe(0.1);
  });

  test("a numeric knob the model omits is DROPPED + warned (no silent no-op)", () => {
    const out = resolveChat({ temperature: 0.7 }, withSampling({}));
    expect(out.sampling.temperature).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "sampling_knob_dropped",
      message: "temperature ignored: model does not expose a temperature range",
    });
  });

  test("boolean-gated knobs (seed/logitBias/stop) survive when the flag is set", () => {
    const out = resolveChat({ seed: 7, logitBias: { "1": 2 }, stop: ["END"] }, FULL);
    expect(out.sampling.seed).toBe(7);
    expect(out.sampling.logitBias).toEqual({ "1": 2 });
    expect(out.sampling.stop).toEqual(["END"]);
  });

  test("a boolean-gated knob the model does not support is DROPPED + warned", () => {
    const cap = withSampling({ seed: false });
    const out = resolveChat({ seed: 7 }, cap);
    expect(out.sampling.seed).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "sampling_knob_dropped",
      message: "seed ignored: model does not support seed",
    });
  });

  test("unset knobs produce no fields and no warnings", () => {
    const out = resolveChat({}, FULL);
    expect(out.sampling).toEqual({});
    expect(out.warnings).toEqual([]);
  });
});

describe("resolveChat — maxOutputTokens clamp", () => {
  test("clamped down to the model's output max", () => {
    expect(resolveChat({ maxOutputTokens: 999_999 }, FULL).maxOutputTokens).toBe(4096);
  });

  test("raised up to the model's output min", () => {
    const cap: ModelCapability = { ...FULL, output: { maxTokens: { min: 256, max: 4096 } } };
    expect(resolveChat({ maxOutputTokens: 50 }, cap).maxOutputTokens).toBe(256);
  });

  test("absent when the user named no cap", () => {
    expect(resolveChat({}, FULL).maxOutputTokens).toBeUndefined();
  });
});
