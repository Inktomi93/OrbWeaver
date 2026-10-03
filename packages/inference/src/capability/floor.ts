// The per-wire posture floors applied AFTER synthesis — the two rules that are neither evidence nor a family:
//   • `silencesProse` (§6.4, D112): on any `auth: endpoint` connection, `tools` declared but not
//     `coEmitsProse` ⇒ `silencesProse: true`. The 36/36 local-Qwen measurement is why the floor is closed;
//     hosted catalogs carry it absent (co-emits, 6/6 measured). Fails closed on an unmeasured wire.
//   • D143(c) as amended by D292: PERMISSIVE modalities for an endpoint row that nobody described. A row whose
//     `declared` block or whose server (the advertised tier) states an input list is taken at its word; a row
//     that states none gets image + video with `modalitiesEstimated`, never a bare text-only floor (the engine
//     refuses a part it cannot take; hiding the knob was #317).

import type { Capability, GenerationCapability, ProviderDef } from "@orb/contracts/inference";

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
