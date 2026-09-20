// capability/sources/advertised/openrouter — the OR catalog row → the ADVERTISED partial. The H1(a) pin: OR's
// `supported_parameters` is INVERTED on `verbosity` (listed on every Claude id, where Anthropic has no such
// knob; absent on `openai/gpt-5.4`, where OR forwards `text.verbosity` — measured 2026-09-20,
// `gen-1789884254-ZJVqE4m5N0aChJ7FY0x7`), so the advertised tier never derives verbosity from it; the knob is a
// curated / measured statement. The sampling NAMES still gate presence (§8.7) — that half is unchanged.

import type { ModelCatalogEntry } from "@orb/contracts/inference";
import { advertisedFromOpenRouter } from "../../../../../packages/inference/src/capability/sources/advertised/openrouter.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function entry(overrides: Partial<ModelCatalogEntry>): ModelCatalogEntry {
  return {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    kind: "generation",
    contextLength: 200_000,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportedParameters: [],
    ...overrides,
  };
}

function generationOf(partial: ReturnType<typeof advertisedFromOpenRouter>): { verbosity?: unknown; sampling?: unknown } {
  return partial as { verbosity?: unknown; sampling?: unknown };
}

test("H1(a): `verbosity` in supported_parameters grants NOTHING — the OR list is inverted on that knob", () => {
  // The exact list OR advertised for anthropic/claude-opus-5 on 2026-09-20 (verbosity present, temperature present).
  const opus5 = advertisedFromOpenRouter(
    entry({
      supportedParameters: [
        "include_reasoning",
        "max_tokens",
        "reasoning",
        "response_format",
        "stop",
        "structured_outputs",
        "temperature",
        "tool_choice",
        "tools",
        "verbosity",
      ],
    }),
  );
  expect(generationOf(opus5).verbosity).toBeUndefined();
  // PLANTED CONTROL for the same row: the sampling NAMES still gate presence (temperature listed ⇒ a range; top_p not listed ⇒ absent).
  expect(generationOf(opus5).sampling).toEqual({ temperature: { min: 0, max: 2 }, stop: true });
});

test("the sampling name list is honoured verbatim: gpt-5.4's OR row (no temperature, seed present) yields no temperature range", () => {
  const gpt54 = advertisedFromOpenRouter(
    entry({
      id: "openai/gpt-5.4",
      supportedParameters: [
        "include_reasoning",
        "max_completion_tokens",
        "max_tokens",
        "reasoning",
        "reasoning_effort",
        "response_format",
        "seed",
        "structured_outputs",
        "tool_choice",
        "tools",
      ],
    }),
  );
  expect(generationOf(gpt54).sampling).toEqual({ seed: true });
  expect(generationOf(gpt54).verbosity).toBeUndefined();
});
