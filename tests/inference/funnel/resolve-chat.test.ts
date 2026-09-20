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
