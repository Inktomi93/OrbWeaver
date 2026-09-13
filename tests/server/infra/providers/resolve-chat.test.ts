// infra/providers/resolve-chat — THE funnel: `(UserIntent × ModelCapability) → resolved wire knobs`.
// This is the ONE home for the gating/guard policy both sealed chat runners consume, so the assertions
// here are the canonical record of that policy: the on/off decision, the effort-levels clamp, the
// Opus-4.8 adaptive/budget guard (Esoteric §8), the display gate, the per-knob sampling capability-gate,
// and the output-cap clamp — each with its human-readable `warning`. Pure + deterministic (no clock).
//
// resolve-chat.ts is a top-level providers file (not a barrel), so — like local-light/model-cache — the
// test reaches it by relative path rather than the `@orb/server/*` barrel exports map.

import type { ModelCapability } from "@orb/contracts/connection";
import { VERBOSITY_LEVELS } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import { describe } from "vitest";
import { resolveChat } from "../../../../packages/server/src/infra/providers/resolve-chat.ts";
import { expect, test } from "../../../support/fixtures.ts";

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

// #1440 — THE STRUCTURED HALF. `message` is operator prose and cannot cross to a user (the chat bus admits
// no unanchored free text), so these three fields are the ONLY way a notice can name the setting the provider
// refused and the value it used instead. They are produced HERE and nowhere else: the domain re-voices them,
// it never re-derives them.
describe("resolveChat — a warning names WHAT was dropped and to what (#1440)", () => {
  test("a capability-gated sampling knob names ITSELF, not just its class", () => {
    const out = resolveChat({ temperature: 0.9, topK: 40 }, withSampling({ topK: { min: 0, max: 100 } }));
    const dropped = out.warnings.filter((w) => w.code === "sampling_knob_dropped");
    expect(dropped.map((w) => w.knob)).toEqual(["temperature"]);
  });

  test("an unsupported FLAG knob names itself too (the resolveFlag arm)", () => {
    const out = resolveChat({ seed: 7 }, withSampling({ ...FULL.sampling, seed: false }));
    expect(out.warnings.map((w) => w.knob)).toEqual(["seed"]);
  });

  test("a budget on an effort-mode model is a THINKING-BUDGET drop, named as such", () => {
    const out = resolveChat({ effort: "low", thinkingBudgetTokens: 4096 }, FULL);
    const dropped = out.warnings.filter((w) => w.code === "sampling_knob_dropped");
    expect(dropped.map((w) => w.knob)).toEqual(["thinkingBudgetTokens"]);
  });

  test("the mandatory-reasoning clamp carries the effort that ACTUALLY ran", () => {
    const cap = withReasoning({ mode: "effort", enabled: true, mandatory: true, effortLevels: ["medium", "high"] });
    const out = resolveChat({}, cap);
    const clamp = out.warnings.find((w) => w.code === "reasoning_mandatory_clamp");
    expect(clamp?.appliedEffort).toBe("medium");
    expect(out.reasoning.effort).toBe("medium");
  });

  test("the budget clamp carries the budget that ACTUALLY ran", () => {
    const cap = withReasoning({ mode: "budget", enabled: true, budgetRange: { min: 128, max: 32_000 } });
    const out = resolveChat({ effort: "high", thinkingBudgetTokens: 4000, maxOutputTokens: 2048 }, cap);
    const clamp = out.warnings.find((w) => w.code === "reasoning_budget_clamped");
    expect(clamp?.appliedBudget).toBe(out.reasoning.budgetTokens);
    expect(clamp?.appliedBudget).toBe(1536);
  });

  test("a class that names itself carries NO detail — an absent field, never a fabricated one", () => {
    const out = resolveChat({ verbosity: "high" }, FULL);
    const dropped = out.warnings.find((w) => w.code === "verbosity_dropped");
    expect(dropped?.knob).toBeUndefined();
    expect(dropped?.appliedBudget).toBeUndefined();
    expect(dropped?.appliedEffort).toBeUndefined();
  });
});

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

describe("resolveChat — R0 reasoning: mandatory clamp + defaultEffort precedence", () => {
  const mandatory = withReasoning({ mode: "effort", enabled: true, effortLevels: ["high", "medium", "low"], mandatory: true });

  test("(c) effort:'none' on a mandatory model CLAMPS up to the lowest supported effort + visible warning", () => {
    const out = resolveChat({ effort: "none" }, mandatory);
    expect(out.reasoning.enabled).toBe(true); // clamped on, never a silent 400
    expect(out.reasoning.effort).toBe("low"); // lowest by canonical order (not array position)
    expect(out.warnings).toContainEqual({
      appliedEffort: "low",
      code: "reasoning_mandatory_clamp",
      message: 'reasoning is mandatory on this model: clamped effort "none" up to the lowest supported "low"',
    });
  });

  test("(c) NO effort on a mandatory model also clamps to the lowest", () => {
    expect(resolveChat({}, mandatory).reasoning.effort).toBe("low");
  });

  test("(c) a real effort on a mandatory model is untouched (no clamp, no warning)", () => {
    const out = resolveChat({ effort: "high" }, mandatory);
    expect(out.reasoning.effort).toBe("high");
    expect(out.warnings).toEqual([]);
  });

  test("(d) precedence: model defaultEffort fills the gap when the user picks neither effort nor quality", () => {
    const cap = withReasoning({ mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], defaultEffort: "low" });
    expect(resolveChat({}, cap).reasoning.effort).toBe("low"); // model default fills the gap
    expect(resolveChat({ effort: "high" }, cap).reasoning.effort).toBe("high"); // explicit user wins
    expect(resolveChat({ quality: "balanced" }, cap).reasoning.effort).toBe("medium"); // quality wins over model default
  });

  test("(d) defaultEnabled:false suppresses the defaultEffort fill (off until the user asks)", () => {
    const cap = withReasoning({ mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], defaultEffort: "medium", defaultEnabled: false });
    expect(resolveChat({}, cap).reasoning.enabled).toBe(false); // off-by-default honored
    expect(resolveChat({ effort: "high" }, cap).reasoning.effort).toBe("high"); // but an explicit ask still reasons
  });
});

describe("resolveChat — the quality dial → reasoning effort (Proposal 2)", () => {
  // A model that lists every quality-mapped level so the mapping rides through un-clamped here.
  const wide = withReasoning({
    mode: "effort",
    enabled: true,
    effortLevels: ["minimal", "medium", "high"],
  });

  test("quality:'deep' → effort:'high' (and reasoning ON)", () => {
    const out = resolveChat({ quality: "deep" }, wide);
    expect(out.reasoning.enabled).toBe(true);
    expect(out.reasoning.effort).toBe("high");
  });

  test("quality:'fast' → effort:'minimal'", () => {
    expect(resolveChat({ quality: "fast" }, wide).reasoning.effort).toBe("minimal");
  });

  test("quality:'balanced' → effort:'medium'", () => {
    expect(resolveChat({ quality: "balanced" }, wide).reasoning.effort).toBe("medium");
  });

  test("an EXPLICIT effort knob OVERRIDES quality (advanced reveal wins)", () => {
    // quality would map to 'minimal'; the explicit 'high' wins the precedence.
    const out = resolveChat({ quality: "fast", effort: "high" }, wide);
    expect(out.reasoning.effort).toBe("high");
  });

  test("quality on a NO-REASONING model contributes nothing (dropped, no crash)", () => {
    const cap = withReasoning({ mode: "none", enabled: false });
    const out = resolveChat({ quality: "deep" }, cap);
    expect(out.reasoning.enabled).toBe(false);
    expect(out.reasoning.effort).toBeUndefined();
  });

  test("a quality-derived effort the model can't honor is DROPPED with the existing warning", () => {
    // FULL lists low/medium/high — quality:'fast' maps to 'minimal', which isn't among them.
    const out = resolveChat({ quality: "fast" }, FULL);
    expect(out.reasoning.enabled).toBe(true);
    expect(out.reasoning.effort).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "effort_dropped",
      message: 'effort "minimal" ignored: model lists low, medium, high',
    });
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

  // #197 — the SAME drop on the other budget-less mode. Only `mode:"budget"` has a slot for the budget, but
  // until now only the ADAPTIVE arm said so: an effort-mode model swallowed a user's budget in total silence.
  // That gap went unnoticed while no effort-mode wire exposed a budget dial, and the local vLLM arm
  // (`mode:"effort"`, whose engine's token budget needs a `--reasoning-config` BOOT flag we do not emit) is
  // exactly that case. D41 no-silent-degrade: a drop is visible, or it is a bug.
  test("EFFORT mode drops an explicit budget + warns — it has no budget slot either", () => {
    const cap = withReasoning({ mode: "effort", enabled: true, effortLevels: ["low", "high"] });
    const out = resolveChat({ effort: "low", thinkingBudgetTokens: 4096 }, cap);
    expect(out.reasoning.budgetTokens).toBeUndefined();
    // …and the effort the user CAN have survives the other knob's drop.
    expect(out.reasoning.effort).toBe("low");
    expect(out.warnings.some((w) => w.code === "sampling_knob_dropped" && w.message.includes("reasoning budget ignored"))).toBe(true);
  });

  test("no budget, no warning — an effort-only intent is not a degrade", () => {
    const cap = withReasoning({ mode: "effort", enabled: true, effortLevels: ["low"] });
    expect(resolveChat({ effort: "low" }, cap).warnings).toEqual([]);
  });
});

describe("resolveChat — budget mode (clamp + default)", () => {
  const cap = withReasoning({
    mode: "budget",
    enabled: true,
    budgetRange: { min: 1024, max: 8192 },
  });

  test("clamps an over-range budget down to max", () => {
    expect(resolveChat({ effort: "high", thinkingBudgetTokens: 99_999 }, cap).reasoning.budgetTokens).toBe(8192);
  });

  test("clamps an under-range budget up to min", () => {
    expect(resolveChat({ effort: "high", thinkingBudgetTokens: 10 }, cap).reasoning.budgetTokens).toBe(1024);
  });

  test("defaults to the model's max budget when the user named no depth", () => {
    expect(resolveChat({ effort: "high" }, cap).reasoning.budgetTokens).toBe(8192);
  });

  test("budget mode never rides the effort dial (the wire XOR upstream)", () => {
    expect(resolveChat({ effort: "high" }, cap).reasoning.effort).toBeUndefined();
  });
});

describe("resolveChat — MA-5: budget clamped under maxOutputTokens (visible-output headroom)", () => {
  // A budget-mode model whose default budget (budgetRange.max) exceeds a tight user output cap — the
  // Anthropic/OR-responses reasoning-vs-output-cap starvation the funnel must guard.
  const cap = withReasoning({ mode: "budget", enabled: true, budgetRange: { min: 1024, max: 8192 } });

  test("the DEFAULT budget (range.max) is clamped to leave 512 tokens below the output cap + warns", () => {
    const out = resolveChat({ effort: "high", maxOutputTokens: 2000 }, cap);
    // default budget 8192 > (2000 - 512) → clamped to 1488, preserving the visible/structured payload.
    expect(out.reasoning.budgetTokens).toBe(1488);
    expect(out.warnings.some((w) => w.code === "reasoning_budget_clamped")).toBe(true);
  });

  test("an EXPLICIT over-cap budget is clamped down too (the explicit output cap wins)", () => {
    const out = resolveChat({ effort: "high", maxOutputTokens: 3000, thinkingBudgetTokens: 8000 }, cap);
    expect(out.reasoning.budgetTokens).toBe(3000 - 512);
    expect(out.warnings.some((w) => w.code === "reasoning_budget_clamped")).toBe(true);
  });

  test("no clamp (and no warning) when the cap leaves ample headroom above the budget", () => {
    const out = resolveChat({ effort: "high", maxOutputTokens: 4096, thinkingBudgetTokens: 1024 }, cap);
    expect(out.reasoning.budgetTokens).toBe(1024);
    expect(out.warnings.some((w) => w.code === "reasoning_budget_clamped")).toBe(false);
  });

  test("no clamp when maxOutputTokens is unset — the budget defaults to range.max", () => {
    const out = resolveChat({ effort: "high" }, cap);
    expect(out.reasoning.budgetTokens).toBe(8192);
    expect(out.warnings.some((w) => w.code === "reasoning_budget_clamped")).toBe(false);
  });
});

describe("resolveChat — the Anthropic display gate", () => {
  test("a listed display mode is kept", () => {
    const cap = withReasoning({ mode: "effort", enabled: true, displayModes: ["summarized"] });
    expect(resolveChat({ effort: "high", thinkingDisplay: "summarized" }, cap).reasoning.display).toBe("summarized");
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
      knob: "temperature",
      message: "temperature ignored: model does not expose a temperature range",
    });
  });

  test("topA is capability-gated + clamped like the other numeric knobs", () => {
    const cap = withSampling({ topA: { min: 0, max: 1 } });
    const out = resolveChat({ topA: 1.5 }, cap);
    expect(out.sampling.topA).toBe(1); // clamped to the range max
  });

  test("topA the model omits is DROPPED + warned (no silent no-op)", () => {
    const out = resolveChat({ topA: 0.3 }, withSampling({}));
    expect(out.sampling.topA).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "sampling_knob_dropped",
      knob: "topA",
      message: "topA ignored: model does not expose a topA range",
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
      knob: "seed",
      message: "seed ignored: model does not support seed",
    });
  });

  test("unset knobs produce no fields and no warnings", () => {
    const out = resolveChat({}, FULL);
    expect(out.sampling).toEqual({});
    expect(out.warnings).toEqual([]);
  });
});

describe("resolveChat — the quality dial → sampling (Proposal 2, sampling half)", () => {
  test("quality fills temperature per the QUALITY_SAMPLING table (fast/balanced/deep)", () => {
    expect(resolveChat({ quality: "fast" }, FULL).sampling.temperature).toBe(0.5);
    expect(resolveChat({ quality: "balanced" }, FULL).sampling.temperature).toBe(0.7);
    expect(resolveChat({ quality: "deep" }, FULL).sampling.temperature).toBe(1);
  });

  test("an EXPLICIT temperature knob wins over the quality-mapped default (quality only fills gaps)", () => {
    // quality:'deep' would map to 1.0; the explicit 0.3 wins the precedence.
    expect(resolveChat({ quality: "deep", temperature: 0.3 }, FULL).sampling.temperature).toBe(0.3);
  });

  test("the quality-derived temperature is capability-CLAMPED to the model's range", () => {
    const cap = withSampling({ temperature: { min: 0, max: 0.8 } });
    // quality:'deep' → 1.0, clamped down to the model's 0.8 ceiling.
    expect(resolveChat({ quality: "deep" }, cap).sampling.temperature).toBe(0.8);
  });

  test("quality contributes NO temperature to a model whose descriptor omits the range (D68) + warns", () => {
    const out = resolveChat({ quality: "deep" }, withSampling({}));
    expect(out.sampling.temperature).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "sampling_knob_dropped",
      knob: "temperature",
      message: "temperature ignored: model does not expose a temperature range",
    });
  });

  test("no quality + no explicit temperature ⇒ temperature stays unset (no phantom default)", () => {
    expect(resolveChat({ topP: 0.5 }, FULL).sampling.temperature).toBeUndefined();
  });

  // VER-1(d): the quality dial is typed at every call site, but the VALUE comes off a persisted preset / the
  // wire, where an unrecognized string is possible — and the table lookup used to double-index it
  // (`QUALITY_SAMPLING[quality][knob]`), throwing a TypeError that took the whole turn down. Both arms:
  test("a KNOWN quality fills the dial and emits no quality warning (the guard doesn't disturb the live arm)", () => {
    const out = resolveChat({ quality: "balanced" }, FULL);
    expect(out.sampling.temperature).toBe(0.7);
    expect(out.warnings).toEqual([]);
  });

  test("an UNKNOWN quality (untyped/persisted value) degrades to no-quality + warns — never throws", () => {
    // The subject is a `quality` UserIntent cannot spell (a stale/typo'd persisted value) — no factory can make it.
    // @orb-waive no-test-fabrication(unknown): deliberate invalid-input probe. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const persisted = { quality: "ludicrous", topP: 0.5 } as unknown as UserIntent;

    const out = resolveChat(persisted, FULL);

    expect(out.sampling.temperature).toBeUndefined(); // no dial-derived default, and no crash
    expect(out.sampling.topP).toBe(0.5); // the rest of the funnel still resolves
    expect(out.warnings).toContainEqual({
      code: "sampling_knob_dropped",
      knob: "quality",
      message: 'quality "ludicrous" ignored: not a known quality level (fast, balanced, deep)',
    });
  });
});

describe("resolveChat — minP (D68-A)", () => {
  test("PASS: a listed minP rides through when the model exposes a range", () => {
    const cap = withSampling({ minP: { min: 0, max: 1 } });
    expect(resolveChat({ minP: 0.05 }, cap).sampling.minP).toBe(0.05);
  });

  test("CLAMP: an over-range minP is clamped down to the model max", () => {
    const cap = withSampling({ minP: { min: 0, max: 0.5 } });
    expect(resolveChat({ minP: 0.9 }, cap).sampling.minP).toBe(0.5);
  });

  test("DROP: a minP the model omits is dropped + warned (no silent no-op)", () => {
    // FULL exposes no minP range.
    const out = resolveChat({ minP: 0.1 }, FULL);
    expect(out.sampling.minP).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "sampling_knob_dropped",
      knob: "minP",
      message: "minP ignored: model does not expose a minP range",
    });
  });
});

describe("resolveChat — verbosity (D68-B)", () => {
  const cap = {
    ...FULL,
    verbosity: [...VERBOSITY_LEVELS] satisfies (typeof VERBOSITY_LEVELS)[number][],
  };

  test("PASS: a listed verbosity rides through when the model lists it", () => {
    expect(resolveChat({ verbosity: "high" }, cap).verbosity).toBe("high");
  });

  test("DROP: a model with NO verbosity vocab drops + warns", () => {
    const out = resolveChat({ verbosity: "high" }, FULL);
    expect(out.verbosity).toBeUndefined();
    expect(out.warnings).toContainEqual({
      code: "verbosity_dropped",
      message: "verbosity ignored: model does not expose a verbosity level",
    });
  });

  test("absent verbosity ⇒ no field, no warning", () => {
    const out = resolveChat({}, cap);
    expect(out.verbosity).toBeUndefined();
    expect(out.warnings.some((w) => w.code === "verbosity_dropped")).toBe(false);
  });
});

describe("resolveChat — the dynamic-context channel (D66)", () => {
  // A model whose wire-shape HONORS mid-conversation-system authority (Opus 4.8 on anthropic-messages).
  const Capable: ModelCapability = {
    ...FULL,
    turns: {
      assistantPrefill: false,
      midConversationSystem: true,
      historySystemRows: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: true,
    },
  };
  // A model that does NOT honor it (the FULL default has NO `turns`, so it floors to false too).
  const Incapable = FULL;

  test("user knob 'system' wins → system-block, regardless of capability", () => {
    const out = resolveChat({ advanced: { dynamicContext: "system" } }, Capable);
    expect(out.dynamicContextChannel).toBe("system-block");
    expect(out.warnings.some((w) => w.code === "dynamic_context_demoted")).toBe(false);
  });

  test("user knob 'hook' wins → message-tail when the model honors mid-conv-system", () => {
    const out = resolveChat({ advanced: { dynamicContext: "hook" } }, Capable);
    expect(out.dynamicContextChannel).toBe("message-tail");
    expect(out.warnings.some((w) => w.code === "dynamic_context_demoted")).toBe(false);
  });

  test("user knob 'hook' on an INCAPABLE model is DEMOTED to system-block + warned", () => {
    const out = resolveChat({ advanced: { dynamicContext: "hook" } }, Incapable);
    expect(out.dynamicContextChannel).toBe("system-block");
    expect(out.warnings.some((w) => w.code === "dynamic_context_demoted")).toBe(true);
  });

  test("absent knob + capable model ⇒ message-tail (the cache-safe default), no warning", () => {
    const out = resolveChat({}, Capable);
    expect(out.dynamicContextChannel).toBe("message-tail");
    expect(out.warnings.some((w) => w.code === "dynamic_context_demoted")).toBe(false);
  });

  test("absent knob + incapable model ⇒ system-block, no warning (not a user request to demote)", () => {
    const out = resolveChat({}, Incapable);
    expect(out.dynamicContextChannel).toBe("system-block");
    expect(out.warnings.some((w) => w.code === "dynamic_context_demoted")).toBe(false);
  });

  test("capability with no `turns` floors to system-block (conservative)", () => {
    expect(resolveChat({}, FULL).dynamicContextChannel).toBe("system-block");
  });
});

describe("resolveChat — turnId (part 05 §4 correlation id)", () => {
  test("mints a turnId on every call, ADDITIVE to (never replacing) the request-scoped requestId", () => {
    const out = resolveChat({}, FULL);
    expect(typeof out.turnId).toBe("string");
    expect(out.turnId.length).toBeGreaterThan(0);
  });

  test("two turns in the same process get DISTINCT ids (disambiguates multiple turns in one request)", () => {
    const a = resolveChat({}, FULL);
    const b = resolveChat({}, FULL);
    expect(a.turnId).not.toBe(b.turnId);
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
