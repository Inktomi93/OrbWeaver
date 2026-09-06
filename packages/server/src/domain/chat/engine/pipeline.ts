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
// Single-speaker core: output is pinned per-speaker/merged (no narrator, no scoped egocentric fold); the
// arbitration/auto-mode chunk extends this via the `shape` argument.

import type {
  AssembleContext,
  AssembledPrompt,
  AssemblePersona,
  ChatContentPart,
  ChatDeltaEvent,
  ChatInjection,
  MessageView,
  ToolCallRecord,
} from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import { acceptsAssistantPrefill, acceptsHistorySystemRows, coEmitsProseWithTools } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_NAMES_BEHAVIOR } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ContentImageRef, ContentSpan, ContentSpanKind } from "@orb/kit/content";
import { cardWireStub, tokenizeContent } from "@orb/kit/content";
import type { CharacterId, ChatId, MessageId, PersonaId, WorldEntryId } from "@orb/kit/ids";
import type { MacroRegistry, RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { executeRegexScripts } from "@orb/kit/regex";
import { cleanPerSpeakerReply } from "@orb/kit/speaker-label";
import { estimateTokens } from "@orb/kit/tokens";
import { applyReceivePostProcess } from "@orb/server/kit/post-process";
import { parseReasoningTags } from "@orb/server/kit/reasoning";
import { getLog } from "#foundation/observability";
import type { ResolvedWarning, ToolCallInput, WireTool } from "#infra/providers";
import type { ApplyPromptTransformsOp, ApplyRegexReplaceOp, ChatToolExecFrame, ChatToolOps, ChatToolSet, RunChatTurnOp } from "../contract/context.ts";
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
  toShapeCanon,
} from "../substrate/assembly-access.ts";

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
  /** The immutable assemble ctx (never mutated here). */
  readonly assembleContext: AssembleContext;
  readonly canon: readonly MessageView[];
  readonly connection: ResolvedConnection;
  readonly intent: UserIntent;
  /** The host's `UserSettings.chat.customStoppingStrings` (PD-146), folded into the request's stop set
   *  (Set-deduped after the intent's own stops). Absent/empty ⇒ the request `intent` is untouched. */
  readonly extraStopSequences?: readonly string[] | undefined;
  readonly kind: TurnKind;
  /** The owner-consent verdict the engine derived, threaded onto the built TurnRequest so the infra
   *  firewall re-verifies it. */
  readonly ownerConsented: boolean;
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
    windowTokens: args.connection.capability.context.window,
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
): Promise<{ content: string; reasoning: string | null; economics: TurnEconomics | null; warnings: readonly ResolvedWarning[]; reasoningMs: number | null }> {
  let text = "";
  let reasoning = "";
  let economics: TurnEconomics | null = null;
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
    } else {
      economics = chunk.economics;
    }
  }
  const content = economics?.content ?? text;
  const finalReasoning = economics?.reasoning ?? (reasoning.length > 0 ? reasoning : null);
  return { content, reasoning: finalReasoning, economics, warnings, reasoningMs: clock.elapsedMs() };
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
 *  Not hypothetical: `turns.assistantPrefill` is true for `anthropic/claude-opus-4-5`, `claude-haiku-4-5` and
 *  (since 2026-08-19) the local vLLM arm, and a FOLDED rpg game attaches 6 terminal tools to the character
 *  turn — so those models shipped prefill+tools together on every game turn until this gate. Both tool
 *  channels count: `attachedToolNames` (the executed/recursed set) and `terminalTools` (the R1 folded set,
 *  attached `tool_choice:"auto"` and never recursed). */
function honorsAssistantPrefill(args: RunTurnPipelineArgs): boolean {
  return acceptsAssistantPrefill(args.connection.capability) && !turnCarriesTools(args);
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

/** Executes one single-speaker turn: BUILD → SHAPE → FIT → REQUEST → REDUCE. Pure orchestration of
 *  injected ops; persists nothing. */
export async function runTurnPipeline(args: RunTurnPipelineArgs): Promise<TurnPipelineResult> {
  // Card-section shape: picks this turn's card(s) + co-speakers off the immutable ctx — the named speaker's
  // under `per-speaker`, ALL the seated characters' under `narrator`. Absent falls back to the single-speaker core,
  // byte-identical.
  const ctx =
    args.shape !== undefined
      ? shapeContextForSpeaker(args.assembleContext, {
          ref: args.shape.speakerRef,
          output: args.shape.output,
          cardScope: args.shape.cardScope,
        })
      : args.assembleContext;

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
  const assembled = await applyDynamicTransform(args, buildPrompt(ctx.promptConfig, ctx, args.macroRegistry));

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
    groupNudge: args.groupNudge ?? null,
    // roleHandling is the preset's user-intent knob (per-turn override wins via the fold); SHAPE clamps it
    // against the model's roleHandlingFloor.
    assistantPrefill: prefillHonored,
    // midConversationSystem gates the depth-0 system-injection delivery: a declaring model gets a REAL
    // system wire row; the TURNS_FLOOR default demotes to the visible `[Note from system: …]` user note.
    midConversationSystem: args.connection.capability.turns?.midConversationSystem === true,
    // historySystemRows gates the DEPTH>0 system-injection delivery: on a MEASURED mid-array-system model an
    // author's note / depth-N world-info entry rides at its depth as a real system row; unmeasured ⇒ it
    // demotes to the visible `[Note from system: …]` user note. Read through the contract helper — never a
    // second spelling of the capability field. It does NOT touch narrator canon rows: the D129(B) delivery
    // that also read this bit was owner-ruled out 2026-08-18 (group narration is the assistant's own voice).
    historySystemRows: acceptsHistorySystemRows(args.connection.capability),
    roleHandling: effectiveIntent.advanced?.roleHandling,
    roleHandlingFloor: args.connection.capability.turns?.roleHandlingFloor,
    squashSystemMessages: effectiveIntent.advanced?.squashSystemMessages,
    // The room host's note frames (PROSE-1) rode onto the ctx at build; SHAPE frames the spliced injections.
    prose: ctx.prose,
  });

  // REQUEST (conversion half) — the one seam where the shaped string body becomes content-parts (§3.5, the WIRE plane of the
  // content-class visibility registry): tokenize each row's spans, resolve USER-ATTACHMENT media refs by
  // the asset's kind — input.vision for images, input.video for mp4/webm/animated-gif (#317); every other
  // embedded image is display-only and collapses to its marker (`isUserAttachment`),
  // ride hidden/choices/unknown spans VERBATIM ({wire: full} — the model keeps its own memory), and collapse
  // card spans to the deterministic stub (except the M2 keep-last-X newest). This runs DOWNSTREAM of SHAPE
  // (squash joins with `\n\n` before tokenization — fences/tags survive the join) and of every string-body
  // regex pass (§3.9 pin: a promptOnly/AI_OUTPUT script sees the FULL card bytes; the stub replaces them for
  // the wire below it). All six connection modes consume the resulting TurnMessage[], so the collapse is
  // uniform per backend.
  const converted = await buildWireHistory(args, shaped.history);

  // FIT — the history-budget tail, priced against the CONVERTED rows (#1434: the fitter used to run before
  // this conversion and charge card bodies and choice blocks the provider never receives).
  const systemTokens = estimateTokens([assembled.static, assembled.dynamic].join("\n\n"));
  const budget = fitBudget(args, effectiveIntent, systemTokens);
  const fitted = fitHistory(
    converted.map((w) => w.costRow),
    budget,
  );
  // The fit's contract is "drop the OLDEST `droppedCount` rows", so the same slice recovers the kept wire
  // rows without re-deriving anything — one conversion, one ordering, no parallel bookkeeping to drift.
  // …and the empty-row drop re-anchors the §8 breakpoint with it: it is an OFFSET FROM THE END, which the
  // fit's front-trim preserves for free and a mid-array drop does not (#1543 — see `shiftBreakpoint`).
  const { kept, cacheBreakpointFromEnd } = dropEmptyWireRows(converted.slice(fitted.droppedCount), shaped.cacheBreakpointFromEnd);
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
    // The preset's BYOK provider-passthrough blob (PD-148) — flows onto the request only when set. It is
    // applied ONLY by the custom-byo backend (preset-wins, with the two-layer prototype-pollution defense); on
    // OpenRouter it is intentionally not applied (BYOK/custom-byo-only) and dropped-and-loud.
    ...(ctx.promptConfig.customParameters !== undefined ? { customParameters: ctx.promptConfig.customParameters } : {}),
    kind: args.kind,
    ownerConsented: args.ownerConsented,
    cacheBreakpointFromEnd,
    signal: args.signal,
  };

  // REDUCE + the tool-recurse loop. The two request-builder gates chain (they touch disjoint fields, and by
  // construction a turn sets tools OR responseFormat, never both — 04 §8).
  const attach = await attachTools(args, baseRequest);
  // The REGISTRY names that actually rode this turn — the left half of the tool-identity partition (#1404).
  // Empty when no set resolved (unwired ops / no capability), which is exactly when nothing may execute.
  const registryNames: ReadonlySet<string> = new Set(attach.set === null ? [] : args.attachedToolNames);
  const terminal = attachTerminalTools(args, attach.request, registryNames);
  const structured = attachResponseFormat(args, terminal.request);
  const loop = await runRecurseLoop({ args, request: structured.request, set: attach.set, terminalNames: terminal.names });
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
    // Array-wire records come from the recurse loop; stateful (agent-sdk) records from the MCP onRecord
    // side-channel — mutually exclusive by construction, concatenated so persistence is arm-agnostic.
    toolRecords: [...loop.records, ...attach.mcpRecords],
    terminalToolCalls: terminalCallsOf(terminal.attached, loop.economics, loop.terminalCalls),
    terminalToolsCollided: terminal.collided,
    toolsUnsupported: attach.unsupported,
    structuredOutputUnsupported: structured.unsupported,
    worldInfoEntryIds: (ctx.wiTrace?.activated ?? []).map((e) => e.id),
    guidedPlacedAsInjection: ctx.guidedPlacedAsInjection === true,
    runnerWarnings: loop.warnings,
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
// request carries no tools field. Per-wire delivery: the ARRAY wires (chat-completions/responses) carry
// `tools`/`toolChoice` and recurse in `runRecurseLoop`; the STATEFUL agent-sdk wire mounts the resolved set
// as an in-process MCP server (`agentToolServer`) — the SDK owns the loop, every invocation runs the ONE
// `executeToolCalls` path, and `mcpRecords` accumulates the SAME ToolCallRecords the recurse loop would.
async function attachTools(
  args: RunTurnPipelineArgs,
  baseRequest: TurnRequest,
): Promise<{ request: TurnRequest; set: ChatToolSet | null; unsupported: boolean; mcpRecords: readonly ToolCallRecord[] }> {
  const wantTools = args.attachedToolNames.length > 0 && args.tools !== null;
  const toolsSupported = args.connection.capability.tools !== undefined;
  // Aliased narrowing: `!wantTools` returning implies `args.tools !== null` below (tsc 5.5+).
  if (!wantTools) {
    return { request: baseRequest, set: null, unsupported: false, mcpRecords: [] };
  }
  if (!toolsSupported) {
    return { request: baseRequest, set: null, unsupported: true, mcpRecords: [] };
  }
  // Resolved on the TURN HOST's shelf (#677) — the same identity the teaching contributions enumerated the
  // attach union from (`tctx.runAsUserId`). A guest in the room never pulls their own plugin's tools in, and
  // the host's copy of a plugin two people installed is the one that runs.
  const set = args.tools.resolveTools(args.toolExecFrame.runAsUserId, args.attachedToolNames);
  if (args.connection.api === "agent-sdk") {
    const mcpRecords: ToolCallRecord[] = [];
    const server = await args.tools.toAgentToolServer(set, args.toolExecFrame, (record) => mcpRecords.push(record));
    return {
      request: { ...baseRequest, agentToolServer: server, agentToolTurnLimit: args.toolRecurseLimit },
      // The SDK owns the loop — runRecurseLoop never pivots (no finishReason:"tool" on this arm).
      set,
      unsupported: false,
      mcpRecords,
    };
  }
  return {
    request: {
      ...baseRequest,
      tools: args.tools.toWireTools(set),
      toolChoice: { mode: "auto" },
    },
    set,
    unsupported: false,
    mcpRecords: [],
  };
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
 *  DELIVERY then splits by WIRE, exactly as {@link attachTools} already splits registry tools: the ARRAY wires
 *  carry the declarations in `tools` with `tool_choice:"auto"`; the STATEFUL agent-sdk wire reads no tools
 *  array, so it takes the SAME `WireTool[]` on `agentTerminalTools` and its backend mounts them as a
 *  deny-on-use MCP server (declared to the model, denied at the `PreToolUse` seam, never executed, never a
 *  second call). Same declarations in, same `[]`-vs-`null` channel back — the domain learns no backend
 *  concept from the split, and a wire is never made ineligible for lacking one delivery shape.
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
  if (requested.length === 0 || !coEmitsProseWithTools(args.connection.capability)) {
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
  if (args.connection.api === "agent-sdk") {
    return { request: { ...baseRequest, agentTerminalTools: requested }, attached: true, names, collided };
  }
  return {
    request: { ...baseRequest, tools: [...(baseRequest.tools ?? []), ...requested], toolChoice: { mode: "auto" } },
    attached: true,
    names,
    collided,
  };
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
  if (args.connection.capability.output.structured !== true) {
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
  readonly set: ChatToolSet | null;
  /** The TERMINAL half of the tool-identity partition (#1404) — {@link attachTerminalTools}'s name set. Calls
   *  in it are collected for the terminal channel and are structurally unreachable from the executor below. */
  readonly terminalNames: ReadonlySet<string>;
}): Promise<{
  content: string;
  reasoning: string | null;
  economics: TurnEconomics | null;
  records: readonly ToolCallRecord[];
  terminalCalls: readonly ToolCallInput[];
  warnings: readonly ResolvedWarning[];
  reasoningMs: number | null;
}> {
  const { args, set, terminalNames } = input;
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
  // Deduped across depths: the same request-level degrade (a customParameters blob, a dropped knob) re-fires at
  // every recursion, but it is ONE degrade and the user gets ONE notice (the `image_dropped` "once" precedent).
  // KEYED ON THE WHOLE WARNING (#1440): the structured half now distinguishes two drops that share a code
  // (two different sampling knobs), so a code-keyed set would surface one of them and swallow the other.
  const warnings = new Map<string, ResolvedWarning>();
  let depth = 0;
  for (;;) {
    // Sequential by design: each recursion depends on the previous depth's executed results.
    const reduced = await reduceStream(args.runChatTurn({ ...input.request, history }), args);
    content += reduced.content;
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
    const calls = pivotCalls(set, args.tools, reduced.economics, split.registry);
    if (calls === null || args.tools === null) {
      break;
    }
    if (depth >= args.toolRecurseLimit) {
      records.push(...calls.map(asUnexecutedRecord));
      break;
    }
    const batch = await args.tools.executeToolCalls(set, calls, args.toolExecFrame);
    records.push(...batch);
    history = [...history, ...toolExchangeMessages(reduced.content, batch)];
    depth += 1;
  }
  return { content, reasoning, economics, records, terminalCalls, warnings: [...warnings.values()], reasoningMs };
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
  set: ChatToolSet | null,
  tools: ChatToolOps | null,
  economics: TurnEconomics | null,
  registryCalls: readonly ToolCallInput[],
): readonly ToolCallInput[] | null {
  if (set === null || tools === null || economics?.finishReason !== "tool") {
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

/** Materializes one depth's exchange into wire rows from the records, so a swipe-replay reassembles the
 *  identical wire history: one assistant row with that depth's prose + tool-call parts, then one tool row
 *  per record. */
function toolExchangeMessages(depthText: string, batch: readonly ToolCallRecord[]): TurnMessage[] {
  const assistantParts: ChatContentPart[] = [
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
 *  the first depth's, terminal reasons/model/window are the last depth's. */
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

/** A media-only row whose every part drops must not collapse to an empty text part — the runner's
 *  empty-row wire filter would delete it, ending the delivered history on the prior assistant row (then
 *  400s on some providers). Substitute the dropped media's alt text (or a neutral marker) instead. The
 *  label names the dropped KIND (`image`/`video`; a mixed drop says `media`) so the model's stand-in stays
 *  honest about what it didn't see. */
function droppedMediaPlaceholder(dropped: readonly DroppedMedia[]): string {
  const kinds = new Set(dropped.map((d) => d.media));
  const label = kinds.size === 1 ? (dropped[0]?.media ?? "image") : "media";
  const named = dropped.filter((d) => d.alt.length > 0).map((d) => d.alt);
  return named.length > 0 ? `[${label}: ${named.join(", ")}]` : `[${label} omitted]`;
}

/** The DISPLAY-ONLY image's wire stand-in (the ST-parity rule below): the reader keeps the real picture, the
 *  model gets a short marker in its place — it learns an image was shown without a vision part or the raw
 *  URL bytes riding the prompt. Inline (never a part boundary), so it merges with the surrounding text. */
function displayOnlyImageText(alt: string): string {
  return alt.length > 0 ? `[image: ${alt}]` : "[image]";
}

/** Is this image span a deliberate USER ATTACHMENT — the one image class that may become a model-visible
 *  image part (owner ruling, ST parity)?
 *
 *  BOTH halves are required, and both are structural:
 *   • the ref is an owned-CAS `asset:<id>` — the ONLY thing the attachment machinery ever mints
 *     (`composeBodyWithAttachments`, verbs/turn). An `external` http(s) ref is authored bytes: a character
 *     card's greeting image, a world-info illustration, a pasted link. It also makes the PROVIDER fetch a
 *     third-party URL (the same tracking-pixel/exfil vector `forbidExternalMedia` exists for), for content
 *     that can change under us.
 *   • the row is USER-authored. `role` is the delivered wire role, so it already covers the id-less rows
 *     (the regen/continue synthetic user turn, injections); the `userAuthored` predicate additionally
 *     rejects the SCOPED-FOLD demotion — `shape.scopeToSpeaker` re-roles another character's assistant row
 *     to a `Name: …` USER line, and those images are still character-authored (a narrator/`/imagine` post
 *     carries real `asset:` refs, so the scheme alone would let them through).
 *
 *  Everything else is DISPLAY-ONLY: it renders in the transcript forever and never rides as an image part. */
function isUserAttachment(span: { readonly ref: ContentImageRef }, role: TurnMessage["role"], userAuthored: boolean): boolean {
  return span.ref.kind === "asset" && role === "user" && userAuthored;
}

/** One dropped attachment: its alt text + which media kind the drop was (drives the per-kind warning
 *  flags and the honest placeholder label). */
interface DroppedMedia {
  readonly alt: string;
  readonly media: ResolvedMediaRef["media"];
}

/** The per-assembly wire environment for the span→part projection (§3.5 — the WIRE plane). */
interface WirePartsEnv {
  readonly visionOk: boolean;
  /** The video twin (#317): `capability.input.video === true` — gates video parts as `visionOk` gates images. */
  readonly videoOk: boolean;
  readonly resolveImageUrl: (ref: ContentImageRef) => Promise<ResolvedMediaRef | null>;
  /** The card spans riding FULL this assembly (the M2 keep-last-X window; empty = every card stubs). */
  readonly fullCards: ReadonlySet<ContentSpan>;
}

/** The PER-ROW facts the projection needs (only the image arm reads them — see `isUserAttachment`). */
interface WireRowFacts {
  /** The DELIVERED wire role. */
  readonly role: TurnMessage["role"];
  /** The row's bytes were authored by a human user: it is not a canon ASSISTANT row (an id-less shaped row —
   *  the synthetic regen/continue user turn, a spliced injection — is judged by `role` alone). */
  readonly userAuthored: boolean;
}

/** The M2 keep-last-X window: the LAST X card spans across the fitted history (document order, counted from
 *  the tail) ride the wire full; everything older stubs. Deterministic PER ASSEMBLY — the same history at a
 *  given turn always yields the same last-X set; a card entering the stub zone as newer cards arrive is a
 *  bounded one-time cache break per card, inherent to a sliding window (§3.5).
 *
 *  A CARD IN A SYNTHETIC ROW IS INSTRUCTION, NOT CONTENT — it never stubs and never consumes the window.
 *  A synthetic row is id-less by construction (a spliced injection or the regen/continue user turn; canon
 *  rows always carry a `messageId` — the same discriminator `isUserAttachment` reads two functions down).
 *  The rpg card-teach block embeds a literal `:::card` worked example, so under the old rule the default
 *  `cardKeepLastX = 0` collapsed the model's own teaching example to `[card: Crossing sign]` before it was
 *  ever sent: the one measured intervention that pins the opener's exact bytes, deleted by the wire seam on
 *  every game. Worse at `keepLastX >= 1` — the example rides the tail, so it WON the window and stubbed the
 *  model's real cards instead. Stored cards still obey the window; authored ones are not stored cards. */
function resolveFullCards(
  tokenized: readonly { readonly h: { readonly messageId?: MessageId | undefined }; readonly spans: readonly ContentSpan[] }[],
  /** ABSENT ≠ ZERO. Contributed ONLY by an rpg game's gather, so a chat with no game supplies nothing —
   *  `undefined` ⇒ NO window (every card rides whole); `0` ⇒ keep none (rpg's explicit default); `n` ⇒ last n.
   *  This used to be `?? 0` at the call site, which silently gave every non-rpg chat the strictest setting of
   *  a feature it never opted into: all its cards stubbed on every turn, with no knob to change it. */
  keepLastX: number | undefined,
): ReadonlySet<ContentSpan> {
  const full = new Set<ContentSpan>();
  const canonCards: ContentSpan[] = [];
  for (const { h, spans } of tokenized) {
    for (const span of spans) {
      if (span.kind !== "card") {
        continue;
      }
      if (h.messageId === undefined) {
        full.add(span); // authored this turn — instruction, exempt from the window
      } else {
        canonCards.push(span);
      }
    }
  }
  for (const card of windowed(canonCards, keepLastX)) {
    full.add(card);
  }
  return full;
}

/** The stored-card slice the window keeps FULL. Absent window ⇒ all of them (a chat that never opted into
 *  the rpg budget tradeoff); `0` ⇒ none; `n` ⇒ the newest n in document order. */
function windowed(canonCards: readonly ContentSpan[], keepLastX: number | undefined): readonly ContentSpan[] {
  if (keepLastX === undefined) {
    return canonCards;
  }
  return keepLastX > 0 ? canonCards.slice(-keepLastX) : [];
}

type WirePartResult = ChatContentPart | { droppedAlt: string; droppedMedia: ResolvedMediaRef["media"] } | null;
type SpanOfKind<K extends ContentSpanKind> = Extract<ContentSpan, { readonly kind: K }>;
type WirePartHandler<K extends ContentSpanKind> = (span: SpanOfKind<K>, env: WirePartsEnv, row: WireRowFacts) => WirePartResult | Promise<WirePartResult>;

/** The total dispatch over the content-class registry's WIRE plane (§3.5) — one handler per
 *  `CONTENT_CLASS_POLICY` row, keyed by `ContentSpanKind` so a new class fails to build until it registers
 *  here (the content-class wire memory: table + hardcoded dispatch, edit BOTH). `image` is the one handler
 *  whose runtime behavior is NARROWER than its policy row (`wire:"drop"`): only a deliberate user attachment
 *  is a resolve-or-drop candidate — every other embedded image is DISPLAY-ONLY and never touches the wire
 *  plane at all, so the policy row and this handler agree on the ATTACHMENT arm and the binding test below
 *  only asserts that arm. */
const WIRE_PART_HANDLERS: { readonly [K in ContentSpanKind]: WirePartHandler<K> } = {
  // wire:"full" — verbatim bytes.
  text: (span) => (span.text.length > 0 ? { type: "text", text: span.text } : null),
  // wire:"drop" — the CYOA fence must not re-pile unselected options into context on later turns.
  choices: () => null,
  // wire:"full" — the model must remember its own lie / the true event.
  hidden: (span) => ({ type: "text", text: span.raw }),
  // wire:"full" — the §3.2.1 allowlist-strip keeps the model's bytes even though it renders as noise.
  "unknown-directive": (span) => ({ type: "text", text: span.raw }),
  // wire:"stub" — the reader keeps the rich card forever, the model gets the deterministic stub, except
  // inside the M2 keep-last-X window.
  card: (span, env) => ({ type: "text", text: env.fullCards.has(span) ? span.raw : cardWireStub(span.title) }),
  // wire:"drop" — ATTACHMENT-ONLY (owner ruling, ST parity): a non-attachment image is DISPLAY-ONLY and
  // collapses to its short marker; an attachment resolves-or-drops-to-alt gated by the asset's media kind
  // (`input.vision` for images, `input.video` for mp4/webm/animated-gif — #317). The KIND is only known
  // after resolve (it is the asset row's stored fact), so the kind-gate runs on the resolver's answer.
  image: async (span, env, row) => {
    if (!isUserAttachment(span, row.role, row.userAuthored)) {
      // DISPLAY-ONLY, unconditionally — not a capability drop, so it never flags `imageDropped` (the
      // `image_dropped` warning means "your model can't see the image you attached", and nagging it on
      // every turn of a chat whose greeting embeds a picture would be a lie).
      return { type: "text", text: displayOnlyImageText(span.alt) };
    }
    if (!(env.visionOk || env.videoOk)) {
      // Cheap short-circuit — a media-blind model must not pay asset I/O on every history re-resolve,
      // so the kind is never learned here and the drop reports as the common case (image).
      return { droppedAlt: span.alt, droppedMedia: "image" };
    }
    const resolved = await env.resolveImageUrl(span.ref);
    if (resolved === null) {
      return { droppedAlt: span.alt, droppedMedia: "image" };
    }
    if (resolved.media === "video") {
      return env.videoOk ? { type: "video", url: resolved.url } : { droppedAlt: span.alt, droppedMedia: "video" };
    }
    return env.visionOk ? { type: "image", url: resolved.url } : { droppedAlt: span.alt, droppedMedia: "image" };
  },
};

/** One span → its wire part — total Record-dispatch over `WIRE_PART_HANDLERS` (§3.5). The cast is the one
 *  spot a discriminated union's per-member narrowing is lost to a dynamic key lookup; the handler itself
 *  stays narrowed via {@link SpanOfKind}. */
function spanToWirePart(span: ContentSpan, env: WirePartsEnv, row: WireRowFacts): Promise<WirePartResult> {
  const handler = WIRE_PART_HANDLERS[span.kind] as WirePartHandler<typeof span.kind>;
  return Promise.resolve(handler(span, env, row));
}

/** Test-only seam: the CONTENT_CLASS_POLICY/dispatch binding test calls the real dispatch directly (no
 *  reason to reassemble a full turn to exercise one span → wire-part rule).
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const __spanToWirePartForTest = spanToWirePart;

/** Projects a row's spans into provider content-parts. Adjacent text parts MERGE, so a body whose spans all
 *  ride as text (the common no-image case — hidden tags and all) stays ONE text part, byte-identical to the
 *  pre-registry wire for every wire=full class. */
async function toContentParts(
  spans: readonly ContentSpan[],
  env: WirePartsEnv,
  row: WireRowFacts,
): Promise<{ parts: ChatContentPart[]; imageDropped: boolean; videoDropped: boolean }> {
  const resolved = await Promise.all(spans.map((span) => spanToWirePart(span, env, row)));
  const parts: ChatContentPart[] = [];
  let mergeBlocked = false;
  const droppedMedia: DroppedMedia[] = [];
  for (const r of resolved) {
    if (r === null) {
      continue;
    }
    if ("droppedAlt" in r) {
      // A drop is a part BOUNDARY (the pre-registry wire shape): text on either side of a dropped image
      // stays two parts — only text that was truly adjacent in the body merges.
      mergeBlocked = true;
      droppedMedia.push({ alt: r.droppedAlt, media: r.droppedMedia });
      continue;
    }
    const prev = parts.at(-1);
    if (!mergeBlocked && r.type === "text" && prev !== undefined && prev.type === "text") {
      parts[parts.length - 1] = { type: "text", text: prev.text + r.text };
      continue;
    }
    mergeBlocked = false;
    parts.push(r);
  }
  if (parts.length === 0) {
    // Only substitute a placeholder when a drop emptied the row; a genuinely empty body keeps its empty text part.
    parts.push({ type: "text", text: droppedMedia.length > 0 ? droppedMediaPlaceholder(droppedMedia) : "" });
  }
  return {
    parts,
    imageDropped: droppedMedia.some((d) => d.media === "image"),
    videoDropped: droppedMedia.some((d) => d.media === "video"),
  };
}

/** One row of SHAPE's output — derived from `shapeTurn`, never re-spelled, so the fit and the conversion
 *  both consume exactly what SHAPE produced (`fitHistory` takes the same rows). */
type ShapedHistoryRow = ReturnType<typeof shapeTurn>["history"][number];

/** One shaped row after the WIRE conversion: the provider row itself, the string the FIT prices it by, and
 *  the per-row media verdicts. `costRow` re-states the row's canon identity because the fit reads it (the
 *  irreducible-tail anchor + the context-boundary id), and carries the WIRE text as its `content`. */
interface WireRow {
  readonly row: TurnMessage;
  readonly costRow: ShapedHistoryRow;
  readonly imageDropped: boolean;
  readonly videoDropped: boolean;
}

/** The wire text a row costs the model — the concatenation of its TEXT parts, and nothing else (#1434).
 *  A resolved image/video part carries a URL or a data payload the token estimator cannot price and the
 *  provider does not charge as prompt text, so it contributes ZERO here; what it replaced (a multi-KB
 *  `![alt](orb://…)` blob, or a card body collapsed to `[card: Title]`) is gone by construction because
 *  this reads the CONVERTED parts, not the shaped body. */
function wireCostText(parts: readonly ChatContentPart[]): string {
  return parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
}

/** The REQUEST-step history build: tokenize each shaped row ONCE, resolve the keep-last-X card window over
 *  the whole assembly, then project every row through the ONE span→part seam (§3.5).
 *
 *  THIS RUNS BEFORE THE FIT (#1434). It used to run after, which meant the token fitter priced bytes the
 *  provider never sees: it charged the full multi-KB body of every stored card that the very next step
 *  collapsed to `[card: Title]`, and charged every choices block that the next step DROPPED — so a
 *  card-heavy chat evicted useful older turns to make room for content it was about to delete, and
 *  `fitUsedTokens` (the managed-compaction trigger) overstated the real request. Converting first costs one
 *  extra media resolve for rows the fit then drops — rare, since only a deliberate user ATTACHMENT resolves
 *  anything — and buys a fit and a boundary that describe the actual wire.
 *
 *  The card window MOVED with the conversion: it used to be resolved over the FITTED tail (this ran after
 *  the fit), and it is now resolved over the WHOLE shaped assembly. That is not a behaviour change, and the
 *  reason is worth stating because it is the thing that makes the reorder safe — the window is the last-X
 *  cards in DOCUMENT ORDER, and the fit only ever removes OLDER rows, so every card it could remove was
 *  already outside the last-X (a stub-zone card). The extra entries the window may now hold belong to rows
 *  the fit drops, and a dropped row's spans are never projected. */
async function buildWireHistory(args: RunTurnPipelineArgs, shapedHistory: readonly ShapedHistoryRow[]): Promise<WireRow[]> {
  const visionOk = args.connection.capability.input?.vision === true;
  const videoOk = args.connection.capability.input?.video === true;
  // COMMITTED canon (the shaped history is stored rows, never the in-flight stream), so an unterminated
  // card closes at EOF and STUBS like any other card instead of riding the wire as a multi-KB raw blob.
  const tokenized = shapedHistory.map((h) => ({ h, spans: tokenizeContent(h.content, { committed: true }) }));
  const env: WirePartsEnv = { visionOk, videoOk, resolveImageUrl: args.resolveImageUrl, fullCards: resolveFullCards(tokenized, args.cardKeepLastX) };
  // The canon rows a SHAPE fold may have re-roled to `user` (`scopeToSpeaker` stamps another character's
  // assistant line as `Name: …`) — their images stay character-authored, so they never count as attachments.
  const assistantMessageIds = new Set(args.canon.filter((m) => m.role === "assistant").map((m) => m.id));
  return await Promise.all(
    tokenized.map(async ({ h, spans }): Promise<WireRow> => {
      const userAuthored = h.messageId === undefined || !assistantMessageIds.has(h.messageId);
      const { parts, imageDropped, videoDropped } = await toContentParts(spans, env, { role: h.role, userAuthored });
      const row: TurnMessage = h.name === undefined ? { role: h.role, content: parts } : { role: h.role, content: parts, name: h.name };
      const costRow: ShapedHistoryRow = {
        role: h.role,
        content: wireCostText(parts),
        ...(h.name === undefined ? {} : { name: h.name }),
        messageId: h.messageId,
      };
      return { row, costRow, imageDropped, videoDropped };
    }),
  );
}

/** A converted row that carries NOTHING for the provider: one empty text part, which is what
 *  `toContentParts` emits when every span was `wire:"drop"`ped and no media drop left a placeholder. */
function isEmptyWireRow(wire: WireRow): boolean {
  const parts = wire.row.content;
  return parts.length === 1 && parts[0]?.type === "text" && parts[0].text.length === 0;
}

/** Drop the rows that converted to nothing (#1438).
 *
 *  A CHOICES-ONLY canon row is the reachable case: the `choices` handler returns `null` for every span
 *  (the CYOA fence — unselected options must not re-pile into context), `toContentParts` skips nulls, and
 *  with no dropped media to placeholder the row falls through to `{type:"text", text:""}`. Providers reject
 *  empty messages, and shipping one contradicts the fence's own intent to remove the block entirely.
 *
 *  THE FINAL ROW IS NEVER DROPPED. It is the turn's own tail — the user's message, the regen/continue
 *  synthetic, or the assistant prefill — and its POSITION is load-bearing to every wire (`acceptsAssistantPrefill`,
 *  the continuation nudge, the cache breakpoint's offset-from-end). An empty tail is a different defect and
 *  silently deleting it would hide it. */
function dropEmptyWireRows(built: readonly WireRow[], cacheBreakpointFromEnd: number | undefined): { kept: WireRow[]; cacheBreakpointFromEnd: number | null } {
  const lastIdx = built.length - 1;
  const kept = built.filter((wire, i) => i === lastIdx || !isEmptyWireRow(wire));
  return { kept, cacheBreakpointFromEnd: shiftBreakpoint(cacheBreakpointFromEnd, built, kept.length) };
}

/** Re-anchor the §8 cache breakpoint after a MID-ARRAY drop (#1543).
 *
 *  The breakpoint is an OFFSET FROM THE END (`shape.ts` computes it as `length − stablePrefixLength`, and
 *  the runner counts back from the tail of the body it writes). That representation is what lets the FIT
 *  trim the front for free — a front-drop shortens the array and the prefix by the same amount. A drop from
 *  anywhere else does NOT commute with it: removing an empty choices row from inside the last
 *  `offsetFromEnd` rows shortens the array without shortening the stable prefix, so the same offset now
 *  points one row EARLIER and the breakpoint lands on bytes that are not the boundary SHAPE measured —
 *  silently re-billing the cached prefix on exactly the expensive turns the breakpoint exists for.
 *
 *  So the offset is recomputed from the invariant it actually encodes: the stable PREFIX LENGTH
 *  (`before − offset`) is what the drop may or may not have shortened, and the new offset is
 *  `after − (the prefix as it now stands)`. A drop inside the prefix leaves the offset alone; a drop after
 *  it shrinks the offset by one per row. `< 1` means the whole tail was dropped away — `shape.ts` refuses
 *  that same case, so it resolves to NO breakpoint rather than to a placement nobody measured. */
function shiftBreakpoint(cacheBreakpointFromEnd: number | undefined, before: readonly WireRow[], afterLength: number): number | null {
  if (cacheBreakpointFromEnd === undefined) {
    return null;
  }
  const prefixLength = before.length - cacheBreakpointFromEnd;
  const droppedFromPrefix = before.slice(0, prefixLength).filter(isEmptyWireRow).length;
  const shifted = afterLength - (prefixLength - droppedFromPrefix);
  return shifted >= 1 ? shifted : null;
}
