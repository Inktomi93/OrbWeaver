// The per-wire posture floors applied AFTER synthesis — the rules that are neither evidence nor a family (and the
// server's tool-choice support and trained- and served-window clamps below, which ride the catalog entry):
//   • `silencesProse` (§6.4, D112): on any `auth: endpoint` connection, `tools` stated without a
//     `silencesProse` value ⇒ `silencesProse: true`. The 36/36 local-Qwen measurement is why the floor is closed;
//     hosted catalogs carry it absent (co-emits, 6/6 measured). Fails closed on an unmeasured wire.
//   • D143(c) as amended by D292: PERMISSIVE modalities for an endpoint row that nobody described. A row whose
//     `declared` block or whose server (the advertised tier) states an input list is taken at its word; a row
//     that states none gets image + video with `modalitiesEstimated`, never a bare text-only floor (the engine
//     refuses a part it cannot take; hiding the knob was #317).
//   • `turnsEstimated` survives only on an endpoint row: every hosted route keeps the fail-closed turns floor.

import type { Capability, GenerationCapability, ProviderDef } from "@orb/contracts/inference";

/** A server that states its model's trained maximum clamps any larger window to it at load (Ollama), so a
 *  declared or advertised window above it would budget the history fit past what the server evaluates. */
export function clampToTrainedWindow(capability: Capability, trained: number | undefined): Capability {
  if (capability.kind !== "generation" || trained === undefined || capability.generation.context.window <= trained) {
    return capability;
  }
  return { kind: "generation", generation: { ...capability.generation, context: { ...capability.generation.context, window: trained } } };
}

/** The window a server runs where the request cannot set one, and whether that figure is only its floor. */
export interface ServedWindow {
  readonly window: number;
  readonly estimated: boolean;
}

/** A route that sends no window runs the server's own, so a larger declared window would budget the history fit past
 *  what the server evaluates. Clamps are silent, as the trained clamp is; a floor keeps the window marked assumed. */
export function clampToServedWindow(capability: Capability, served: ServedWindow | undefined): Capability {
  if (capability.kind !== "generation" || served === undefined || capability.generation.context.window <= served.window) {
    return capability;
  }
  const { windowEstimated: _replaced, ...context } = capability.generation.context;
  return {
    kind: "generation",
    generation: { ...capability.generation, context: { ...context, window: served.window, ...(served.estimated ? { windowEstimated: true } : {}) } },
  };
}

/** A route that sends the window with each request (Ollama's native `num_ctx`) runs the one the preset asks for, up to
 *  the trained maximum; `windowForPreset` applies it per turn. With no trained maximum stated there is no bound to
 *  hold a preset value to, so the window stands. The mark is the route's alone: a stated one elsewhere is dropped. */
export function markSettableWindow(capability: Capability, sendsWindow: boolean, trained: number | undefined): Capability {
  const settable = sendsWindow && trained !== undefined ? { settable: { max: trained } } : {};
  if (capability.kind !== "generation" || (!("settable" in settable) && capability.generation.context.settable === undefined)) {
    return capability;
  }
  const { settable: _replaced, ...context } = capability.generation.context;
  return { kind: "generation", generation: { ...capability.generation, context: { ...context, ...settable } } };
}

/** What the server does with each tool-choice form and the parallel switch, as its catalog reader states it. */
export interface ServerToolChoice {
  readonly required: boolean;
  readonly named: boolean;
  readonly none: boolean;
  readonly parallel: boolean;
}

/** A server's own tool-choice support, from the catalog entry its reader filled, laid onto whatever tools block
 *  the fold holds: the advertised one, or tools the user declared (KoboldCpp states none). A form the server
 *  does not force (Ollama and KoboldCpp: neither; llama.cpp: a named choice) is stated `false`, so it goes out as
 *  `auto`, loudly; a `none` it does not carry withdraws the offered tools, and a parallel switch it ignores is
 *  dropped by name. A form the fold already states — a declaration, a curated row — is kept. Applied after
 *  synthesis rather than as advertised evidence because a `tools` cell means "accepts tools[]", which the server
 *  does not say for every model. */
export function applyServerToolChoice(capability: Capability, toolChoice: ServerToolChoice | undefined): Capability {
  const tools = capability.kind === "generation" ? capability.generation.tools : undefined;
  if (capability.kind !== "generation" || tools === undefined || toolChoice === undefined) {
    return capability;
  }
  const stated = {
    ...(toolChoice.required || "requiredChoice" in tools ? {} : { requiredChoice: false }),
    ...(toolChoice.named || "namedChoice" in tools ? {} : { namedChoice: false }),
    ...(toolChoice.none || "noneChoice" in tools ? {} : { noneChoice: false }),
    ...(toolChoice.parallel || "parallelControl" in tools ? {} : { parallelControl: false }),
  };
  return Object.keys(stated).length === 0 ? capability : { kind: "generation", generation: { ...capability.generation, tools: { ...tools, ...stated } } };
}

export function applyEndpointPosture(provider: ProviderDef, capability: Capability, modalitiesStated: boolean): Capability {
  if (capability.kind !== "generation") {
    return capability;
  }
  if (provider.auth !== "endpoint") {
    // The estimated-turns relaxation is for the user's own server: a hosted route nobody measured keeps the
    // fail-closed floor, because its SDK or API refuses what the floor folds (a mid-history system row on Gemini).
    const { turnsEstimated: _localOnly, ...hosted } = capability.generation;
    return capability.generation.turnsEstimated === undefined ? capability : { kind: "generation", generation: hosted };
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
