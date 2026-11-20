// The capability READ helpers — the ONE spelling of every question a consumer asks a descriptor. A
// `capability.<axis>?.` re-spelled outside this file is a second home: every such copy migrates here so the
// SHAPE splice, the rpg fold-mount gate and the imagery edit belt read IDENTICAL facts.

import { windowReplyCeiling } from "@orb/kit/tokens";
import { z } from "zod";
import type { Modality } from "../modalities.ts";
import type { CapabilityRequirement } from "../tasks.ts";
import type { Wire } from "../wires.ts";
import type { Capability } from "./capability.ts";
import type { EmbeddingCapability } from "./embedding.ts";
import type {
  EstimableTurn,
  GenerationCapability,
  ReasoningOffMode,
  ReasoningReplayMode,
  RoleHandling,
  SamplerKnob,
  SamplerStage,
  UserRoleHandling,
} from "./generation.ts";
import {
  CACHE_MIN_FLOOR,
  REASONING_OFF_DEFAULT,
  REASONING_REPLAY_FLOOR,
  ROLE_HANDLING,
  SAMPLER_KNOBS,
  TERMINAL_SAMPLER_STAGES,
  TURNS_FLOOR,
  USER_ROLE_HANDLING,
} from "./generation.ts";
import type { RerankCapability } from "./rerank.ts";

/** The GENERATION half of a kind-discriminated `Capability`, or a throw: a chat-shaped read (the preset panel,
 *  the rpg lite gate) over a row that resolved an embedding/rerank model is a program error, not a user one. */
export function requireGenerationCapability(capability: Capability): GenerationCapability {
  if (capability.kind !== "generation") {
    throw new Error(`expected a generation capability, got ${capability.kind}`);
  }
  return capability.generation;
}

function accepts(capability: GenerationCapability, modality: Modality): boolean {
  return capability.input.includes(modality);
}

/** The least window a preset's Max context sets on a route that sends it: the smallest default any Ollama release
 *  runs, so a typo cannot shrink the server's window to nothing. A native row's `num_ctx` never goes below it. */
export const SETTABLE_WINDOW_FLOOR = 2048;

/** Where a token limit on a connection comes from: the server or catalog stated it, the user declared it, or no tier
 *  stated it and the kind floor's guess stands. */
export const LIMIT_SOURCES = ["reported", "override", "guessed"] as const;
export type LimitSource = (typeof LIMIT_SOURCES)[number];

/** The source of the model's max output. Only a stated source is a limit the model holds; a guess stops nothing. */
export function outputLimitSource(capability: GenerationCapability): LimitSource {
  const { maxTokensEstimated, maxTokensDeclared } = capability.output;
  if (maxTokensEstimated === true) {
    return "guessed";
  }
  return maxTokensDeclared === true ? "override" : "reported";
}

/** The source of the model's context window. A route that sends the window runs the trained maximum the server stated,
 *  so its ceiling is reported whatever the window itself was folded from. */
export function contextLimitSource(capability: GenerationCapability): LimitSource {
  const { windowEstimated, windowDeclared, settable } = capability.context;
  if (settable !== undefined) {
    return "reported";
  }
  if (windowEstimated === true) {
    return "guessed";
  }
  return windowDeclared === true ? "override" : "reported";
}

// Wires whose SDK grows the output cap by the thinking budget itself: @ai-sdk/anthropic sends
// `max_tokens = maxOutputTokens + budget_tokens` on `thinking.type: "enabled"`, so the funnel must not add it too.
export const WIRES_ADDING_THINKING_BUDGET: ReadonlySet<Wire> = new Set<Wire>(["anthropic-messages"]);

/** Does a request's max output cover the model's thinking as well as its reply on this wire? False on a model that
 *  cannot reason, and where the SDK adds a thinking budget beside the reply's cap, which only a budget-mode model on
 *  such a wire sends (an adaptive or effort-mode model's cap covers both). */
export function maxOutputCoversThinking(capability: GenerationCapability, wire: Wire): boolean {
  const { enabled, mode } = capability.reasoning;
  return enabled && !(mode === "budget" && WIRES_ADDING_THINKING_BUDGET.has(wire));
}

/** The max output a request is held under, or `undefined` when nothing the model stated holds it. A guessed cap never
 *  stops a preset's own number: a server that really stops sooner says so itself. A window the model or the user
 *  stated is a limit, though, so beside a guessed cap it still holds the reply to what leaves the prompt room
 *  ({@link windowReplyCeiling}). A guessed window holds nothing either. The funnel and the history fit both read this,
 *  so the reply sent and the reply reserved stay one value. */
export function outputCeilingOf(capability: GenerationCapability): number | undefined {
  if (outputLimitSource(capability) !== "guessed") {
    return capability.output.maxTokens.max;
  }
  return contextLimitSource(capability) === "guessed" ? undefined : windowReplyCeiling(capability.context.window);
}

/** The window a turn sends and budgets. On a route whose window the request sets, the preset's Max context tokens, at
 *  least {@link SETTABLE_WINDOW_FLOOR} and at most the model's trained maximum, and stated rather than estimated; it
 *  beats a declared window, because it is the per-chat choice of what that route sends. On a route whose window is a
 *  guess, the preset's Max context tokens is the window, because the user's number outranks a guess. Anywhere else, or
 *  with no preset window, the resolved one stands. */
export function windowForPreset(capability: GenerationCapability, maxContextTokens: number | undefined): GenerationCapability {
  if (maxContextTokens === undefined) {
    return capability;
  }
  const { settable, windowEstimated: guessed, windowDeclared: _declared, ...context } = capability.context;
  if (settable !== undefined) {
    return { ...capability, context: { window: Math.min(Math.max(maxContextTokens, SETTABLE_WINDOW_FLOOR), settable.max), settable } };
  }
  return guessed === true ? { ...capability, context: { ...context, window: maxContextTokens } } : capability;
}

export function acceptsImageInput(capability: GenerationCapability): boolean {
  return accepts(capability, "image");
}

export function acceptsVideoInput(capability: GenerationCapability): boolean {
  return accepts(capability, "video");
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

function roleHandlingFloorOf(capability: GenerationCapability): RoleHandling {
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
// already-narrowed remainder (`@typescript-eslint/no-unnecessary-condition`). Exhaustiveness is still compile-time: a fourth kind widens the tail's
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

// Every preset control a descriptor can rule out: each sampler, then the generation controls whose home is not the
// sampling block. `statesKnob` answers for each, so a new member fails `tsc` until it names its fact.
const CAPABILITY_KNOBS = [
  ...SAMPLER_KNOBS,
  "samplerOrder",
  "quality",
  "reasoning",
  "effort",
  "thinkingBudgetTokens",
  "thinkingDisplay",
  "reasoningSeed",
  "verbosity",
  "replyMedia",
  "carryReasoning",
  "parallelToolCalls",
  "providerContextCompression",
] as const;
export type CapabilityKnob = (typeof CAPABILITY_KNOBS)[number];

const STATED_CONTROL: Readonly<Record<Exclude<CapabilityKnob, SamplerKnob>, (capability: GenerationCapability) => boolean>> = {
  samplerOrder: (capability) => capability.sampling.samplerOrder !== undefined,
  // The dial feeds effort and temperature (`QUALITY_EFFORT`, `QUALITY_SAMPLING`), so it acts where either does.
  quality: (capability) => capability.reasoning.mode !== "none" || capability.sampling.temperature !== undefined,
  // The on/off switch: a model that cannot reason, or cannot stop reasoning, has nothing for it to change.
  reasoning: (capability) => capability.reasoning.mode !== "none" && capability.reasoning.mandatory !== true,
  // An adaptive model takes a level too; a budget model derives its budget from the budget control instead.
  effort: (capability) =>
    (capability.reasoning.mode === "effort" || capability.reasoning.mode === "adaptive") && (capability.reasoning.effortLevels?.length ?? 0) > 0,
  thinkingBudgetTokens: (capability) => capability.reasoning.mode === "budget" && capability.reasoning.budgetRange !== undefined,
  thinkingDisplay: (capability) => capability.reasoning.mode !== "none" && (capability.reasoning.displayModes?.length ?? 0) > 0,
  reasoningSeed: (capability) => capability.reasoning.mode !== "none" && capability.reasoning.seedable === true,
  verbosity: (capability) => (capability.verbosity?.length ?? 0) > 0,
  replyMedia: (capability) => capability.output.modalities.includes("image"),
  carryReasoning: (capability) => reasoningReplayOf(capability) !== "none",
  parallelToolCalls: (capability) => capability.tools !== undefined && honoursParallelControl(capability),
  providerContextCompression: (capability) => capability.contextCompression === true,
};

function isSamplerKnob(knob: CapabilityKnob): knob is SamplerKnob {
  return SAMPLER_KNOBS.some((sampler) => sampler === knob);
}

/** Can this preset control act on the model at all? The one home of the question (D68): the editor renders only a
 *  stated control, and a turn announces a drop only for one, so a control the provider cannot apply is neither shown
 *  nor named. */
export function statesKnob(capability: GenerationCapability, knob: CapabilityKnob): boolean {
  if (!isSamplerKnob(knob)) {
    return STATED_CONTROL[knob](capability);
  }
  const stated = capability.sampling[knob];
  return stated !== undefined && stated !== false;
}
