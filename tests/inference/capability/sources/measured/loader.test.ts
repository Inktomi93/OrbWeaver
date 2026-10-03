// capability/sources/measured — the measured tier's loader (match semantics) and the B3 / H1 / H3 outcomes the
// resolver reaches through it, folded exactly as `resolve-task.ts` folds them (curated rows + the OR advertised
// partial + the measured rows → `synthesizeCapability` → the funnel). Receipts 2026-09-20, `rec-probe.mjs`:
// opus-5 `gen-1789884252-n94Ebcm1uMVMG1XhxsbB`, opus-4.8 `gen-1789884543-OomBi0lVg4zDXFmCZ3Pk` (OR advertises
// `temperature`, strips it upstream), gpt-5.4 `gen-1789884254-ZJVqE4m5N0aChJ7FY0x7` (OR forwards `text.verbosity`
// while NOT listing it; strips temperature while — consistently — not listing it).

import type { GenerationCapability, ModelCatalogEntry, ProviderId } from "@orb/contracts/inference";
import { builtinProvider, coEmitsProseWithTools } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { applyEndpointPosture } from "../../../../../packages/inference/src/capability/floor.ts";
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

test("measuredRows matches per (model × provider): each OR row reaches only its ids on the openrouter route", () => {
  const stated = (model: string): string[] => measuredRows({ model, ...OR_ROUTE }).flatMap((row) => Object.keys(row.generation ?? {}));
  expect(stated("anthropic/claude-opus-5")).toEqual(["sampling", "reasoning"]);
  expect(stated("anthropic/claude-opus-4.8")).toEqual(["sampling", "reasoning"]);
  expect(stated("anthropic/claude-fable-5")).toEqual(["reasoning"]);
  // The same ids on the DIRECT wire, and a non-adaptive sibling on the OR route, get nothing — the whole point of the matcher.
  expect(measuredRows({ model: "claude-opus-5", ...DIRECT_ANTHROPIC })).toEqual([]);
  expect(measuredRows({ model: "anthropic/claude-haiku-4.5", ...OR_ROUTE })).toEqual([]);
});

// ── the default effort on the OpenRouter route ───────────────────────────────────────────────────────────
// The catalog's reasoning objects, verbatim from the live catalog (2026-09-23). OR's catalog carries no thinking
// type, so the advertised tier spells every one `effort`; the measured row restores `adaptive` for the Claude ids
// whose upstream echo shows adaptive thinking, and the house default effort follows the capability, not the route.

function orReasoningEntry(id: string, reasoning: NonNullable<ModelCatalogEntry["reasoning"]>): ModelCatalogEntry {
  return { ...orEntry(id, OPUS5_ADVERTISED), reasoning };
}

function viaOpenRouterCatalog(entry: ModelCatalogEntry, family: "anthropic" | "openai" | "google"): GenerationCapability {
  const query = { model: entry.id, ...OR_ROUTE };
  const out = synthesizeCapability("generation", family, {
    curated: curatedRows(query),
    advertised: advertisedFromOpenRouter(entry),
    measured: measuredRows(query),
  });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

const CLAUDE_LADDER = ["max", "xhigh", "high", "medium", "low"];

test("OR Claude with nothing set runs adaptive at high, even where the catalog says off by default (opus-4.8)", () => {
  for (const entry of [
    orReasoningEntry("anthropic/claude-opus-4.8", { mandatory: false, defaultEnabled: false, supportedEfforts: CLAUDE_LADDER, defaultEffort: "high" }),
    orReasoningEntry("anthropic/claude-opus-5", { mandatory: false, defaultEnabled: true, supportedEfforts: CLAUDE_LADDER, defaultEffort: "high" }),
    orReasoningEntry("anthropic/claude-fable-5.1", { mandatory: true, supportedEfforts: CLAUDE_LADDER, defaultEffort: "high" }),
  ]) {
    const gen = viaOpenRouterCatalog(entry, "anthropic");
    expect(resolveChat({}, gen).reasoning, entry.id).toMatchObject({ mode: "adaptive", enabled: true, effort: "high" });
  }
});

// OR-14 (scripts/probes/openrouter/RESULTS.md): OpenRouter answers both `{effort:"none"}` and `{enabled:false}` on
// Sonnet 5.5 with "Reasoning is mandatory for this endpoint and cannot be disabled", and its chat body has no
// `between_tools` spelling, so the measured row outranks a catalog that does not say so.
test("OR sonnet-5.5 is mandatory whatever the catalog says: reasoning off clamps to low, loudly", () => {
  const reasoning = { mandatory: false, defaultEnabled: true, supportedEfforts: CLAUDE_LADDER, defaultEffort: "high" };
  const gen = viaOpenRouterCatalog(orReasoningEntry("anthropic/claude-sonnet-5.5", reasoning), "anthropic");
  expect(gen.reasoning.mandatory).toBe(true);
  expect(gen.tools?.forcedChoice).toBe(false);
  const off = resolveChat({ effort: "none" }, gen);
  expect(off.reasoning).toMatchObject({ mode: "adaptive", enabled: true, effort: "low" });
  expect(off.warnings.map((w) => [w.code, w.appliedEffort])).toEqual([["reasoning_mandatory_clamp", "low"]]);
  // PLANTED CONTROL: Sonnet 5 under the same catalog shape still switches off.
  const sonnet5 = viaOpenRouterCatalog(orReasoningEntry("anthropic/claude-sonnet-5", reasoning), "anthropic");
  expect(resolveChat({ effort: "none" }, sonnet5).reasoning.enabled).toBe(false);
});

test("OR OpenAI / Gemini keep the catalog's own default: gpt-5.4-mini stays off, gemini-3.5-flash stays at medium", () => {
  const gpt = viaOpenRouterCatalog(
    orReasoningEntry("openai/gpt-5.4-mini", {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: ["xhigh", "high", "medium", "low", "none"],
      defaultEffort: "medium",
    }),
    "openai",
  );
  expect(resolveChat({}, gpt).reasoning).toMatchObject({ mode: "effort", enabled: false });
  const gemini = viaOpenRouterCatalog(
    orReasoningEntry("google/gemini-3.5-flash", {
      mandatory: true,
      defaultEnabled: true,
      supportedEfforts: ["high", "medium", "low", "minimal"],
      defaultEffort: "medium",
    }),
    "google",
  );
  expect(resolveChat({}, gemini).reasoning).toMatchObject({ mode: "effort", enabled: true, effort: "medium" });
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

// ── local servers: prose with tool calls (scripts/probes/prose-with-tools) ──────────────────────────────────
// The endpoint floor closes `silencesProse` on every local model no tier measured; a measured co-emitting row
// is the only thing that opens folded RPG there. The advertised tier is what the server's own reader states
// (tools, not co-emission), as `catalog/endpoint.ts` folds it.

function localResolved(providerId: string, model: string): GenerationCapability {
  const provider = builtinProvider(providerId);
  if (provider === undefined) {
    throw new Error(`${providerId} row missing`);
  }
  const query = { model, providerId: castId<ProviderId>(providerId), wire: provider.wire, api: "chat-completions" } as const;
  const synthesized = synthesizeCapability("generation", "qwen", {
    curated: curatedRows(query),
    advertised: { tools: { parallel: false } },
    measured: measuredRows(query),
  });
  const floored = applyEndpointPosture(provider, synthesized.capability, false);
  if (floored.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return floored.generation;
}

test("a measured co-emitting (model × server) row lifts the endpoint floor: Qwen3.8-27B folds on vLLM, llama.cpp and Ollama", () => {
  for (const [provider, model] of [
    ["vllm", "qwen3.8-27b"],
    ["vllm", "/media/models/quantized/Qwen3.8-27B-W8A8-Dynamic-Per-Token"],
    ["llama-cpp", "Qwen3.8-27B-UD-Q4_K_M.gguf"],
    ["ollama", "qwen3.8-27b:latest"],
    ["ollama", "qwen3.8:27b"],
  ] as const) {
    const gen = localResolved(provider, model);
    expect(gen.tools, `${provider} ${model}`).toEqual({ parallel: true, silencesProse: false });
    expect(coEmitsProseWithTools(gen), `${provider} ${model}`).toBe(true);
  }
});

test("an unmeasured local cell stays fail-closed: another model, or the same model on a server nobody measured", () => {
  for (const [provider, model] of [
    ["vllm", "Qwen/Qwen3-VL-8B-Instruct"],
    ["vllm", "qwen3.8-flash-next"],
    ["llama-cpp", "qwen2.5-0.5b-instruct-q4_k_m.gguf"],
    ["ollama", "qwen3.8:35b"],
    // Measured, and still closed: KoboldCpp's default tool mode cannot co-emit and its API does not name the mode.
    ["koboldcpp", "koboldcpp/Qwen3.8-27B-UD-Q4_K_M"],
  ] as const) {
    const gen = localResolved(provider, model);
    expect(gen.tools?.silencesProse, `${provider} ${model}`).toBe(true);
    expect(coEmitsProseWithTools(gen), `${provider} ${model}`).toBe(false);
  }
});
