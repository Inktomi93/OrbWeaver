// The per-wire posture floors applied AFTER synthesis — the rules that are neither evidence nor a family (and the
// server's tool-choice support and trained-window clamp below, which ride the catalog entry):
//   • `silencesProse` (§6.4, D112): on any `auth: endpoint` connection, `tools` stated without a
//     `silencesProse` value ⇒ `silencesProse: true`. The 36/36 local-Qwen measurement is why the floor is closed;
//     hosted catalogs carry it absent (co-emits, 6/6 measured). Fails closed on an unmeasured wire.
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

/** A server's own tool-choice support, from the catalog entry its reader filled, laid onto whatever tools block
 *  the fold holds: the advertised one, or tools the user declared (KoboldCpp states none). A form the server
 *  does not force (Ollama and KoboldCpp: neither; llama.cpp: a named choice) is stated `false`, so it goes out as
 *  `auto`, loudly. A form the fold already states — a declaration, a curated row — is kept. Applied after
 *  synthesis rather than as advertised evidence because a `tools` cell means "accepts tools[]", which the server
 *  does not say for every model. */
export function applyServerToolChoice(capability: Capability, toolChoice: { readonly required: boolean; readonly named: boolean } | undefined): Capability {
  const tools = capability.kind === "generation" ? capability.generation.tools : undefined;
  if (capability.kind !== "generation" || tools === undefined || toolChoice === undefined) {
    return capability;
  }
  const stated = {
    ...(toolChoice.required || "requiredChoice" in tools ? {} : { requiredChoice: false }),
    ...(toolChoice.named || "namedChoice" in tools ? {} : { namedChoice: false }),
  };
  return Object.keys(stated).length === 0 ? capability : { kind: "generation", generation: { ...capability.generation, tools: { ...tools, ...stated } } };
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
