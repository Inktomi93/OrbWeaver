// The capability READ helpers — the ONE spelling of every question a consumer asks a descriptor. A
// `capability.<axis>?.` re-spelled outside this file is what the `inference-model-regex-fence` gate reds:
// the 13 direct re-spellings the M4 census found (`pipeline.ts:608,616,634,635`, `read.ts:1093-1101`, …)
// migrate here so the SHAPE splice, the rpg fold-mount gate and the imagery edit belt read IDENTICAL facts.

import { z } from "zod";
import type { Modality } from "../modalities.ts";
import type { CapabilityRequirement } from "../tasks.ts";
import type { Capability } from "./capability.ts";
import type { EmbeddingCapability } from "./embedding.ts";
import type { EstimableTurn, GenerationCapability, ReasoningOffMode, ReasoningReplayMode, RoleHandling, SamplerStage, UserRoleHandling } from "./generation.ts";
import {
  CACHE_MIN_FLOOR,
  REASONING_OFF_DEFAULT,
  REASONING_REPLAY_FLOOR,
  ROLE_HANDLING,
  TERMINAL_SAMPLER_STAGES,
  TURNS_FLOOR,
  USER_ROLE_HANDLING,
} from "./generation.ts";
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

/** The least window a preset's Max context sets on a route that sends it: the smallest default any Ollama release
 *  runs, so a typo cannot shrink the server's window to nothing. */
export const SETTABLE_WINDOW_FLOOR = 2048;

/** The window a turn sends and budgets: on a route whose window the request sets, the preset's Max context tokens,
 *  at least {@link SETTABLE_WINDOW_FLOOR} and at most the model's trained maximum, and stated rather than estimated.
 *  It beats a declared window, because it is the per-chat choice of what that route sends. Anywhere else, or with no
 *  preset window, the resolved one stands. */
export function windowForPreset(capability: GenerationCapability, maxContextTokens: number | undefined): GenerationCapability {
  const settable = capability.context.settable;
  if (settable === undefined || maxContextTokens === undefined) {
    return capability;
  }
  return { ...capability, context: { window: Math.min(Math.max(maxContextTokens, SETTABLE_WINDOW_FLOOR), settable.max), settable } };
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

/** MAY a request force SOME tool call (`required`)? `tools.requiredChoice`, absent ⇒ true — the refusal is a
 *  documented per-model or per-server fact, never the default (the field's own doc says why). The wire's
 *  downgrade to `auto` reads this and nothing else. */
export function acceptsRequiredToolChoice(capability: GenerationCapability): boolean {
  return capability.tools?.requiredChoice !== false;
}

/** MAY a request force ONE NAMED tool? `tools.namedChoice`, absent ⇒ true. The wire's downgrade and the
 *  structured-vehicle choice (the forced-tool vehicle names its tool) read this and nothing else. */
export function acceptsNamedToolChoice(capability: GenerationCapability): boolean {
  return capability.tools?.namedChoice !== false;
}

/** MAY a request tell the model to call NO tool (`none`)? `tools.noneChoice`, absent ⇒ true. The structured plan
 *  withdraws the offered tools where it cannot. */
export function acceptsNoneToolChoice(capability: GenerationCapability): boolean {
  return capability.tools?.noneChoice !== false;
}

/** Does a request's `parallel_tool_calls: false` reach the model? `tools.parallelControl`, absent ⇒ true. */
export function honoursParallelControl(capability: GenerationCapability): boolean {
  return capability.tools?.parallelControl !== false;
}

/** Whether a `turns` cell holds the floor's guess because no evidence tier stated it. */
export function isTurnEstimated(capability: GenerationCapability, cell: EstimableTurn): boolean {
  return capability.turnsEstimated?.includes(cell) === true;
}

/** MAY this wire carry `system` rows INSIDE the delivered history? Absent `turns` ⇒ floor ⇒ false. */
export function acceptsHistorySystemRows(capability: GenerationCapability): boolean {
  return capability.turns?.historySystemRows === true;
}

/** MAY this wire continue a DELIVERED trailing-assistant row? The CAPABILITY half only — the assembler
 *  ANDs it with "no tools ride this turn", the transport with "the array actually ends on an assistant row".
 *  An estimated cell (no tier measured it) does not block the user's continue: the server is the judge. */
export function acceptsAssistantPrefill(capability: GenerationCapability): boolean {
  return capability.turns?.assistantPrefill === true || isTurnEstimated(capability, "assistantPrefill");
}

/** WHAT MAY RIDE BACK when the carry knob replays this model's own prior thinking (§8.8). The ONE spelling
 *  of the question; absent ⇒ the fail-closed `none` rung, so an unmeasured wire is never handed a signed
 *  block it might reject. */
export function reasoningReplayOf(capability: GenerationCapability): ReasoningReplayMode {
  return capability.reasoning.replay ?? REASONING_REPLAY_FLOOR;
}

/** How this model turns reasoning off (`reasoning.offMode`). Absent ⇒ {@link REASONING_OFF_DEFAULT}. */
export function reasoningOffModeOf(capability: GenerationCapability): ReasoningOffMode {
  return capability.reasoning.offMode ?? REASONING_OFF_DEFAULT;
}

/** Is a replayed thinking block valid only while everything before it is unchanged (`reasoning.prefixBound`)?
 *  Absent ⇒ false: the model accepts an edited prefix. */
export function bindsThinkingToPrefix(capability: GenerationCapability): boolean {
  return capability.reasoning.prefixBound === true;
}

/** Can a prefix edit before a carried thinking block NOT fail the turn on this route (`reasoning.prefixEditSafe`)?
 *  Absent ⇒ false: the route may send a stale block the API refuses. */
export function survivesPrefixEdit(capability: GenerationCapability): boolean {
  return capability.reasoning.prefixEditSafe === true;
}

/** MAY a mid-conversation system row carry `clearAt: "next_user_message"` on this wire (`turns.clearAt`)? */
export function acceptsTurnScopedSystem(capability: GenerationCapability): boolean {
  return capability.turns?.clearAt === true;
}

export function acceptsMidConversationSystem(capability: GenerationCapability): boolean {
  return capability.turns?.midConversationSystem === true;
}

export function roleHandlingFloorOf(capability: GenerationCapability): RoleHandling {
  return capability.turns?.roleHandlingFloor ?? TURNS_FLOOR.roleHandlingFloor;
}

/** Is `level` stricter than `than`? The tuple order of {@link ROLE_HANDLING} is the strictness order. */
export function isStricterRoleHandling(level: RoleHandling, than: RoleHandling): boolean {
  return ROLE_HANDLING.indexOf(level) > ROLE_HANDLING.indexOf(than);
}

/** The level a turn runs: the stricter of the model floor and the preset knob. An unset knob runs the floor. */
export function clampRoleHandling(floor: RoleHandling, knob: RoleHandling | undefined): RoleHandling {
  return knob !== undefined && isStricterRoleHandling(knob, floor) ? knob : floor;
}

/** What a turn's message handling runs on for this model and the preset's knob. A STATED floor clamps the knob
 *  (stricter only) and the stated system-row cells gate delivery. An ESTIMATED floor (no tier measured this
 *  model) clamps nothing: the knob runs as chosen, an unset knob still runs the fail-closed floor, and the
 *  level alone decides where a system row may sit. The returned floor is what the assembler clamps against. */
export function turnsLevelFor(
  capability: GenerationCapability,
  knob: RoleHandling | undefined,
): { readonly roleHandlingFloor: RoleHandling; readonly midConversationSystem: boolean; readonly historySystemRows: boolean } {
  const floor = roleHandlingFloorOf(capability);
  return {
    roleHandlingFloor: isTurnEstimated(capability, "roleHandlingFloor") ? (knob ?? floor) : floor,
    midConversationSystem: acceptsMidConversationSystem(capability) || isTurnEstimated(capability, "midConversationSystem"),
    historySystemRows: acceptsHistorySystemRows(capability) || isTurnEstimated(capability, "historySystemRows"),
  };
}

/** The preset-knob levels a model with this floor can actually run: the user levels at or above it. */
export function userRoleHandlingOptions(floor: RoleHandling): readonly UserRoleHandling[] {
  return USER_ROLE_HANDLING.filter((level) => !isStricterRoleHandling(floor, level));
}

export function cacheMinTokensOf(capability: GenerationCapability): number {
  return capability.turns?.cacheMinTokens ?? CACHE_MIN_FLOOR;
}

export function canEmbedImages(capability: EmbeddingCapability): boolean {
  return capability.input.includes("image");
}

/** THE JOINT-SPACE RULE'S READ (§10-3): may this resolved capability produce IMAGE vectors at all?
 *  `null` (the task has no connection bound), a non-embedding kind, or an embedder that does not take an
 *  `image` input all answer `false` — and `false` is not an error, it is the signal to fall back to the
 *  CAPTIONED-TEXT lens in the `embed` space. `embed` and `imageEmbed` are one model or `imageEmbed` falls
 *  to the caption (§6.7); this is the one spelling of that question, so the indexer's write arm and
 *  search's read arm cannot disagree about which space an owner's pictures live in. */
export function servesImageVectors(capability: Capability | null): boolean {
  return capability !== null && capability.kind === "embedding" && canEmbedImages(capability.embedding);
}

/** The served precision a `(model[@dtype])` space tag folds in (`embedSpaceOf`) — the ONE place a resolved
 *  connection's capability is asked for its dtype axis, so every vector reader derives the identical tag.
 *  A non-embedding capability cannot reach a vector task's space, so it folds to "no dtype axis" rather than
 *  guessing a suffix. */
export function embedDtypeOf(capability: Capability): string | undefined {
  return capability.kind === "embedding" ? capability.embedding.dtype : undefined;
}

/** The width of the vectors a resolved connection writes — the owner's space width, taken from the bound
 *  embedder rather than fixed by the deployment. `undefined` for a non-embedding capability, which has no space. */
export function embedDimsOf(capability: Capability): number | undefined {
  return capability.kind === "embedding" ? capability.embedding.dims : undefined;
}

/** The requirement verdict — `{ ok: false, missing }` names each unmet clause in `axis:member` spelling so
 *  the picker can say "captioning needs image input" instead of failing at the wire. Never throws. */
export type RequirementVerdict = { readonly ok: true } | { readonly ok: false; readonly missing: readonly string[] };
export const requirementVerdictSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), missing: z.array(z.string()).readonly() }),
]) satisfies z.ZodType<RequirementVerdict>;

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
  return missing;
}

function missingForEmbedding(cap: EmbeddingCapability, requires: CapabilityRequirement): string[] {
  const missing = missingModalities(cap.input, requires.input, "input");
  if (wantsGeneration(requires)) {
    missing.push("kind:generation");
  }
  return missing;
}

function missingForRerank(cap: RerankCapability, requires: CapabilityRequirement): string[] {
  const missing = missingModalities(cap.input, requires.input, "input");
  if (wantsGeneration(requires)) {
    missing.push("kind:generation");
  }
  return missing;
}

/** The order a server runs for a preset's `samplerOrder` (D295): the preset's stages this server orders, in
 *  the preset's order, then the server's other stages in its own default order, so a preset written against
 *  another server never switches a sampler off. A stage that picks the token ({@link TERMINAL_SAMPLER_STAGES}) runs
 *  last wherever the preset put it. The funnel sends it and the editor shows it. */
export function completeSamplerOrder(wanted: readonly SamplerStage[] | undefined, orderable: readonly SamplerStage[]): readonly SamplerStage[] {
  const movable = orderable.filter((stage) => !TERMINAL_SAMPLER_STAGES.includes(stage));
  const kept = (wanted ?? []).filter((stage) => movable.includes(stage));
  return [...kept, ...movable.filter((stage) => !kept.includes(stage)), ...orderable.filter((stage) => TERMINAL_SAMPLER_STAGES.includes(stage))];
}
