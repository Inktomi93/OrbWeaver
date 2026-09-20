// capability/sources/measured — the measured tier's loader (match semantics) and the B3 / H1 / H3 outcomes the
// resolver reaches through it, folded exactly as `resolve-task.ts` folds them (curated rows + the OR advertised
// partial + the measured rows → `synthesizeCapability` → the funnel). Receipts 2026-09-20, `rec-probe.mjs`:
// opus-5 `gen-1789884252-n94Ebcm1uMVMG1XhxsbB`, opus-4.8 `gen-1789884543-OomBi0lVg4zDXFmCZ3Pk` (OR advertises
// `temperature`, strips it upstream), gpt-5.4 `gen-1789884254-ZJVqE4m5N0aChJ7FY0x7` (OR forwards `text.verbosity`
// while NOT listing it; strips temperature while — consistently — not listing it).

import type { GenerationCapability, ModelCatalogEntry, ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { advertisedFromOpenRouter } from "../../../../../packages/inference/src/capability/sources/advertised/openrouter.ts";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { measuredRows } from "../../../../../packages/inference/src/capability/sources/measured/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The OR catalog row as advertised on 2026-09-20 (`supported_parameters` verbatim). */
function orEntry(id: string, supportedParameters: readonly string[]): ModelCatalogEntry {
  return {
    id,
    name: id,
    kind: "generation",
    contextLength: 200_000,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportedParameters: [...supportedParameters],
    reasoning: { mandatory: false, supportedEfforts: ["low", "medium", "high"] },
  };
}

const OR_ROUTE = { providerId: castId<ProviderId>("openrouter"), wire: "openai-compat", api: "chat-completions" } as const;
const DIRECT_ANTHROPIC = { providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" } as const;
const OPUS5_ADVERTISED = [
  "include_reasoning",
  "max_completion_tokens",
  "max_tokens",
  "reasoning",
  "reasoning_effort",
  "response_format",
  "stop",
  "structured_outputs",
  "temperature",
  "tool_choice",
  "tools",
  "verbosity",
];
const GPT54_ADVERTISED = [
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
];

/** The resolver's fold for an OpenRouter row, minus the ctx plumbing (`resolve-task.ts` `evidence`). */
function viaOpenRouter(model: string, supportedParameters: readonly string[], family: "anthropic" | "openai"): GenerationCapability {
  const query = { model, ...OR_ROUTE };
  const out = synthesizeCapability("generation", family, {
    curated: curatedRows(query),
    advertised: advertisedFromOpenRouter(orEntry(model, supportedParameters)),
    measured: measuredRows(query),
  });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

test("measuredRows matches per (model × provider): the OR opus-5 / opus-4.8 rows reach only their ids on the openrouter route", () => {
  expect(measuredRows({ model: "anthropic/claude-opus-5", ...OR_ROUTE })).toHaveLength(1);
  expect(measuredRows({ model: "anthropic/claude-opus-4.8", ...OR_ROUTE })).toHaveLength(1);
  // The same ids on the DIRECT wire, and a sibling id on the OR route, get nothing — the whole point of the matcher.
  expect(measuredRows({ model: "claude-opus-5", ...DIRECT_ANTHROPIC })).toEqual([]);
  expect(measuredRows({ model: "anthropic/claude-haiku-4.5", ...OR_ROUTE })).toEqual([]);
  expect(measuredRows({ model: "anthropic/claude-fable-5", ...OR_ROUTE })).toEqual([]);
});

test("B3: anthropic/claude-opus-5 via OpenRouter resolves an EMPTY sampling set although OR advertises temperature", () => {
  const gen = viaOpenRouter("anthropic/claude-opus-5", OPUS5_ADVERTISED, "anthropic");
  expect(gen.sampling).toEqual({});
  // The funnel then DROPS a preset temperature loudly instead of the record claiming it applied.
  const knobs = resolveChat({ temperature: 0.7, topP: 0.9 }, gen);
  expect(knobs.sampling).toEqual({});
  expect(knobs.warnings.map((w) => [w.code, w.knob])).toEqual([
    ["sampling_knob_dropped", "temperature"],
    ["sampling_knob_dropped", "topP"],
  ]);
  // PLANTED CONTROL: without the measured row the advertised range would have stood (the measured tier is load-bearing).
  const unmeasured = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model: "anthropic/claude-opus-5", ...OR_ROUTE }),
    advertised: advertisedFromOpenRouter(orEntry("anthropic/claude-opus-5", OPUS5_ADVERTISED)),
  });
  expect(unmeasured.capability.kind === "generation" && unmeasured.capability.generation.sampling.temperature).toEqual({ min: 0, max: 2 });
});

test("H3: openai/gpt-5.4 via OpenRouter still drops temperature with the warning (its advertisement omits it — consistent with the upstream strip)", () => {
  const gen = viaOpenRouter("openai/gpt-5.4", GPT54_ADVERTISED, "openai");
  expect(gen.sampling.temperature).toBeUndefined();
  expect(gen.sampling.seed).toBe(true);
  const knobs = resolveChat({ temperature: 0.7, seed: 7 }, gen);
  expect(knobs.sampling).toEqual({ seed: 7 });
  expect(knobs.warnings.map((w) => w.code)).toEqual(["sampling_knob_dropped"]);
});

test("H1: verbosity — opus-5 via OR resolves NONE (OR's list is inverted; Anthropic has no such knob), gpt-5.4 keeps the CURATED levels", () => {
  const opus = viaOpenRouter("anthropic/claude-opus-5", OPUS5_ADVERTISED, "anthropic");
  expect(opus.verbosity).toBeUndefined();
  expect(resolveChat({ verbosity: "low" }, opus).warnings.map((w) => w.code)).toEqual(["verbosity_dropped"]);
  const gpt = viaOpenRouter("openai/gpt-5.4", GPT54_ADVERTISED, "openai");
  expect(gpt.verbosity).toEqual(["low", "medium", "high"]);
  expect(resolveChat({ verbosity: "low" }, gpt).verbosity).toBe("low");
});
