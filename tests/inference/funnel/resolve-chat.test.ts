// funnel/resolve-chat — the reasoning DISPLAY default (audit B4). MEASURED 2026-09-19: an adaptive Anthropic
// model asked for thinking with NO `display` streams zero reasoning characters while still billing reasoning
// tokens, which the fold then mis-read as a redacted trace. The funnel is the one place reasoning policy is
// decided, so the default lands here: an adaptive model that ADVERTISES `summarized` gets it unless the user
// asked for something else. It is inert on the openrouter route (that transport spells no display, and OR
// sets `display: summarized` upstream by itself).

import type { GenerationCapability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { resolveChat } from "../../../packages/inference/src/funnel/resolve-chat.ts";
import { expect, test } from "../../support/fixtures.ts";

function generation(overrides: Partial<GenerationCapability> = {}): GenerationCapability {
  return {
    reasoning: { mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high"], displayModes: ["summarized"] },
    sampling: { temperature: { min: 0, max: 1 } },
    input: ["text"],
    output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] },
    context: { window: 200_000 },
    turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: true },
    ...overrides,
  };
}

test("an adaptive model advertising summarized display gets it by default", () => {
  const knobs = resolveChat({ effort: "high" } satisfies UserIntent, generation());
  expect(knobs.reasoning.display).toBe("summarized");
});

test("the user's own display choice still wins", () => {
  const knobs = resolveChat(
    { effort: "high", thinkingDisplay: "omitted" } satisfies UserIntent,
    generation({
      reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"], displayModes: ["summarized", "omitted"] },
    }),
  );
  expect(knobs.reasoning.display).toBe("omitted");
});

test("a model that advertises no display modes is left alone (never a knob it did not offer)", () => {
  const knobs = resolveChat({ effort: "high" } satisfies UserIntent, generation({ reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] } }));
  expect(knobs.reasoning.display).toBeUndefined();
});

test("a budget-mode model is not given an adaptive display default", () => {
  const knobs = resolveChat(
    { effort: "high" } satisfies UserIntent,
    generation({ reasoning: { mode: "budget", enabled: true, budgetRange: { min: 1024, max: 4096 }, displayModes: ["summarized"] } }),
  );
  expect(knobs.reasoning.display).toBeUndefined();
});

// ── §8.8 reasoning CARRY: one ORDERED knob, two gates, one drop code ─────────────────────────────────────
// The rungs are ordered (`off` < `tool-chain` < `conversation`) and gated from the top by the capability
// cell, so the funnel's whole job here is: honour what the model takes back, drop the rest LOUDLY with the
// ordinary `sampling_knob_dropped` warning rather than greying a control the user cannot reason about.

const carryDrops = (knobs: ReturnType<typeof resolveChat>): readonly string[] =>
  knobs.warnings.flatMap((w) => (w.code === "sampling_knob_dropped" && w.knob === "carryReasoning" ? [w.message] : []));

const SIGNED_REPLAY: GenerationCapability["reasoning"] = { mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high"], replay: "signed" };

test("carry: absent ⇒ `off`, silently — the default is not a degrade", () => {
  const knobs = resolveChat({ effort: "high" } satisfies UserIntent, generation({ reasoning: SIGNED_REPLAY }));
  expect(knobs.carryReasoning).toBe("off");
  expect(carryDrops(knobs)).toEqual([]);
});

test("carry: a signed-replay model honours BOTH live rungs verbatim", () => {
  const cap = generation({ reasoning: SIGNED_REPLAY });
  expect(resolveChat({ effort: "high", carryReasoning: "tool-chain" } satisfies UserIntent, cap).carryReasoning).toBe("tool-chain");
  expect(resolveChat({ effort: "high", carryReasoning: "conversation" } satisfies UserIntent, cap).carryReasoning).toBe("conversation");
});

test("carry: a `text`-replay model still honours both rungs — the prose rides, the provenance simply is not there", () => {
  const cap = generation({ reasoning: { ...SIGNED_REPLAY, replay: "text" } });
  expect(resolveChat({ effort: "high", carryReasoning: "conversation" } satisfies UserIntent, cap).carryReasoning).toBe("conversation");
});

test("carry: the CAPABILITY gate — an absent `replay` cell is the fail-closed `none` floor and drops the knob", () => {
  // Absent, not `replay: "none"`: the floor is what an unmeasured wire gets, and it must not be handed a
  // signed block it may reject.
  const knobs = resolveChat(
    { effort: "high", carryReasoning: "conversation" } satisfies UserIntent,
    generation({ reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] } }),
  );
  expect(knobs.carryReasoning).toBe("off");
  expect(carryDrops(knobs)).toHaveLength(1);
});

test("carry: the COHERENCE rule — reasoning OFF for the turn leaves nothing to carry", () => {
  // The model CAN replay (`replay: "signed"`); the user turned thinking off for this turn, so the carry knob
  // has no input. ST models this as a separate `show_thoughts` gate; we make it the one ordered knob's rule.
  const knobs = resolveChat({ effort: "none", carryReasoning: "tool-chain" } satisfies UserIntent, generation({ reasoning: SIGNED_REPLAY }));
  expect(knobs.carryReasoning).toBe("off");
  expect(carryDrops(knobs)[0]).toContain("reasoning is off");
});

test("carry: a MANDATORY-reasoning model clamps effort UP, and the carry survives that clamp", () => {
  // The coherence rule reads the POST-clamp answer: `effort: none` on a mandatory model becomes `low`, so
  // reasoning IS on and the carry stands. Reading the requested effort instead would drop it here.
  const knobs = resolveChat(
    { effort: "none", carryReasoning: "tool-chain" } satisfies UserIntent,
    generation({ reasoning: { ...SIGNED_REPLAY, mandatory: true } }),
  );
  expect(knobs.reasoning.enabled).toBe(true);
  expect(knobs.carryReasoning).toBe("tool-chain");
  expect(carryDrops(knobs)).toEqual([]);
});

test("carry: the mandatory clamp's own warning is raised ONCE, not twice (one decision, one notice)", () => {
  // `resolveCarryReasoning` re-derives "is reasoning on" through the same helper the reasoning resolution
  // uses; it passes a THROWAWAY sink so the clamp notice belongs to the reasoning fold alone.
  const knobs = resolveChat(
    { effort: "none", carryReasoning: "tool-chain" } satisfies UserIntent,
    generation({ reasoning: { ...SIGNED_REPLAY, mandatory: true } }),
  );
  expect(knobs.warnings.filter((w) => w.code === "reasoning_mandatory_clamp")).toHaveLength(1);
});
