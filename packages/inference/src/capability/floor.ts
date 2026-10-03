// The per-wire posture floors applied AFTER synthesis — the two rules that are neither evidence nor a family:
//   • `silencesProse` (§6.4, D112): on any `auth: endpoint` connection, `tools` with no tier stating
//     `silencesProse` ⇒ `silencesProse: true`. Fails closed on an unmeasured (model × server); a curated,
//     measured (`sources/measured/local-servers.ts`) or declared `silencesProse: false` passes untouched.
//     Hosted catalogs carry it absent (co-emits, 6/6 measured).
//   • D143(c) as amended by D292: PERMISSIVE modalities for an endpoint row that nobody described. A row whose
//     `declared` block or whose server (the advertised tier) states an input list is taken at its word; a row
//     that states none gets image + video with `modalitiesEstimated`, never a bare text-only floor (the engine
//     refuses a part it cannot take; hiding the knob was #317).

import type { Capability, GenerationCapability, ProviderDef } from "@orb/contracts/inference";

/** A server that states its model's trained maximum clamps any larger window to it at load (Ollama), so a
 *  declared or advertised window above it would budget the history fit past what the server evaluates. */
export function clampToTrainedWindow(capability: Capability, trained: number | undefined): Capability {
  if (capability.kind !== "generation" || trained === undefined || capability.generation.context.window <= trained) {
    return capability;
  }
  return { kind: "generation", generation: { ...capability.generation, context: { ...capability.generation.context, window: trained } } };
}

export function applyEndpointPosture(provider: ProviderDef, capability: Capability, modalitiesStated: boolean): Capability {
  if (capability.kind !== "generation" || provider.auth !== "endpoint") {
    return capability;
  }
  let generation: GenerationCapability = capability.generation;
  const tools: GenerationCapability["tools"] = generation.tools;
  if (tools !== undefined && !("silencesProse" in tools)) {
    generation = { ...generation, tools: { ...tools, silencesProse: true } };
  }
  if (!modalitiesStated && generation.input.length <= 1) {
    generation = { ...generation, input: ["text", "image", "video"], modalitiesEstimated: true };
  }
  return { kind: "generation", generation };
}
