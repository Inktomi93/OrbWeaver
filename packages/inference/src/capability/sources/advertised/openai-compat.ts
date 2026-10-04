// The ADVERTISED tier from an OpenAI-compatible `/v1/models` row: ids and, when the server reports one, a chat
// model's context window (vLLM `max_model_len`, LM Studio `max_context_length`, llama.cpp `meta.n_ctx`, Ollama's
// pinned `num_ctx`, else its default floor as assumed), an embedder's width, and — where the row's native model-info API states them (D292) — the
// modalities a turn may carry, whether the model takes `tools[]` and whether it thinks, schema-constrained output, and whether a
// delivered assistant row is continued (the server's rendered prompt leaves it open), and the sampler values the
// server runs when a request leaves a knob unset. Everything else is curated or declared (§5.7, §6.3).

import type { CapabilityOverride, EmbeddingCapability, EndpointFeatures, ModelKind } from "@orb/contracts/inference";
import { DEFAULT_SAMPLER_KEYS, SAMPLING_RANGE_KNOBS } from "@orb/contracts/inference";
import type { EndpointModel } from "../../../contract/runtime.ts";

type GenerationPatch = NonNullable<CapabilityOverride["generation"]>;

/** A stated window is reported; a server's floor for an unstated one stays assumed, so the editor marks it and
 *  the user is told to correct it. */
function advertisedContext(entry: Pick<EndpointModel, "contextLength" | "contextFloor">): Pick<GenerationPatch, "context"> {
  if (entry.contextLength !== null) {
    return { context: { window: entry.contextLength } };
  }
  return entry.contextFloor === undefined ? {} : { context: { window: entry.contextFloor, windowEstimated: true } };
}

/** The server's defaults keyed by sampler knob: each knob's value under the key this row spells it with
 *  (`features.samplerKeys` over `DEFAULT_SAMPLER_KEYS`), where the server states a number for it. */
function samplingDefaultsOf(serverDefaults: EndpointModel["serverDefaults"], features: EndpointFeatures): GenerationPatch["samplingDefaults"] {
  if (serverDefaults === undefined) {
    return;
  }
  const keys = { ...DEFAULT_SAMPLER_KEYS, ...features.samplerKeys };
  const defaults = SAMPLING_RANGE_KNOBS.flatMap((knob) => {
    const value = serverDefaults[keys[knob]];
    return typeof value === "number" ? [[knob, value] as const] : [];
  });
  return defaults.length === 0 ? undefined : Object.fromEntries(defaults);
}

export function advertisedFromOpenAiCompat(
  entry: Pick<EndpointModel, "contextLength" | "contextFloor" | "embeddingDims" | "input" | "tools" | "structured" | "prefill" | "serverDefaults" | "thinks">,
  kind: ModelKind,
  features: EndpointFeatures,
): GenerationPatch | Partial<EmbeddingCapability> {
  if (kind === "embedding") {
    return entry.embeddingDims === undefined ? {} : { dims: entry.embeddingDims };
  }
  if (kind !== "generation") {
    return {};
  }
  const samplingDefaults = samplingDefaultsOf(entry.serverDefaults, features);
  return {
    ...advertisedContext(entry),
    ...(entry.input === undefined ? {} : { input: [...entry.input] }),
    ...(entry.tools === undefined ? {} : { tools: { parallel: entry.tools.parallel } }),
    ...(entry.structured === true ? { output: { structured: true } } : {}),
    // A stated thinker reasons by a switch, not a budget: `reasoning_effort` (Ollama's `think`) turns it on or off.
    ...(entry.thinks === true ? { reasoning: { mode: "effort", enabled: true } } : {}),
    // The server rendered a trailing assistant row and left it open: a delivered prefill is continued.
    ...(entry.prefill === undefined ? {} : { turns: { assistantPrefill: entry.prefill === "deliver" } }),
    ...(samplingDefaults === undefined ? {} : { samplingDefaults }),
  };
}

/** Whether the advertised tier states what a turn may carry — the D292 bit the endpoint posture reads. */
export function advertisedStatesInput(entry: Pick<EndpointModel, "input"> | undefined): boolean {
  return entry?.input !== undefined;
}
