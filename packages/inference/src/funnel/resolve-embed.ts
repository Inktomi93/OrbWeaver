// The (EmbedOptions × EmbeddingCapability) fold — the embed twin of `resolve-chat`. Decides the width the
// wire is asked for (an MRL model takes `dimensions`), or the client-side truncation the caller must apply
// (a wider non-MRL model — the space admits exactly `dims`), and refuses a NARROWER model up front: padding
// invents coordinates, and a silently different width poisons the vector store (#1635). Instruction and
// input-type hints ride only where the capability says the model honours them.

import type { EmbeddingCapability } from "@orb/contracts/inference";
import { ProviderError } from "../contract/errors.ts";
import type { ResolvedEmbedKnobs, ResolvedWarning } from "../contract/resolve.ts";

export interface EmbedOptions {
  readonly inputType?: "query" | "document" | undefined;
  readonly instruction?: string | undefined;
}

/** Exact width ⇒ nothing; wider + MRL ⇒ ask the wire; wider non-MRL ⇒ the caller truncates. */
function widthFor(capability: EmbeddingCapability, spaceDims: number): Pick<ResolvedEmbedKnobs, "dimensions" | "truncateTo"> {
  if (capability.dims === spaceDims) {
    return {};
  }
  return capability.mrl ? { dimensions: spaceDims } : { truncateTo: spaceDims };
}

export function resolveEmbed(opts: EmbedOptions, capability: EmbeddingCapability, spaceDims: number): ResolvedEmbedKnobs {
  const warnings: ResolvedWarning[] = [];
  if (capability.dims < spaceDims) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `embedding model produces ${capability.dims}-wide vectors but the space admits ${spaceDims}: a narrower vector is never padded`,
    });
  }
  const width = widthFor(capability, spaceDims);
  const instructionAware = capability.instructionAware;
  if (opts.instruction !== undefined && !instructionAware) {
    warnings.push({ code: "sampling_knob_dropped", message: "embed instruction ignored: the model is not instruction-aware" });
  }
  return {
    ...width,
    ...(opts.instruction !== undefined && instructionAware ? { instruction: opts.instruction } : {}),
    ...(opts.inputType !== undefined ? { inputType: opts.inputType } : {}),
    warnings,
  };
}
