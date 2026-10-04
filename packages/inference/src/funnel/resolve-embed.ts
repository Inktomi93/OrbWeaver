// The (EmbedOptions × EmbeddingCapability) fold — the embed twin of `resolve-chat`. The owner's space is as
// wide as the bound embedder's stated `dims`, so nothing is padded: an MRL model is asked for exactly `dims`
// (which honours a declared shorter width), any other model is never shortened and is taken at the width it
// returns, and the store's width check refuses a vector that disagrees. Instruction and input-type hints ride
// only where the capability says the model honours them.

import type { EmbeddingCapability } from "@orb/contracts/inference";
import type { ResolvedEmbedKnobs, ResolvedWarning } from "../contract/resolve.ts";

export interface EmbedOptions {
  readonly inputType?: "query" | "document" | undefined;
  readonly instruction?: string | undefined;
}

export function resolveEmbed(opts: EmbedOptions, capability: EmbeddingCapability): ResolvedEmbedKnobs {
  const warnings: ResolvedWarning[] = [];
  const instructionAware = capability.instructionAware;
  if (opts.instruction !== undefined && !instructionAware) {
    warnings.push({ code: "sampling_knob_dropped", message: "embed instruction ignored: the model is not instruction-aware" });
  }
  return {
    ...(capability.mrl ? { dimensions: capability.dims } : {}),
    ...(opts.instruction !== undefined && instructionAware ? { instruction: opts.instruction } : {}),
    ...(opts.inputType !== undefined ? { inputType: opts.inputType } : {}),
    warnings,
  };
}
