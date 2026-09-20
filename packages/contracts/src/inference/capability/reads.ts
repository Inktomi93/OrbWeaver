// The capability READ helpers — the ONE spelling of every question a consumer asks a descriptor. A
// `capability.<axis>?.` re-spelled outside this file is what the `inference-model-regex-fence` gate reds:
// the 13 direct re-spellings the M4 census found (`pipeline.ts:608,616,634,635`, `read.ts:1093-1101`, …)
// migrate here so the SHAPE splice, the rpg fold-mount gate and the imagery edit belt read IDENTICAL facts.

import type { Modality } from "../modalities.ts";
import type { CapabilityRequirement } from "../tasks.ts";
import type { Capability } from "./capability.ts";
import type { EmbeddingCapability } from "./embedding.ts";
import type { GenerationCapability, ReasoningReplayMode, RoleHandling } from "./generation.ts";
import { CACHE_MIN_FLOOR, REASONING_REPLAY_FLOOR, TURNS_FLOOR } from "./generation.ts";
import type { RerankCapability } from "./rerank.ts";

/** Does this generation model accept/produce a modality on the named side? */
/** The GENERATION half of a kind-discriminated `Capability`, or a throw: a chat-shaped read (the preset panel,
 *  the rpg lite gate) over a row that resolved an embedding/rerank model is a program error, not a user one. */
export function requireGenerationCapability(capability: Capability): GenerationCapability {
  if (capability.kind !== "generation") {
    throw new Error(`expected a generation capability, got ${capability.kind}`);
  }
  return capability.generation;
}

export function accepts(capability: GenerationCapability, side: "input" | "output", modality: Modality): boolean {
  return side === "input" ? capability.input.includes(modality) : capability.output.modalities.includes(modality);
}

export function acceptsImageInput(capability: GenerationCapability): boolean {
  return accepts(capability, "input", "image");
}

export function acceptsVideoInput(capability: GenerationCapability): boolean {
  return accepts(capability, "input", "video");
}

/** Accepts an init/reference image on the image-GENERATION call — distinct from `acceptsImageInput`. */
export function acceptsImageEdit(capability: GenerationCapability): boolean {
  return capability.imageEdit === true;
}

/** CAN this wire answer with prose AND tool calls in ONE completion? (`tools.silencesProse`, inverted;
 *  `false` when the model carries no `tools` axis at all.) The D112 fold-mount gate + the terminal-tools
 *  chat primitive read this and nothing else. */
export function coEmitsProseWithTools(capability: GenerationCapability): boolean {
  return capability.tools !== undefined && capability.tools.silencesProse !== true;
}

/** MAY this wire carry `system` rows INSIDE the delivered history? Absent `turns` ⇒ floor ⇒ false. */
export function acceptsHistorySystemRows(capability: GenerationCapability): boolean {
  return capability.turns?.historySystemRows === true;
}

/** MAY this wire continue a DELIVERED trailing-assistant row? The CAPABILITY half only — the assembler
 *  ANDs it with "no tools ride this turn", the transport with "the array actually ends on an assistant row". */
export function acceptsAssistantPrefill(capability: GenerationCapability): boolean {
  return capability.turns?.assistantPrefill === true;
}

/** WHAT MAY RIDE BACK when the carry knob replays this model's own prior thinking (§8.8). The ONE spelling
 *  of the question; absent ⇒ the fail-closed `none` rung, so an unmeasured wire is never handed a signed
 *  block it might reject. */
export function reasoningReplayOf(capability: GenerationCapability): ReasoningReplayMode {
  return capability.reasoning.replay ?? REASONING_REPLAY_FLOOR;
}

export function acceptsMidConversationSystem(capability: GenerationCapability): boolean {
  return capability.turns?.midConversationSystem === true;
}

export function roleHandlingFloorOf(capability: GenerationCapability): RoleHandling {
  return capability.turns?.roleHandlingFloor ?? TURNS_FLOOR.roleHandlingFloor;
}

export function cacheMinTokensOf(capability: GenerationCapability): number {
  return capability.turns?.cacheMinTokens ?? CACHE_MIN_FLOOR;
}

export function canEmbedImages(capability: EmbeddingCapability): boolean {
  return capability.input.includes("image");
}

/** The served precision a `(model[@dtype])` space tag folds in (`embedSpaceOf`) — the ONE place a resolved
 *  connection's capability is asked for its dtype axis, so every vector reader derives the identical tag.
 *  A non-embedding capability cannot reach a vector task's space, so it folds to "no dtype axis" rather than
 *  guessing a suffix. */
export function embedDtypeOf(capability: Capability): string | undefined {
  return capability.kind === "embedding" ? capability.embedding.dtype : undefined;
}

/** Does a vector model FIT the owner's space? Exact width, or a wider MRL model that truncates. A narrower
 *  model never fits — padding invents coordinates (#1635). */
export function fitsSpace(capability: EmbeddingCapability, dims: number): boolean {
  return capability.dims === dims || (capability.mrl && capability.dims > dims);
}

/** The requirement verdict — `{ ok: false, missing }` names each unmet clause in `axis:member` spelling so
 *  the picker can say "captioning needs image input" instead of failing at the wire. Never throws. */
export type RequirementVerdict = { readonly ok: true } | { readonly ok: false; readonly missing: readonly string[] };

export function requirementMet(capability: Capability, requires: CapabilityRequirement | undefined): RequirementVerdict {
  if (requires === undefined) {
    return { ok: true };
  }
  const missing = missingClauses(capability, requires);
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

// An if-chain with a BARE tail, not a `switch` and not a third `if`: biome cannot narrow a cross-module
// discriminated union inside a switch (every arm reads unreachable) and eslint refuses a third `if` on an
// already-narrowed remainder. Exhaustiveness is still compile-time: a fourth kind widens the tail's
// `capability` and `.rerank` stops existing on it, which is a tsc error at this line.
function missingClauses(capability: Capability, requires: CapabilityRequirement): readonly string[] {
  if (capability.kind === "generation") {
    return missingForGeneration(capability.generation, requires);
  }
  if (capability.kind === "embedding") {
    return missingForEmbedding(capability.embedding, requires);
  }
  return missingForRerank(capability.rerank, requires);
}

function missingModalities(have: readonly Modality[], want: readonly Modality[] | undefined, side: "input" | "output"): string[] {
  return (want ?? []).filter((modality) => !have.includes(modality)).map((modality) => `${side}:${modality}`);
}

/** The clauses only a generation model can satisfy; a vector/rerank model asked for one is the wrong KIND. */
function wantsGeneration(requires: CapabilityRequirement): boolean {
  return requires.output !== undefined || requires.tools === true || requires.structured === true;
}

function missingForGeneration(cap: GenerationCapability, requires: CapabilityRequirement): string[] {
  const missing = [...missingModalities(cap.input, requires.input, "input"), ...missingModalities(cap.output.modalities, requires.output, "output")];
  if (requires.tools === true && cap.tools === undefined) {
    missing.push("tools");
  }
  if (requires.structured === true && cap.output.structured !== true) {
    missing.push("structured");
  }
  if (requires.dims !== undefined) {
    missing.push(`dims:${requires.dims}`);
  }
  return missing;
}

function missingForEmbedding(cap: EmbeddingCapability, requires: CapabilityRequirement): string[] {
  const missing = missingModalities(cap.input, requires.input, "input");
  if (requires.dims !== undefined && !fitsSpace(cap, requires.dims)) {
    missing.push(`dims:${requires.dims}`);
  }
  if (wantsGeneration(requires)) {
    missing.push("kind:generation");
  }
  return missing;
}

function missingForRerank(cap: RerankCapability, requires: CapabilityRequirement): string[] {
  const missing = missingModalities(cap.input, requires.input, "input");
  if (wantsGeneration(requires) || requires.dims !== undefined) {
    missing.push("kind:generation");
  }
  return missing;
}
