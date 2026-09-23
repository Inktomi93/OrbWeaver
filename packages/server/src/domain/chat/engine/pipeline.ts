// The per-turn execution pipeline: pure orchestration of injected ops (no db/credentials/backend touch). It
// builds a TurnRequest from the assembly producer's output + SHAPE, calls the injected runChatTurn role,
// reduces the stream, and applies the history-budget fit. Returns a result the engine lifecycle persists.
//
// Order (read top to bottom in runTurnPipeline): BUILD (assemblePrompt) → SHAPE (string history + cache
// breakpoint) → CONVERT (the §3.5 wire plane: string bodies → content-parts) → FIT (history-budget tail,
// priced against the CONVERTED rows) → REQUEST (assemble the TurnRequest) → REDUCE (iterate runChatTurn,
// fan deltas, fold economics, then the tool-recurse loop on finishReason:"tool" up to toolRecurseLimit).
//
// CONVERT PRECEDES FIT (#1434) and that order is load-bearing: the conversion is LOSSY on purpose (cards
// collapse to a stub, choices drop, display-only images become a marker), so fitting the pre-conversion
// bytes charged the budget for content the provider never receives — evicting real turns to make room for
// deleted ones, and overstating `fitUsedTokens`, which is the managed-compaction trigger.
//
// CONVERT ITSELF LIVES IN `substrate/wire-history.ts` (#1540), not here: the read verb's preview family
// (`previewContextFit`, `previewAssembly`) has to price the SAME converted rows this turn prices, or the
// transcript divider claims rows are out of context that the turn keeps. This file owns the ORDER; that
// module owns the conversion and the cost rule.
//
// Single-speaker core: output is pinned per-speaker/merged (no narrator, no scoped egocentric fold); the
// arbitration/auto-mode chunk extends this via the `shape` argument.

import type {
  AssembleContext,
  AssembledPrompt,
  AssemblePersona,
  ChatContentPart,
  ChatDeltaEvent,
  ChatInjection,
  ChatReasoningPart,
  MessageView,
  ToolCallRecord,
} from "@orb/contracts/chat";
import {
  acceptsAssistantPrefill,
  acceptsHistorySystemRows,
  acceptsImageInput,
  acceptsMidConversationSystem,
  acceptsVideoInput,
  coEmitsProseWithTools,
  roleHandlingFloorOf,
} from "@orb/contracts/inference";
import type { CarryReasoning, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_NAMES_BEHAVIOR } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ChatToolExecution, ChatToolOffer, GeneratedImage, Resolved, ResolvedWarning, ToolCallInput, WireTool } from "@orb/inference";
import { generationOf, resolveCarryReasoning } from "@orb/inference";
import type { ContentImageRef } from "@orb/kit/content";
import type { AssetId, CharacterId, ChatId, MessageId, PersonaId, WorldEntryId } from "@orb/kit/ids";
import type { MacroRegistry, RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { executeRegexScripts } from "@orb/kit/regex";
import { cleanPerSpeakerReply } from "@orb/kit/speaker-label";
import { estimateTokens } from "@orb/kit/tokens";
import { applyReceivePostProcess } from "@orb/server/kit/post-process";
import { parseReasoningTags } from "@orb/server/kit/reasoning";
import { getLog } from "#foundation/observability";
import type { ApplyPromptTransformsOp, ApplyRegexReplaceOp, BoundToolExecution, ChatToolExecFrame, ChatToolOps, RunChatTurnOp } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { PromptHistoryRegexEnv } from "../contract/regex.ts";
import type {
  HistoryMacroNames,
  ResolvedMediaRef,
  TurnEconomics,
  TurnKind,
  TurnMessage,
  TurnRequest,
  TurnSpeakerShape,
  TurnStreamChunk,
} from "../contract/results.ts";
import {
  buildHistoryBudget,
  buildPrompt,
  buildTurnMacroContext,
  fitHistory,
  materializeOutputReserve,
  shapeContextForSpeaker,
  shapeTurn,
  speakerCue,
  toShapeCanon,
  voiceContextForSpeaker,
} from "../substrate/assembly-access.ts";
import { buildWireHistory, convertsToEmptyWireRow, dropEmptyWireRows, keepNewChatMarkerAtHead, wireCostRows } from "../substrate/wire-history.ts";

/** What `runTurnPipeline` consumes — the immutable assemble ctx + the loaded canon + the resolved connection
 *  + the turn axes. Stays UNEXPORTED (`no-inline-types`: an exported type belongs in `contract/`, and this is
 *  a pipeline-internal argument shape, not a domain contract). The engine's prose-less RECOVERY pass names it
 *  as `Parameters<typeof runTurnPipeline>[0]` — the same derive-from-the-function pattern `engine.ts` already
 *  uses for the RESULT (`Awaited<ReturnType<typeof runTurnPipeline>>`), so there is exactly one definition. */
interface RunTurnPipelineArgs {
  readonly runChatTurn: RunChatTurnOp;
  /** The turn's clock (`ChatContext.now`) — the pipeline's ONE time source, used to measure the reasoning
   *  stream window. Injected, never ambient: no `Date.now()` in a verb (determinism law). */
  readonly now: () => number;
  readonly applyRegexReplace: ApplyRegexReplaceOp;
  /** Resolves a parsed message-image ref → a model-fetchable URL + its media kind, or null to drop it. */
  readonly resolveImageUrl: (ref: ContentImageRef) => Promise<ResolvedMediaRef | null>;
  /** §8.8's `conversation` carry source: this chat's persisted replayable thinking, keyed by canon slot id.
   *  Injected (the domain holds no db handle) and LAZY — called only when the resolved rung is
   *  `conversation`, so a turn that carries nothing performs no read. */
  readonly loadReasoningParts: () => Promise<ReadonlyMap<MessageId, readonly ChatReasoningPart[]>>;
  /** §6.7's INLINE-REPLY ORIGIN SET: for each canon slot of THIS chat, the asset ids whose `message_assets`
   *  link says the model emitted that picture inside that slot's own generation. It is the sole thing that
   *  lets `substrate/wire-history` ride an assistant row's picture back as an image part — an `/imagine`
   *  illustration on the same row class is stamped `illustration` and stays display-only. Injected (the
   *  domain holds no db handle) and LAZY, exactly like the carry source: CONVERT asks only when some
   *  assistant row actually carries an `asset:` span. */
  readonly loadInlineReplyAssetIds: () => Promise<ReadonlyMap<MessageId, ReadonlySet<AssetId>>>;
  /** The immutable assemble ctx (never mutated here). */
  readonly assembleContext: AssembleContext;
  readonly canon: readonly MessageView[];
  readonly connection: Resolved<"chat">;
  readonly intent: UserIntent;
  /** The host's `UserSettings.chat.customStoppingStrings` (PD-146), folded into the request's stop set
   *  (Set-deduped after the intent's own stops). Absent/empty ⇒ the request `intent` is untouched. */
  readonly extraStopSequences?: readonly string[] | undefined;
  readonly kind: TurnKind;
  readonly chatId: ChatId;
  /** A synthetic trailing user turn (regen/continue); null for a plain send. */
  readonly appendUserTurn?: string | null | undefined;
  /** `true` ⇒ {@link RunTurnPipelineArgs.appendUserTurn} is the CONTINUATION FALLBACK (the continue verb's
   *  nudge), kept only for wires that cannot continue a delivered assistant row — dropped here when this turn's
   *  prefill verdict is honored, so a continue delivers the partial row for the model to extend. See
   *  `TurnPrep.appendUserTurnIsContinuationFallback`. */
  readonly appendUserTurnIsContinuationFallback?: boolean | undefined;
  readonly groupNudge?: string | null | undefined;
  /** The per-speaker two-axis SHAPE, set by the group round driver. Absent falls back to the
   *  single-speaker core's pinned default (per-speaker/merged/no fold). */
  readonly shape?: TurnSpeakerShape | undefined;
  /** Fans one streamed delta out. Fire-and-forget — not on the durable-await path. */
  readonly onDelta: (delta: ChatDeltaEvent) => void;
  readonly signal?: AbortSignal | undefined;
  /** Null means tool-use unwired (the byte-identical no-op). */
  readonly tools: ChatToolOps | null;
  /** Empty means no tools ride. */
  readonly attachedToolNames: readonly string[];
  /** TERMINAL wire tools for this turn (the R1 folded-extraction seam) — attached with `tool_choice:"auto"`
   *  and NEVER resolved/executed/recursed on. Their co-emitted calls come back on
   *  {@link TurnPipelineResult.terminalToolCalls}. Absent/empty ⇒ byte-identical to today (every turn but a
   *  folded-mode game's character turn). Today's gather contributes these OR `attachedToolNames`, never both —
   *  but that is a CALLER's habit, not an invariant, so the two classes are partitioned by tool NAME at
   *  {@link attachTerminalTools} and every reader downstream is blind to the other class (#1404). */
  readonly terminalTools?: readonly WireTool[] | undefined;
  /** A structured-output request for this turn (D79). Absent on every turn today — the chat loop sets `tools`,
   *  never `responseFormat` (mutually exclusive by construction, 04 §8); a future structured chat consumer
   *  (agents CW2) sets it, and the gate below drops+warns when the model can't honor it. */
  readonly responseFormat?: ResponseFormat | undefined;
  readonly toolRecurseLimit: number;
  /** The principal-blind identity frame `executeToolCalls` receives. */
  readonly toolExecFrame: ChatToolExecFrame;
  /** The D50 PromptTransform apply op — applied at the `assembled_dynamic` point (end of BUILD, over
   *  the dynamic half only). Null/absent (unwired / no registrar) ⇒ the dynamic half passes through
   *  byte-identical (the engine threads `ChatContext.promptTransforms` straight through, `null` and all). */
  readonly applyPromptTransforms?: ApplyPromptTransformsOp | null | undefined;
  /** The per-chat macro name producer `toShapeCanon` resolves each history row's own macro stamps
   *  against; absent means empty maps (every row falls through to its speaker-default floor). */
  readonly historyMacroNames?: HistoryMacroNames | undefined;
  /** The per-turn user-macro RENDER registry (WAVE MU) — the BUILD section walk + the RECEIVE
   *  AI_OUTPUT/REASONING macro pass resolve user macros against it; absent ⇒ the process `globalMacroRegistry`
   *  (byte-identical). Closures — rides `TurnPrep`, never the serializable `AssembleContext`. */
  readonly macroRegistry?: MacroRegistry | undefined;
  /** The M2 keep-last-X card knob (parity-plus §3.5): the X most-recent card spans in the fitted history
   *  ride the wire FULL; every older card collapses to the deterministic `[card: title]` stub. ABSENT ≠ ZERO:
   *  absent ⇒ NO window (nothing contributed one — see {@link resolveFullCards}); `0` ⇒ immediate total
   *  collapse (the cache/budget-honest rpg default). Wired from the game config; the mechanism is
   *  feature-agnostic. */
  readonly cardKeepLastX?: number | undefined;
}

/** The wire speaker name for the human side of the turn — SHAPE's `speakers.user`, and (post-IMP-1) the
 *  self-label an impersonate draft is stripped of, so both act on exactly the same name. A personaless chat
 *  falls back to the shared `"User"` floor. */
function userSpeakerName(persona: AssemblePersona | null | undefined): string {
  return persona === null || persona === undefined ? "User" : persona.name;
}

/** The historyMacroNames default when a caller supplies none — every row falls through to its own
 *  speaker-default/active-persona floor. */
const EMPTY_HISTORY_MACRO_NAMES: HistoryMacroNames = {
  characterNamesById: new Map<CharacterId, RowCharacterName>(),
  personaNamesById: new Map<PersonaId, RowPersonaName>(),
};

/** What the CONVERT seam gets when the §8.8 carry rung is below `conversation`: nothing to materialize, and
 *  no read performed to learn that. */
const EMPTY_REASONING_BY_MESSAGE: ReadonlyMap<MessageId, readonly ChatReasoningPart[]> = new Map<MessageId, readonly ChatReasoningPart[]>([]);

/** The pipeline product the engine persists — the reduced generation + the request + the fit offset. */
interface TurnPipelineResult {
  readonly request: TurnRequest;
  readonly content: string;
  readonly reasoning: string | null;
  /** The measured REASONING WINDOW in ms, summed over recursion depths — the live producer for
   *  `message_variants.metadata.$.reasoning_duration` (#184), which the stats rollups read as `reasoningMs`.
   *  Null ⇒ the turn never reasoned (or the window had no positive width): absence, never a fabricated 0.
   *  See {@link reasoningClock} for exactly which window this is and why. */
  readonly reasoningMs: number | null;
  readonly economics: TurnEconomics | null;
  readonly cacheBreakpointFromEnd: number | null;
  readonly droppedCount: number;
  /** True when ≥1 USER-ATTACHED image part was dropped because the model lacks vision (or its asset no longer
   *  resolves). A display-only image (a card's greeting picture, narrator media) is NOT a drop — it was never
   *  eligible to ride, so it must not raise the `image_dropped` warning. */
  readonly imageDropped: boolean;
  /** The video twin (#317): ≥1 USER-ATTACHED video (mp4/webm/animated-gif asset) was dropped because the
   *  model lacks `input.video`. Same eligibility rule as {@link TurnPipelineResult.imageDropped}. */
  readonly videoDropped: boolean;
  /** The turn's cumulative tool exchange across every recursion depth. */
  readonly toolRecords: readonly ToolCallRecord[];
  /** §6.7 — the pictures the model emitted inside its own prose this turn, in arrival order, each carrying
   *  the (depth-rebased) reply offset it arrived at. RAW provider payloads: the engine materializes them
   *  through the SSRF-safe belt, stores them under the room HOST, splices the `![alt](asset:id)` spans and
   *  writes the `origin:"inline-reply"` links. Empty on every text-only turn, which is every turn whose
   *  preset did not ask for `replyMedia: "text+image"` on a model that produces images. */
  readonly replyImages: readonly GeneratedImage[];
  /** The calls the TERMINAL tools (R1) drew off this completion, or `null` when there is NO usable channel —
   *  the tools didn't ride (none requested / the connection can't carry wire `tools[]`), or the turn produced
   *  no terminal economics at all. An EMPTY array is the honest "they rode, the wire answered, and the model
   *  called nothing" — a quiet beat, distinct from `null`'s "run your own fallback". These are deliberately NOT
   *  folded into `toolRecords`: they were never executed, so a record would be a lie, and they must never reach
   *  a member-visible payload. */
  readonly terminalToolCalls: readonly ToolCallInput[] | null;
  /** The terminal tool NAMES that collided with a registry tool name and therefore never rode (#1617) — empty
   *  on every ordinary turn. A collision makes the whole terminal channel unusable for this turn
   *  (`terminalToolCalls` is `null`), and this is the only thing that says WHY: the consumer's fallback would
   *  otherwise report "this wire cannot carry terminal tools", which is false — the wire was fine and a
   *  contributor re-spelled a name. Names, not a count, because the fix is per-declaration. */
  readonly terminalToolsCollided: readonly string[];
  /** True when tools were attached but the model's capability lacks tools support (ran tool-less). */
  readonly toolsUnsupported: boolean;
  /** True when a `responseFormat` was requested but the model's `capability.output.structured` isn't true →
   *  the field was dropped and the turn proceeded free-text (D79 interactive-axis degrade, 04 §7). */
  readonly structuredOutputUnsupported: boolean;
  /** The WI entries that fired this turn (budget-survived). */
  readonly worldInfoEntryIds: readonly WorldEntryId[];
  /** True when a `system`-placement guided steer fell back to a depth-0 injection (marker absent/disabled;
   *  §10 addendum / F8) — the engine emits `guided_placed_as_injection` off this. */
  readonly guidedPlacedAsInjection: boolean;
  /** The INFRA-originated honest-degrade codes this turn's runner raised (resolve/wire drops — D41), deduped
   *  across recursion depths and still in the INFRA vocabulary — the engine narrows them to chat's own bus
   *  warnings (`toChatWarning`) and emits one `warning` event per surfaced degrade. Distinct from the boolean
   *  capability-drop flags above: those are the DOMAIN's own gates, these are the runner's. */
  readonly runnerWarnings: readonly ResolvedWarning[];
  /** True when ANY depth of this turn came back as a provider REFUSAL (a content-filter finish) — the engine
   *  emits `provider_refused` off it. A boolean like the capability-drop flags beside it, not a list: one
   *  turn's author is owed one notice, and the refusal's provider-side detail is not carryable to the bus. */
  readonly providerRefused: boolean;
  /** The id of the earliest message actually included in the assembled history this turn, or null. */
  readonly contextBoundaryMessageId: MessageId | null;
  /** The turn's TOTAL estimated context consumption (kept history + system prompt + reserved output) — the
   *  managed-compaction trigger reads this against `fitCeilingTokens` to decide whether usage crossed the
   *  threshold (mirrors what the fit reserved, so "85% used" means the same thing to both). */
  readonly fitUsedTokens: number;
  /** The effective context ceiling the fit resolved against (`min(window, maxContextTokens)`), or null when
   *  neither is finite (no trustworthy ceiling ⇒ managed compaction can't threshold ⇒ fit-drop only). */
  readonly fitCeilingTokens: number | null;
}

/** The history-budget reserve: the model window (soft-capped by the user's `maxContextTokens`), reserving
 *  the EFFECTIVE intent's output budget + the assembled system tokens. `intent.maxOutputTokens` is already
 *  MATERIALIZED to a concrete number by `runTurnPipeline` (never undefined here), so `reserveOutputTokens`
 *  is the SAME value the runner sends as wire `max_tokens` — the two-source divergence that dropped all
 *  history is closed. It must NOT fall back to `capability.output.maxTokens.max` (the slider ceiling / on a
 *  self-hosted vLLM the whole window), which reserved the entire context and starved history (amnesia). */
function fitBudget(args: RunTurnPipelineArgs, intent: UserIntent, systemTokens: number): ReturnType<typeof buildHistoryBudget> {
  return buildHistoryBudget({
    windowTokens: generationOf(args.connection).context.window,
    // Context Size (ST `openai_max_context`): the user's soft ceiling. Unset ⇒ undefined ⇒ the fit's
    // `min(window, ∞)` resolves to the window, so context length and window line up by default.
    maxContextTokens: intent.maxContextTokens,
    // Materialized in `buildHistoryBudget` to a concrete response length, mirroring the runner's `max_tokens`.
    maxOutputTokens: intent.maxOutputTokens,
    systemTokens,
  });
}

/**
 * THE REASONING WINDOW (#184). `message_variants.metadata.$.reasoning_duration` had exactly one producer —
 * the SillyTavern import — while three live readers rolled it into `reasoning_ms` on three stats tables, so a
 * user's own reasoning-heavy turns were worth 0ms in their own stats and every rendered number was
 * archaeology. Nothing upstream reports the figure: OpenAI-compatible wires carry reasoning as DELTAS and no
 * backend sends a duration, so the only honest source is what the engine can WATCH.
 *
 * WHAT IS MEASURED: first reasoning delta → the moment the model starts answering (the first TEXT delta after
 * reasoning began), or the last reasoning delta when the stream never turns to prose. Deliberately NOT
 * turn-start → first-answer-token: that window also contains queueing, prefill and network, none of which is
 * thinking. A window that never closes above 0ms yields `null` (a single instant is not a duration) — absence
 * over a fabricated zero, the same posture the economics fields take.
 *
 * ONE-SHOT PER STREAM: once the answer starts, later reasoning deltas at the SAME depth do not reopen the
 * window (they belong to a continuation the wire does not distinguish); a tool-recursion's next depth gets its
 * own clock and the depths SUM, exactly as tokens do.
 */
function reasoningClock(now: () => number): {
  readonly onReasoningDelta: () => void;
  readonly onAnswerDelta: () => void;
  readonly elapsedMs: () => number | null;
} {
  let startedAt: number | null = null;
  let endedAt: number | null = null;
  let closed = false;
  return {
    onReasoningDelta: (): void => {
      if (closed) {
        return;
      }
      const t = now();
      startedAt ??= t;
      endedAt = t;
    },
    onAnswerDelta: (): void => {
      if (closed || startedAt === null) {
        return;
      }
      endedAt = now();
      closed = true;
    },
    elapsedMs: (): number | null => {
      if (startedAt === null || endedAt === null) {
        return null;
      }
      const span = Math.round(endedAt - startedAt);
      return span > 0 ? span : null;
    },
  };
}

/** Drains the role's stream: text/reasoning deltas accumulate + fan out; the out-of-band `warning` chunks
 *  collect for the engine's bus emit (D41 — the runner's honest-degrade codes, still in the infra vocabulary;
 *  the engine narrows them to chat's own); the terminal final chunk yields economics. The runner's
 *  final.content/reasoning (when given) are authoritative; accumulated deltas fall back. */
async function reduceStream(
  stream: AsyncIterable<{ kind: string }>,
  args: RunTurnPipelineArgs,
): Promise<{
  content: string;
  reasoning: string | null;
  economics: TurnEconomics | null;
  warnings: readonly ResolvedWarning[];
  refused: boolean;
  reasoningMs: number | null;
}> {
  let text = "";
  let reasoning = "";
  let economics: TurnEconomics | null = null;
  let refused = false;
  const warnings: ResolvedWarning[] = [];
  const clock = reasoningClock(args.now);
  for await (const chunk of stream as AsyncIterable<TurnStreamChunk>) {
    if (chunk.kind === "text") {
      clock.onAnswerDelta();
      text += chunk.text;
      args.onDelta({ chatId: args.chatId, kind: "text", text: chunk.text });
    } else if (chunk.kind === "reasoning") {
      clock.onReasoningDelta();
      reasoning += chunk.text;
      args.onDelta({ chatId: args.chatId, kind: "reasoning", text: chunk.text });
    } else if (chunk.kind === "warning") {
      const { kind: _kind, ...warning } = chunk;
      warnings.push(warning);
    } else if (chunk.kind === "refusal") {
      refused = true;
    } else {
      economics = chunk.economics;
    }
  }
  const content = economics?.content ?? text;
  const finalReasoning = economics?.reasoning ?? (reasoning.length > 0 ? reasoning : null);
  return { content, reasoning: finalReasoning, economics, warnings, refused, reasoningMs: clock.elapsedMs() };
}

/** Strips a per-speaker canon row down to only its own speaker's content: removes a leaked leading
 *  self-label and truncates any drift into a foreign seated character's line. Applied only on the per-speaker
 *  output path; merged/narrator output is left alone (its labels are the intended transcript).
 *
 *  IMP-1 layer 2b — WHO IS "SELF" DEPENDS ON THE TURN. An `impersonate` draft is the USER's next line, so
 *  the self is the PERSONA and every seated character is foreign. Running the assistant-turn configuration on it
 *  (self = the character, as the `shape`-less fallback did) inverts both halves: it quietly STRIPPED a
 *  leading `Seren:` off a line Seren had written and handed the character's words to the composer as the
 *  user's own — LAUNDERING the bleed rather than catching it (measured: 2/36 local generations,
 *  scripts/probes/impersonate) — while leaving the primary character out of the foreign-drift truncate,
 *  the one name most likely to appear. A leading all-seated-characters label survives on purpose: it is not
 *  truncatable (no preceding newline) and the composer is a REVIEW surface, so the user sees `Seren: …`
 *  and discards it. That is the deliberate divergence from ST, which DELETES the whole response
 *  (`cleanUpMessage` wrongName, script.js:6472) — ours keeps partial fill for review by design. */
function cleanPerSpeakerContent(content: string, args: RunTurnPipelineArgs): string {
  const ctx = args.assembleContext;
  if (args.kind === "impersonate") {
    const characterNames = (ctx.characters ?? [ctx.character]).map((c) => c.name);
    // The SAME name SHAPE stamped the user rows with, so the label the model was trained to echo is
    // exactly the label stripped here.
    return cleanPerSpeakerReply(content, userSpeakerName(ctx.activePersona), characterNames);
  }
  if ((args.shape?.output ?? "per-speaker") !== "per-speaker") {
    return content;
  }
  const speakerName = args.shape?.speakerName ?? ctx.character.name;
  const otherNames = (ctx.characters ?? []).map((c) => c.name).filter((name) => name !== speakerName);
  return cleanPerSpeakerReply(content, speakerName, otherNames);
}

/** The EPHEMERAL `PROMPT_HISTORY` leg's env for this turn (`assembly/history-regex`), or `null` when the
 *  host tier resolved no scripts at all — the leg then costs nothing and the shaped history is
 *  byte-identical. The env is deliberately built here, at BUILD time and not inside SHAPE, because the
 *  watchdog + the turn-stage macro context are the ENGINE's to supply; SHAPE stays pure. */
function promptHistoryEnv(ctx: AssembleContext, args: RunTurnPipelineArgs): PromptHistoryRegexEnv | null {
  const scripts = ctx.hostTierRegexScripts ?? [];
  if (scripts.length === 0) {
    return null;
  }
  return {
    scripts,
    macroCtx: buildTurnMacroContext({
      assembleCtx: ctx,
      model: args.connection.model,
      chatId: args.chatId,
      onWarn: (msg, warnErr) => getLog().warn({ err: warnErr, macroWarn: msg }, "chat: macro budget/eval trip (D53)"),
      registry: args.macroRegistry,
    }),
    applyReplace: args.applyRegexReplace,
    onScriptFailure: (scriptErr, script) =>
      getLog().warn(
        { err: scriptErr, placement: "PROMPT_HISTORY", findRegex: script.findRegex },
        "chat: host-tier regex script failed on the prompt-history leg — evicted for this build (D53 watchdog)",
      ),
  };
}

/** Applies fixed-order receive post-processing before the engine persists \{content, reasoning\}: <think>
 *  demux, then AI_OUTPUT regex, post-process, per-speaker clean, then REASONING regex. Each host-side regex
 *  runs under the injected ReDoS watchdog. */
function applyReceiveTransforms(
  reduced: { content: string; reasoning: string | null },
  args: RunTurnPipelineArgs,
  // THE ROUND'S SHAPED CTX, not `args.assembleContext` — the identity a host regex script's `{{char}}`
  // resolves against. `PROMPT_HISTORY` (see `promptHistoryEnv`) has always used the shaped ctx, so a script
  // library that spelled `{{char}}` got the SPEAKING character on the prompt leg and the room's PRIMARY on
  // the reply leg: on a merged round voiced by Bran, one turn's `{{char}}` meant Bran going out and Aria
  // coming back. Both legs transform ONE round, the round's speaker is available to both, and the receive
  // path already knows the reply belongs to the speaker (`cleanPerSpeakerContent` strips `args.shape.
  // speakerName`), so the speaker is the only defensible answer for both.
  //   `USER_INPUT` is the deliberate exception and stays on the unshaped base ctx: it runs at SEND inside
  // `assembly/context` runSendAuthorTransforms, strictly BEFORE arbitration picks anyone, so there is no
  // round for it to be scoped to. Its `{{char}}` is the room's, and that is not a divergence to repair.
  ctx: AssembleContext,
): { content: string; reasoning: string | null } {
  const cfg = ctx.promptConfig;
  let content = reduced.content;
  let reasoning = reduced.reasoning;

  // <think> inline-reasoning fallback, gated on empty-native-reasoning + autoParse.
  const rp = cfg.reasoningParse;
  if (rp?.autoParse === true && (reasoning === null || reasoning.length === 0)) {
    const parsed = parseReasoningTags(content, { prefix: rp.prefix, suffix: rp.suffix });
    if (parsed !== null) {
      reasoning = parsed.reasoning;
      content = parsed.content;
    }
  }

  const scripts = ctx.hostTierRegexScripts ?? [];
  const macroCtx =
    scripts.length > 0
      ? buildTurnMacroContext({
          assembleCtx: ctx,
          model: args.connection.model,
          chatId: args.chatId,
          onWarn: (msg, warnErr) => getLog().warn({ err: warnErr, macroWarn: msg }, "chat: macro budget/eval trip (D53)"),
          registry: args.macroRegistry,
        })
      : null;
  if (macroCtx !== null) {
    content = executeRegexScripts({
      text: content,
      scripts,
      placement: "AI_OUTPUT",
      ctx: macroCtx,
      applyReplace: args.applyRegexReplace,
      onScriptFailure: (scriptErr, script) =>
        getLog().warn({ err: scriptErr, placement: "AI_OUTPUT", findRegex: script.findRegex }, "chat: host-tier regex script failed (D53 watchdog)"),
    });
  }

  content = applyReceivePostProcess(content, cfg.postProcess);
  content = cleanPerSpeakerContent(content, args);

  if (macroCtx !== null && reasoning !== null) {
    reasoning = executeRegexScripts({
      text: reasoning,
      scripts,
      placement: "REASONING",
      ctx: macroCtx,
      applyReplace: args.applyRegexReplace,
      onScriptFailure: (scriptErr, script) =>
        getLog().warn({ err: scriptErr, placement: "REASONING", findRegex: script.findRegex }, "chat: host-tier regex script failed (D53 watchdog)"),
    });
  }

  return { content, reasoning };
}

/** Field-wise merge of the two `advanced` escape-hatch blocks — the per-turn override wins per sub-field;
 *  undefined when neither side sets it (so an untouched intent stays byte-identical). */
function foldAdvanced(base: UserIntent["advanced"], override: UserIntent["advanced"]): UserIntent["advanced"] {
  if (base === undefined) {
    return override;
  }
  if (override === undefined) {
    return base;
  }
  return { ...base, ...override };
}

/** Folds the EFFECTIVE generation params at the ONE seam (PD-148) — the value `resolveSampling` and the
 *  fit-budget read: the preset's `params` is the BASE, the per-turn `UserIntent` OVERRIDES field-wise, and
 *  the stop set is the UNION of preset stop + per-turn stop + the host's custom stops (PD-146), Set-deduped.
 *  When the preset carries no params AND there are no custom stops, the per-turn intent is returned BY
 *  REFERENCE — byte-identical to a chat on the DEFAULT preset (whose `params` is `{}`). */
function foldGenerationParams(base: UserIntent, override: UserIntent, extras: readonly string[] | undefined): UserIntent {
  const extraStops = extras ?? [];
  if (Object.keys(base).length === 0 && extraStops.length === 0) {
    return override;
  }
  const stops = [...(base.stop ?? []), ...(override.stop ?? []), ...extraStops];
  const advanced = foldAdvanced(base.advanced, override.advanced);
  return {
    ...base,
    ...override,
    ...(advanced !== undefined ? { advanced } : {}),
    ...(stops.length > 0 ? { stop: [...new Set(stops)] } : {}),
  };
}

/** Pins the effective output length to a concrete number: an explicit `maxOutputTokens` (preset/per-turn,
 *  clamped later against the model's `output.maxTokens` at `resolveChat`) passes through; unset resolves to
 *  the shared `DEFAULT_MAX_OUTPUT_TOKENS`. Returned BY REFERENCE when already set (byte-identical intent). */
function materializeMaxOutput(intent: UserIntent): UserIntent {
  if (intent.maxOutputTokens !== undefined) {
    return intent;
  }
  return { ...intent, maxOutputTokens: materializeOutputReserve(intent.maxOutputTokens) };
}

/** The D50 `assembled_dynamic` transform point (automation-design/04 §6): rewrite the BUILD output's DYNAMIC
 *  half only (the static/cache-stable half is untransformable — 03 §1.2). Absent op / zero registrants ⇒ the
 *  input is returned by reference (byte-identical). The vars env is the runtime fold cache off the immutable
 *  assemble ctx (a per-speaker SHAPE never changes `variableValues`). */
async function applyDynamicTransform(args: RunTurnPipelineArgs, built: AssembledPrompt): Promise<AssembledPrompt> {
  const apply: ApplyPromptTransformsOp | null | undefined = args.applyPromptTransforms;
  if (apply === undefined || apply === null) {
    return built;
  }
  // `Promise.resolve` wrap: biome's nursery `useAwaitThenable` mis-resolves the cross-package
  // `ApplyPromptTransformsOp` return as non-thenable (the documented `@orb/contracts` alias false positive);
  // the wrap makes the await unambiguously thenable without a suppression (a no-op on an already-Promise).
  const outcome = await Promise.resolve(apply("assembled_dynamic", args.chatId, built.dynamic, args.assembleContext.variableValues ?? {}));
  // §5.14 — the BUILD-side half of the typed abort (the SEND-side half is `assembly/context.ts`). Same coded
  // refusal, thrown rather than swallowed: a D53 skip keeps the draft and the turn, an abort ends both.
  if (outcome.aborted) {
    throw new ChatOperationError(CHAT_OP_CODES.promptTransformAborted, `a prompt transform aborted this turn: ${outcome.reason}`);
  }
  const dynamic: string = outcome.text;
  return dynamic === built.dynamic ? built : { ...built, dynamic };
}

/** Does THIS turn deliver a trailing assistant row for the model to continue? Two independent facts: the
 *  model/wire capability (read through the contracts helper — the ONE spelling, shared with the vLLM surface
 *  that must also send its wire's continuation flags) AND whether tools ride this turn.
 *
 *  PREFILL IS SUPPRESSED BY TOOLS (ST `addAssistantPrefix`'s `hasAnyTools` shape). A prefill deliberately ends
 *  the prompt on an assistant row for the model to continue; wire tools ask it to STOP and emit a call.
 *  Shipping both tells the model to do two incompatible things with the same turn end, and ST refuses the
 *  combination outright rather than find out what a given provider does with it.
 *
 *  Not hypothetical: `turns.assistantPrefill` is true for the local vLLM arm, and a FOLDED rpg game attaches
 *  terminal tools to the character turn — so that model shipped prefill+tools together on every game turn
 *  until this gate. Both tool channels count: `attachedToolNames` (the executed/recursed set) and
 *  `terminalTools` (the R1 folded set, attached `tool_choice:"auto"` and never recursed). */
function honorsAssistantPrefill(args: RunTurnPipelineArgs): boolean {
  return acceptsAssistantPrefill(generationOf(args.connection)) && !turnCarriesTools(args);
}

/** SHAPE's synthetic trailing user row: the caller's, minus a CONTINUATION FALLBACK the prefill verdict makes
 *  wrong. A continue's nudge is the fallback spelling of "keep going" for a wire that cannot continue its own
 *  trailing row; where prefill IS honored, shipping it defeats the mechanism twice — the tail makes the
 *  delivered array end on USER (nothing left to continue), and it asks the model to write a NEW message
 *  resuming the old one instead of extending the row it already started. Only a tail the VERB declared a
 *  fallback is droppable: the recovery pass's narrative ask (`recover-narrative`) and the impersonate/response
 *  nudges are real instructions and clear the flag. */
function shapeTail(args: RunTurnPipelineArgs, prefillHonored: boolean): string | null {
  if (prefillHonored && args.appendUserTurnIsContinuationFallback === true) {
    return null;
  }
  return args.appendUserTurn ?? null;
}

/** The turn's two card-section shapes and its round cue. `layout` is what the system block renders (the named
 *  speaker's card under per-speaker scoped, the whole roster in fixed order under per-speaker merged and narrator);
 *  `voice` is who speaks, which every other pass reads `{{char}}` off. A roster-layout turn names its speaker only
 *  in the cue, so it always carries one: the round's own, or the per-speaker cue a single-speaker round or a
 *  regenerate lacks. Absent `shape` falls back to the single-speaker core, byte-identical. */
function speakerContexts(args: RunTurnPipelineArgs): {
  readonly layout: ReturnType<typeof shapeContextForSpeaker>;
  readonly voice: ReturnType<typeof voiceContextForSpeaker>;
  readonly cue: string | null;
} {
  if (args.shape === undefined) {
    return { layout: args.assembleContext, voice: args.assembleContext, cue: args.groupNudge ?? null };
  }
  const speaker = { ref: args.shape.speakerRef, output: args.shape.output, cardScope: args.shape.cardScope };
  const layout = shapeContextForSpeaker(args.assembleContext, speaker);
  const voice = voiceContextForSpeaker(args.assembleContext, speaker);
  return { layout, voice, cue: args.groupNudge ?? speakerCue(layout, voice) };
}

/** Executes one single-speaker turn: BUILD → SHAPE → FIT → REQUEST → REDUCE. Pure orchestration of
 *  injected ops; persists nothing. */
export async function runTurnPipeline(args: RunTurnPipelineArgs): Promise<TurnPipelineResult> {
  const { layout, voice: ctx, cue } = speakerContexts(args);

  // FOLD (PD-148) — the effective generation params: the preset's `params` is the BASE, the per-turn
  // `UserIntent` overrides field-wise, and the host's custom stops (PD-146) join the merged stop set. This is
  // the ONE value SHAPE (roleHandling), FIT (budget), and REQUEST (wire intent) read — never `ctx.promptConfig.params`
  // or `args.intent` directly, so a preset's sampling/stop settings actually reach the wire.
  // MATERIALIZE the effective output length ONCE (the single source of truth): both FIT (fitBudget's
  // reserve) and the runner's wire `max_tokens` read `effectiveIntent.maxOutputTokens` from here — pinning
  // the reserve to exactly what the runner generates. Unset ⇒ the shared response-length default (NOT the
  // model's output-cap ceiling / window), so the fit-pass leaves history room instead of reserving it all.
  const effectiveIntent = materializeMaxOutput(foldGenerationParams(ctx.promptConfig.params, args.intent, args.extraStopSequences));

  // BUILD — the system-prompt halves + the after-history (in_chat) section splices — then the D50
  // `assembled_dynamic` PromptTransform point: rewrite the dynamic half only (static is untransformable).
  const assembled = await applyDynamicTransform(args, buildPrompt(layout.promptConfig, layout, args.macroRegistry));

  // SHAPE — the wire history + the cache breakpoint.
  const inChatInjections: ChatInjection[] = [...(ctx.chatInjections ?? []).filter((i) => i.position === "in_chat"), ...assembled.afterHistory];
  const speakers = {
    user: userSpeakerName(ctx.activePersona),
    assistant: args.shape?.speakerName ?? ctx.character.name,
  };
  // THE TURN'S PREFILL VERDICT — one value, two readers: SHAPE (keep an assistant@depth-0 injection at depth 0
  // and skip the continuation nudge) and {@link shapeTail} (drop the continue verb's fallback row).
  const prefillHonored = honorsAssistantPrefill(args);

  const shaped = shapeTurn({
    canon: assembled.sendHistory ? toShapeCanon(args.canon, ctx, args.historyMacroNames ?? EMPTY_HISTORY_MACRO_NAMES, promptHistoryEnv(ctx, args)) : [],
    appendUserTurn: shapeTail(args, prefillHonored),
    injections: inChatInjections,
    output: args.shape?.output ?? "per-speaker",
    cardScope: args.shape?.cardScope ?? "merged",
    scopedTargetId: args.shape?.scopedTargetId ?? null,
    namesBehavior: ctx.promptConfig.namesBehavior ?? DEFAULT_NAMES_BEHAVIOR,
    speakers,
    groupNudge: cue,
    // roleHandling is the preset's user-intent knob (per-turn override wins via the fold); SHAPE clamps it
    // against the model's roleHandlingFloor.
    assistantPrefill: prefillHonored,
    // The two measured system-row facts SHAPE's delivery rule reads (`assembly/shape` deliverSystemRows): a run
    // that ends the history needs `midConversationSystem`, a run inside it `historySystemRows`; the level
    // decides whether a legal slot is also required. Read through the contract helpers — never a second
    // spelling of the capability field. Neither touches narrator canon rows (owner ruling: group narration is
    // the assistant's own voice).
    midConversationSystem: acceptsMidConversationSystem(generationOf(args.connection)),
    historySystemRows: acceptsHistorySystemRows(generationOf(args.connection)),
    roleHandling: effectiveIntent.advanced?.roleHandling,
    roleHandlingFloor: roleHandlingFloorOf(generationOf(args.connection)),
    squashSystemMessages: effectiveIntent.advanced?.squashSystemMessages,
    // The room host's note frames (PROSE-1) rode onto the ctx at build; SHAPE frames the spliced injections.
    prose: ctx.prose,
    convertsToEmptyWireRow,
  });

  // REQUEST (conversion half) — the one seam where the shaped string body becomes content-parts (§3.5, the WIRE plane of the
  // content-class visibility registry): tokenize each row's spans, resolve USER-ATTACHMENT media refs by
  // the asset's kind — input.vision for images, input.video for mp4/webm/animated-gif (#317); every other
  // embedded image is display-only and collapses to its marker (`ridesAsModelMedia`, whose §6.7 second arm
  // also rides back a picture the MODEL itself drew, per its own `message_assets` inline-reply link),
  // ride hidden/choices/unknown spans VERBATIM ({wire: full} — the model keeps its own memory), and collapse
  // card spans to the deterministic stub (except the M2 keep-last-X newest). This runs DOWNSTREAM of SHAPE
  // (squash joins with `\n\n` before tokenization — fences/tags survive the join) and of every string-body
  // regex pass (§3.9 pin: a promptOnly/AI_OUTPUT script sees the FULL card bytes; the stub replaces them for
  // the wire below it). All six connection modes consume the resulting TurnMessage[], so the collapse is
  // uniform per backend.
  // §8.8 REASONING CARRY — resolved HERE, once, off the ONE funnel policy (`resolveCarryReasoning`), because
  // the `conversation` rung materializes prior turns' thinking at the history-build seam below, which runs
  // upstream of every wire call. The warnings sink is deliberately a THROWAWAY: the backend's own
  // `resolveChat` raises the drop on the turn stream, and raising it twice would show the user two notices
  // for one decision.
  const carryReasoning = resolveCarryReasoning(effectiveIntent, generationOf(args.connection), []);

  const converted = await buildWireHistory(
    {
      visionOk: acceptsImageInput(generationOf(args.connection)),
      videoOk: acceptsVideoInput(generationOf(args.connection)),
      resolveImageUrl: args.resolveImageUrl,
      cardKeepLastX: args.cardKeepLastX,
      canon: args.canon,
      // The `conversation` rung's source, read ONLY on that rung — the op is injected (the domain holds no
      // db handle) and lazy, so every other turn pays nothing for a feature it did not ask for.
      reasoningByMessage: carryReasoning === "conversation" ? await args.loadReasoningParts() : EMPTY_REASONING_BY_MESSAGE,
      loadInlineReplyAssetIds: args.loadInlineReplyAssetIds,
    },
    shaped.history,
  );

  // FIT — the history-budget tail, priced against the CONVERTED rows (#1434: the fitter used to run before
  // this conversion and charge card bodies and choice blocks the provider never receives). The read verb's
  // previews run this same pair through the same substrate module (#1540) — one conversion, one cost rule.
  const systemTokens = estimateTokens([assembled.static, assembled.dynamic].join("\n\n"));
  const budget = fitBudget(args, effectiveIntent, systemTokens);
  const fitted = fitHistory(wireCostRows(converted), budget);
  // The fit's contract is "drop the OLDEST `droppedCount` rows", so the same slice recovers the kept wire
  // rows without re-deriving anything — one conversion, one ordering, no parallel bookkeeping to drift.
  // …and the empty-row drop re-anchors the §8 breakpoint with it: it is a DEPTH from the end, which the fit's
  // front-trim preserves for free and a mid-array drop does not (#1543 — see `shiftBreakpoint`).
  const { kept: nonEmpty, cacheBreakpointFromEnd } = dropEmptyWireRows(converted.slice(fitted.droppedCount), shaped.cacheBreakpointFromEnd);
  // The new-chat marker opens whatever history the fit kept, so it goes back on after the trim.
  const kept = keepNewChatMarkerAtHead(nonEmpty, fitted.droppedCount, shaped.newChatMarker);
  const history = kept.map((w) => w.row);
  // Total context consumption for the managed-compaction trigger: kept history + system + reserved output.
  // `fitted.usedTokens` is now the WIRE cost, so this is what the request actually weighs.
  const fitUsedTokens = fitted.usedTokens + systemTokens + budget.reserveOutputTokens;
  // The media verdicts fold over the KEPT rows only: an image on a row the fit dropped never reached the
  // request, and warning that the model could not see it would be a lie about this turn.
  const imageDropped = kept.some((w) => w.imageDropped);
  const videoDropped = kept.some((w) => w.videoDropped);

  const baseRequest: TurnRequest = {
    connection: args.connection,
    chatId: args.chatId,
    prompt: assembled,
    history,
    intent: effectiveIntent,
    kind: args.kind,
    cacheBreakpointFromEnd,
    // The F-table "Adopt" row: the preset's tag pair rides ONLY when the user asked for auto-parse, so a
    // preset with the feature off changes nothing on any wire.
    ...(ctx.promptConfig.reasoningParse?.autoParse === true
      ? { reasoningTags: { prefix: ctx.promptConfig.reasoningParse.prefix, suffix: ctx.promptConfig.reasoningParse.suffix } }
      : {}),
    signal: args.signal,
  };

  // REDUCE + the tool-recurse loop. The two request-builder gates chain (they touch disjoint fields, and by
  // construction a turn sets tools OR responseFormat, never both — 04 §8).
  const attach = await attachTools(args, baseRequest);
  // The REGISTRY names that actually rode this turn — the left half of the tool-identity partition (#1404).
  // Empty when no set resolved (unwired ops / no capability), which is exactly when nothing may execute.
  const registryNames: ReadonlySet<string> = new Set(attach.execute === null ? [] : args.attachedToolNames);
  const terminal = attachTerminalTools(args, attach.request, registryNames);
  const structured = attachResponseFormat(args, terminal.request);
  const loop = await runRecurseLoop({ args, request: structured.request, execute: attach.execute, terminalNames: terminal.names, carryReasoning });
  // RECEIVE, applied once over the depth-cumulative text (prose flows across recursion depths into one variant).
  const received = applyReceiveTransforms({ content: loop.content, reasoning: loop.reasoning }, args, ctx);
  return {
    request: structured.request,
    content: received.content,
    reasoning: received.reasoning,
    // The MEASURED window, not a transform of the text — the receive pass rewrites reasoning bytes
    // (regex scripts, the <think> demux) and none of that changes how long the model spent producing them.
    reasoningMs: loop.reasoningMs,
    economics: loop.economics,
    cacheBreakpointFromEnd: structured.request.cacheBreakpointFromEnd,
    droppedCount: fitted.droppedCount,
    contextBoundaryMessageId: fitted.earliestKeptMessageId,
    fitUsedTokens,
    fitCeilingTokens: fitted.ceilingTokens,
    imageDropped,
    videoDropped,
    // Records from the pipeline's own recurse loop (an array wire) and from the offer's `execute` callback (a
    // backend that owns the loop) — mutually exclusive by construction, concatenated so persistence is
    // arm-agnostic.
    toolRecords: [...loop.records, ...attach.offerRecords],
    replyImages: loop.replyImages,
    terminalToolCalls: terminalCallsOf(terminal.attached, loop.economics, loop.terminalCalls),
    terminalToolsCollided: terminal.collided,
    toolsUnsupported: attach.unsupported,
    structuredOutputUnsupported: structured.unsupported,
    worldInfoEntryIds: (ctx.wiTrace?.activated ?? []).map((e) => e.id),
    guidedPlacedAsInjection: ctx.guidedPlacedAsInjection === true,
    runnerWarnings: loop.warnings,
    providerRefused: loop.refused,
  };
}

/** Whether THIS turn ships wire tools — either channel. ST's `hasAnyTools` in our vocabulary; read by the
 *  prefill gate above, which must not end the prompt on an assistant row while the model is also being asked
 *  to emit a tool call. Deliberately does NOT consult `capability.tools`: an attached-but-unsupported set is
 *  dropped downstream, and a prefill suppressed on a turn that then runs tool-less is a strictly safer miss
 *  than a prefill shipped alongside tools that DO ride. */
function turnCarriesTools(args: RunTurnPipelineArgs): boolean {
  return (args.attachedToolNames.length > 0 && args.tools !== null) || (args.terminalTools?.length ?? 0) > 0;
}

// Tools ride only when names were gather-contributed AND the ops are wired AND capability.tools declares
// support — attached-but-unsupported drops them (runs tool-less) and flags tools_unsupported. A tool-less
// request carries no tools field. The offer is BACKEND-NEUTRAL (`docs/design/inference-tool-delivery.md`): the
// resolved set as definitions, the round ceiling, and ONE `execute` callback over the ONE execute path.
// `@orb/inference` decides the delivery: an array wire declares them in `tools[]` and hands the calls back for
// `runRecurseLoop` to execute; the Agent SDK mounts them as an MCP server, owns the loop, and calls `execute` per
// invocation — which is why `offerRecords` accumulates the SAME ToolCallRecords the recurse loop would.
//
// THE AUTHORITY IS BOUND HERE, BEFORE THE REQUEST EXISTS (`ChatToolOps.prepareExecution`): the host Principal is
// resolved once and both loops run the bound executor. A failed lookup therefore rejects THIS await and fails the
// turn before the model is called, identically on every wire — never inside an SDK-driven handler, where the
// throw would reach the model as tool-result text and leave no record.
async function attachTools(
  args: RunTurnPipelineArgs,
  baseRequest: TurnRequest,
): Promise<{ request: TurnRequest; execute: BoundToolExecution | null; unsupported: boolean; offerRecords: readonly ToolCallRecord[] }> {
  const wantTools = args.attachedToolNames.length > 0 && args.tools !== null;
  const toolsSupported = generationOf(args.connection).tools !== undefined;
  // Aliased narrowing: `!wantTools` returning implies `args.tools !== null` below (tsc 5.5+).
  if (!wantTools) {
    return { request: baseRequest, execute: null, unsupported: false, offerRecords: [] };
  }
  if (!toolsSupported) {
    return { request: baseRequest, execute: null, unsupported: true, offerRecords: [] };
  }
  // Resolved on the TURN HOST's shelf (#677) — the same identity the teaching contributions enumerated the
  // attach union from (`tctx.runAsUserId`). A guest in the room never pulls their own plugin's tools in, and
  // the host's copy of a plugin two people installed is the one that runs.
  const set = args.tools.resolveTools(args.toolExecFrame.runAsUserId, args.attachedToolNames);
  const execute = await args.tools.prepareExecution(set, args.toolExecFrame);
  const offerRecords: ToolCallRecord[] = [];
  const offer: ChatToolOffer = {
    definitions: args.tools.toToolDefinitions(set),
    execute: (call) => executeOfferedCall({ execute, call, sink: offerRecords }),
    turnLimit: args.toolRecurseLimit,
  };
  return { request: { ...baseRequest, tools: { offer } }, execute, unsupported: false, offerRecords };
}

/** ONE backend-driven invocation through the ONE execute path: single call in, single record out. The record is
 *  kept for persistence (the pipeline's, never the backend's) and its serialized result + error flag go back to
 *  the backend that asked. The execute path always serializes a non-null result on the executed path — `null` is
 *  only the recurse loop's recorded-but-unexecuted case, which never rides this callback. */
async function executeOfferedCall(input: {
  readonly execute: BoundToolExecution;
  readonly call: ToolCallInput;
  readonly sink: ToolCallRecord[];
}): Promise<ChatToolExecution> {
  const records = await input.execute([input.call]);
  const record = records[0];
  if (record === undefined) {
    throw new Error(`tool-use: executeToolCalls returned no record for ${input.call.name}`);
  }
  input.sink.push(record);
  return { text: record.result ?? "", isError: record.isError };
}

/** The TERMINAL-tools request-builder gate (R1 — the folded state extraction). Structurally a sibling of
 *  {@link attachTools}, and deliberately NOT a mode of it: these tools are attached to the wire and then
 *  DELIBERATELY ABANDONED — no `ChatToolSet` is resolved, so {@link pivotCalls} returns null, the recurse loop
 *  breaks at depth 0, nothing is executed, no second model call is paid, and no `ToolCallRecord` is minted.
 *  The model's calls are read off the ONE completion instead ({@link terminalCallsOf}).
 *
 *  `tool_choice` is ALWAYS `"auto"` — never `"required"`, which measurably kills the prose (the spike's
 *  required arm returned narrative on 0/6 turns). The turn's narrative is the product; the state is the
 *  passenger, and a passenger may never crash the vehicle.
 *
 *  ELIGIBILITY is a CAPABILITY question, never a WIRE one (the honest degrade — the contributor is told by the
 *  `null` on the way back out):
 *   • the model must declare `capability.tools` (same gate `attachTools` gives registry tools);
 *   • the wire must CO-EMIT prose alongside those calls (`coEmitsProseWithTools`) — a wire that answers
 *     `content: null` the moment tools ride (the local vLLM engine, measured 36/36) would trade the whole
 *     narrative for the passenger, and the passenger may never crash the vehicle. The contributor gates its own
 *     mount on the same capability fact; this is the WIRE's truth, so it holds even if the turn ends up routed
 *     somewhere the contributor's resolve didn't predict.
 *  Ineligible ⇒ the request is byte-identical to a tool-less one and `attached:false` flows back, so the
 *  contributor runs its own fallback instead of silently losing state.
 *
 *  DELIVERY is not this gate's: the declarations ride the neutral `tools.terminal` field and `@orb/inference`
 *  places them — in the ARRAY wires' `tools[]` with `tool_choice:"auto"`, or on the Agent SDK as a deny-on-use
 *  MCP server (declared to the model, denied at the `PreToolUse` seam, never executed, never a second call).
 *  Same declarations in, same `[]`-vs-`null` channel back — the domain learns no backend concept, and a wire is
 *  never made ineligible for lacking one delivery shape.
 *
 *  THE PARTITION IS THE RETURNED NAME SET (#1404), and it is the only thing that answers "who owns this
 *  call". On the array wires both classes ride the ONE `tools` field, so a model that picks a terminal tool
 *  produces a call indistinguishable — by position, by field, by anything but its NAME — from a registry
 *  one; the loop's gate used to be "did a registry set resolve", which handed that call to the ordinary
 *  executor and paid a second model call for a passenger that must never be executed. {@link runRecurseLoop}
 *  and {@link terminalCallsOf} both read THIS set, so neither reader can ever see the other's class.
 *
 *  A COLLIDING DECLARATION NEVER RIDES, AND IT TAKES THE WHOLE CHANNEL WITH IT (#1617). A tool NAME is minted
 *  once, so a terminal declaration re-spelling a registry name is a contributor defect — shipping both would
 *  send the wire two declarations of one name (malformed) and make the partition unanswerable. The registry
 *  keeps the name (it is the class that EXECUTES; a dropped passenger degrades one fold, a mis-executed one
 *  runs an unowned side effect).
 *
 *  What changed is the OTHER half of that drop. Dropping the collided declaration and riding the SURVIVORS
 *  looked like a graceful degrade and was the one arm with no honest report: `attached:true` flowed back, the
 *  consumer took its folded path, and one plane of the fold was simply missing — no null, no reason, nothing
 *  outside this warn line. (A TOTAL collision was not honest either: it left `wanted` empty, which reads as
 *  "ineligible", so the consumer was told the wire could not carry terminal tools when the wire was fine.)
 *  So ANY collision makes the channel unusable for this turn: nothing is attached, `terminalToolCalls` comes
 *  back `null`, and `collided` NAMES what was refused. The consumer's own fallback round then captures every
 *  plane at the cost of one extra call — the same trade the `folded`→`cheap` fallback already makes, and
 *  strictly better than folding a half-set that silently loses a state write.
 *
 *  THE WARN SITS BEHIND THE ELIGIBILITY GATE. It used to fire before it, so every turn on a wire that never
 *  carries terminal tools logged the contributor's collision — noise on a path where nothing was going to
 *  ride anyway. */
function attachTerminalTools(
  args: RunTurnPipelineArgs,
  baseRequest: TurnRequest,
  registryNames: ReadonlySet<string>,
): { request: TurnRequest; attached: boolean; names: ReadonlySet<string>; collided: readonly string[] } {
  const requested = args.terminalTools ?? [];
  if (requested.length === 0 || !coEmitsProseWithTools(generationOf(args.connection))) {
    return { request: baseRequest, attached: false, names: new Set(), collided: [] };
  }
  const collided = requested.filter((tool) => registryNames.has(tool.name)).map((tool) => tool.name);
  if (collided.length > 0) {
    getLog().warn(
      { chatId: args.chatId, collided },
      "chat: terminal tool declarations collided with registry tool names — the registry owns the name, so the whole terminal channel is withheld this turn",
    );
    return { request: baseRequest, attached: false, names: new Set(), collided };
  }
  const names: ReadonlySet<string> = new Set(requested.map((tool) => tool.name));
  return { request: { ...baseRequest, tools: { ...baseRequest.tools, terminal: requested } }, attached: true, names, collided };
}

/** The terminal channel's total read. The two arms carry DIFFERENT instructions to the consumer and the
 *  distinction has to survive every failure mode:
 *    • `null` — no usable channel. Either the tools never rode, OR the turn produced NO terminal economics
 *      chunk at all (an aborted/short-circuited stream, a runner that never reached its final chunk). The
 *      consumer must run its own fallback.
 *    • `[]`   — the wire DID deliver a completion and it carried zero tool calls: a genuine quiet beat.
 *  Collapsing the first case into `[]` is the dangerous read: it would report "the model chose to record
 *  nothing", suppress the fallback, and drop the turn's state with a cheerful log. So a null economics is
 *  reported as a missing channel, never as a quiet one. Extracted so the pipeline body stays under the
 *  cognitive-complexity cap.
 *
 *  The calls are the ones {@link runRecurseLoop} PARTITIONED OFF each depth (#1404) — never a re-read of the
 *  final aggregate economics. Two things that re-read got wrong: it reported registry calls as terminal ones
 *  in a mixed turn, and `aggregateEconomics` keeps only the LAST depth's `toolCalls`, so a terminal call
 *  co-emitted with a registry call at depth 0 was silently dropped by the recursion it triggered. */
function terminalCallsOf(attached: boolean, economics: TurnEconomics | null, calls: readonly ToolCallInput[]): readonly ToolCallInput[] | null {
  if (!attached || economics === null) {
    return null;
  }
  return calls;
}

// The structured-output request-builder gate (D79, mirror of attachTools): a requested responseFormat rides
// only when `capability.output.structured` is true; unsupported drops it (the turn proceeds free-text) and
// flags structured_output_unsupported. Absent responseFormat is the byte-identical no-op (today's every turn).
function attachResponseFormat(args: RunTurnPipelineArgs, baseRequest: TurnRequest): { request: TurnRequest; unsupported: boolean } {
  if (args.responseFormat === undefined) {
    return { request: baseRequest, unsupported: false };
  }
  if (generationOf(args.connection).output.structured !== true) {
    return { request: baseRequest, unsupported: true };
  }
  return { request: { ...baseRequest, responseFormat: args.responseFormat }, unsupported: false };
}

// The recurse loop: finishReason:"tool" is the only pivot, never text-sniffing. The exchange is
// materialized from the records (arguments/result verbatim); streaming is continuous across depths on the
// one variant; usage aggregates into one economics row; at the limit, pending calls are recorded not
// executed (result:null — side effects the model can't narrate are worse than none). Records accumulate
// in-loop and persist once at commit, so a crash mid-loop loses the records with the generation.
async function runRecurseLoop(input: {
  readonly args: RunTurnPipelineArgs;
  readonly request: TurnRequest;
  /** The bound execute path, or null when no registry set rode (nothing may execute). */
  readonly execute: BoundToolExecution | null;
  /** The TERMINAL half of the tool-identity partition (#1404) — {@link attachTerminalTools}'s name set. Calls
   *  in it are collected for the terminal channel and are structurally unreachable from the executor below. */
  readonly terminalNames: ReadonlySet<string>;
  /** §8.8's RESOLVED carry rung. Above `off`, each depth's reasoning parts ride back on the NEXT leg's
   *  assistant row — the ST `promptIdx > lastUserIdx` fence made structural, because this loop IS the active
   *  tool chain and nothing older is reachable from here. BOTH live rungs behave identically in-loop: the
   *  `conversation`/`tool-chain` difference is what the HISTORY carries, not what the chain does. */
  readonly carryReasoning: CarryReasoning;
}): Promise<{
  content: string;
  reasoning: string | null;
  economics: TurnEconomics | null;
  records: readonly ToolCallRecord[];
  terminalCalls: readonly ToolCallInput[];
  replyImages: readonly GeneratedImage[];
  warnings: readonly ResolvedWarning[];
  refused: boolean;
  reasoningMs: number | null;
}> {
  const { args, execute, terminalNames } = input;
  let history = input.request.history;
  let content = "";
  let reasoning: string | null = null;
  let economics: TurnEconomics | null = null;
  // The reasoning windows SUM across recursion depths, exactly as tokens do — each depth is its own
  // generation, and a turn that reasons at three depths spent all three windows thinking.
  let reasoningMs: number | null = null;
  const records: ToolCallRecord[] = [];
  // Collected AT THE DEPTH THEY WERE EMITTED: the aggregate keeps only the last depth's `toolCalls`, so a
  // terminal call co-emitted with a registry call would otherwise be erased by the recursion it triggered.
  const terminalCalls: ToolCallInput[] = [];
  // §6.7: the turn's inline pictures across every recursion depth. Each depth's `atChars` is an offset into
  // THAT depth's reply, and `content` is the depth-cumulative prose, so the offset is REBASED by the length
  // already accumulated — otherwise a picture emitted at depth 1 would splice into depth 0's text.
  const replyImages: GeneratedImage[] = [];
  // Deduped across depths: the same request-level degrade (a customParameters blob, a dropped knob) re-fires at
  // every recursion, but it is ONE degrade and the user gets ONE notice (the `image_dropped` "once" precedent).
  // KEYED ON THE WHOLE WARNING (#1440): the structured half now distinguishes two drops that share a code
  // (two different sampling knobs), so a code-keyed set would surface one of them and swallow the other.
  const warnings = new Map<string, ResolvedWarning>();
  // ORed across depths, never counted: a tool loop refused at depth 2 was still ONE refused turn. Collected
  // as a list and folded at the return rather than `refused ||= …` in the loop, because this function sits
  // ON the cognitive-complexity cap and a logical operator in the loop body is what pushes it over.
  const refusedByDepth: boolean[] = [];
  let depth = 0;
  for (;;) {
    // Sequential by design: each recursion depends on the previous depth's executed results.
    const reduced = await reduceStream(args.runChatTurn({ ...input.request, history }), args);
    replyImages.push(...rebaseReplyImages(reduced.economics?.replyImages, reduced.content.length, content.length));
    content += reduced.content;
    refusedByDepth.push(reduced.refused);
    for (const warning of reduced.warnings) {
      warnings.set(JSON.stringify(warning), warning);
    }
    if (reduced.reasoning !== null && reduced.reasoning.length > 0) {
      reasoning = (reasoning ?? "") + reduced.reasoning;
    }
    if (reduced.reasoningMs !== null) {
      reasoningMs = (reasoningMs ?? 0) + reduced.reasoningMs;
    }
    economics = aggregateEconomics(economics, reduced.economics);
    // THE PARTITION (#1404): this depth's calls split by tool identity before either reader sees them.
    const split = partitionToolCalls(reduced.economics, terminalNames);
    terminalCalls.push(...split.terminal);
    const calls = pivotCalls(execute, reduced.economics, split.registry);
    if (calls === null || execute === null) {
      break;
    }
    if (depth >= args.toolRecurseLimit) {
      records.push(...calls.map(asUnexecutedRecord));
      break;
    }
    // `Promise.resolve` wrap: biome's nursery `useAwaitThenable` does not carry the `execute === null` break above
    // into this line and reads the union as non-thenable (the same false positive `applyDynamicTransform` wraps
    // for); the wrap is a no-op on an already-Promise and keeps the await honest without a suppression.
    const batch = await Promise.resolve(execute(calls));
    records.push(...batch);
    history = [...history, ...toolExchangeMessages(reduced.content, batch, carriedReasoning(reduced.economics, input.carryReasoning))];
    depth += 1;
  }
  return {
    content,
    reasoning,
    economics,
    records,
    terminalCalls,
    replyImages,
    warnings: [...warnings.values()],
    refused: refusedByDepth.includes(true),
    reasoningMs,
  };
}

/** §6.7 — one depth's inline pictures rebased onto the DEPTH-CUMULATIVE reply. `atChars` is an offset into
 *  this depth's own reply text, and the loop concatenates depths into one variant body, so every offset
 *  shifts by what came before. A picture whose wire carried no offset is pinned at this depth's TAIL (the
 *  honest "after everything it said here"), never at 0 — which would put it in front of prose it followed. */
function rebaseReplyImages(images: readonly GeneratedImage[] | undefined, depthLength: number, alreadyAccumulated: number): readonly GeneratedImage[] {
  return (images ?? []).map((image) => ({ ...image, atChars: (image.atChars ?? depthLength) + alreadyAccumulated }));
}

/** Splits ONE depth's model-emitted calls into the two tool classes by NAME (#1404) — the ONE place the
 *  question "who owns this call" is answered, and the reason each reader below is blind to the other's class.
 *  A name in neither set is impossible on the wire (a model may only call what was declared) but is treated
 *  as REGISTRY: the registry executor is the arm that already refuses an unknown name, where the terminal
 *  channel would forward it to a consumer as state. */
function partitionToolCalls(
  economics: TurnEconomics | null,
  terminalNames: ReadonlySet<string>,
): { readonly registry: readonly ToolCallInput[]; readonly terminal: readonly ToolCallInput[] } {
  const calls = economics?.toolCalls ?? [];
  return { registry: calls.filter((call) => !terminalNames.has(call.name)), terminal: calls.filter((call) => terminalNames.has(call.name)) };
}

/** Recurses only when tools rode this request AND the finish reason says "tool" AND the depth's REGISTRY
 *  half holds ≥1 call; null means the turn is done. A completion whose only calls were terminal ends the
 *  loop at that depth — nothing to execute, and no second model call paid for a passenger. */
function pivotCalls(
  execute: BoundToolExecution | null,
  economics: TurnEconomics | null,
  registryCalls: readonly ToolCallInput[],
): readonly ToolCallInput[] | null {
  if (execute === null || economics?.finishReason !== "tool") {
    return null;
  }
  return registryCalls.length > 0 ? registryCalls : null;
}

/** A limit-hit pending call → the recorded-but-unexecuted record: full provenance, "requested, not run". */
function asUnexecutedRecord(call: ToolCallInput): ToolCallRecord {
  return {
    toolCallId: call.toolCallId,
    name: call.name,
    arguments: call.arguments,
    result: null,
    isError: false,
    durationMs: null,
  };
}

/** THE IN-CHAIN CARRY (§8.8): the depth's replayable thinking when the resolved rung is above `off`, else
 *  nothing. The parts are always PRODUCED (the wire records what the model emitted); this is the one place
 *  that decides whether they ride back, so `off` is a real "the model does not see its prior thinking". */
function carriedReasoning(economics: TurnEconomics | null, carry: CarryReasoning): readonly ChatReasoningPart[] {
  return carry === "off" ? [] : (economics?.reasoningParts ?? []);
}

/** Materializes one depth's exchange into wire rows from the records, so a swipe-replay reassembles the
 *  identical wire history: one assistant row with that depth's prose + tool-call parts, then one tool row
 *  per record.
 *
 *  REASONING GOES FIRST, ahead of the prose AND the tool calls. Anthropic requires the `thinking` block at
 *  the head of an assistant turn (the converter emits the parts in array order), and a signed block that
 *  arrives after a `tool_use` is not the turn the model signed. */
function toolExchangeMessages(depthText: string, batch: readonly ToolCallRecord[], reasoning: readonly ChatReasoningPart[]): TurnMessage[] {
  const assistantParts: ChatContentPart[] = [
    ...reasoning,
    ...(depthText.length > 0 ? [{ type: "text", text: depthText } as const] : []),
    ...batch.map(
      (record) =>
        ({
          type: "tool-call",
          toolCallId: record.toolCallId,
          name: record.name,
          arguments: record.arguments,
        }) as const,
    ),
  ];
  const results: TurnMessage[] = batch.map((record) => ({
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: record.toolCallId,
        content: record.result ?? "",
        ...(record.isError ? { isError: true } : {}),
      },
    ],
  }));
  return [{ role: "assistant", content: assistantParts }, ...results];
}

/** Folds one depth's economics into the turn aggregate: counts/costs sum (absent stays absent), ttftMs is
 *  the first depth's, terminal reasons/model/window are the last depth's. The per-provider sidecar rides the
 *  `...next` spread with that last group ON PURPOSE: it is one call's RECEIPT (a session id, a warm-spare
 *  flag, the vendor that served it), not an accumulating count, and the legs of a tool loop may not even
 *  share a provider — summing across arms of a discriminated union would invent a turn that never ran. */
function aggregateEconomics(acc: TurnEconomics | null, next: TurnEconomics | null): TurnEconomics | null {
  if (acc === null) {
    return next;
  }
  if (next === null) {
    return acc;
  }
  const sum = (a: number | null | undefined, b: number | null | undefined): number | null => {
    if (a === null || a === undefined) {
      return b ?? null;
    }
    return b === null || b === undefined ? a : a + b;
  };
  return {
    ...next,
    content: acc.content + next.content,
    reasoning: [acc.reasoning ?? "", next.reasoning ?? ""].join("") || null,
    tokensIn: sum(acc.tokensIn, next.tokensIn),
    tokensOut: sum(acc.tokensOut, next.tokensOut),
    cacheReadTokens: sum(acc.cacheReadTokens, next.cacheReadTokens),
    cacheWriteTokens: sum(acc.cacheWriteTokens, next.cacheWriteTokens),
    costUsd: sum(acc.costUsd, next.costUsd),
    ttftMs: acc.ttftMs ?? next.ttftMs ?? null,
  };
}
