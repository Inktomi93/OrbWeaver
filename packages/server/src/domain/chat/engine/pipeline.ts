// The per-turn execution pipeline: pure orchestration of injected ops (no db/credentials/backend touch). It
// builds a TurnRequest from the assembly producer's output + SHAPE, calls the injected runChatTurn role,
// reduces the stream, and applies the history-budget fit. Returns a result the engine lifecycle persists.
//
// Order (read top to bottom in runTurnPipeline): BUILD (assemblePrompt) → SHAPE (wire history + cache
// breakpoint) → FIT (history-budget tail) → REQUEST (assemble the TurnRequest) → REDUCE (iterate
// runChatTurn, fan deltas, fold economics, then the tool-recurse loop on finishReason:"tool" up to
// toolRecurseLimit).
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
import { acceptsHistorySystemRows, coEmitsProseWithTools } from "@orb/contracts/connection";
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
import type { ToolCallInput, WarningCode, WireTool } from "#infra/providers";
import type { ApplyPromptTransformsOp, ApplyRegexReplaceOp, ChatToolExecFrame, ChatToolOps, ChatToolSet, RunChatTurnOp } from "../contract/context.ts";
import type { PromptHistoryRegexEnv } from "../contract/regex.ts";
import type { HistoryMacroNames, TurnEconomics, TurnKind, TurnMessage, TurnRequest, TurnSpeakerShape, TurnStreamChunk } from "../contract/results.ts";
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
  readonly applyRegexReplace: ApplyRegexReplaceOp;
  /** Resolves a parsed message-image ref → a model-fetchable URL, or null to drop it. */
  readonly resolveImageUrl: (ref: ContentImageRef) => Promise<string | null>;
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
   *  folded-mode game's character turn). Mutually exclusive with `attachedToolNames` by construction: a game
   *  turn's gather contributes one or the other, never both. */
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
  readonly economics: TurnEconomics | null;
  readonly cacheBreakpointFromEnd: number | null;
  readonly droppedCount: number;
  /** True when ≥1 USER-ATTACHED image part was dropped because the model lacks vision (or its asset no longer
   *  resolves). A display-only image (a card's greeting picture, narrator media) is NOT a drop — it was never
   *  eligible to ride, so it must not raise the `image_dropped` warning. */
  readonly imageDropped: boolean;
  /** The turn's cumulative tool exchange across every recursion depth. */
  readonly toolRecords: readonly ToolCallRecord[];
  /** The calls the TERMINAL tools (R1) drew off this completion, or `null` when there is NO usable channel —
   *  the tools didn't ride (none requested / the connection can't carry wire `tools[]`), or the turn produced
   *  no terminal economics at all. An EMPTY array is the honest "they rode, the wire answered, and the model
   *  called nothing" — a quiet beat, distinct from `null`'s "run your own fallback". These are deliberately NOT
   *  folded into `toolRecords`: they were never executed, so a record would be a lie, and they must never reach
   *  a member-visible payload. */
  readonly terminalToolCalls: readonly ToolCallInput[] | null;
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
   *  codes (`toChatWarningCode`) and emits one `warning` event per surfaced code. Distinct from the boolean
   *  capability-drop flags above: those are the DOMAIN's own gates, these are the runner's. */
  readonly runnerWarnings: readonly WarningCode[];
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

/** Drains the role's stream: text/reasoning deltas accumulate + fan out; the out-of-band `warning` chunks
 *  collect for the engine's bus emit (D41 — the runner's honest-degrade codes, still in the infra vocabulary;
 *  the engine narrows them to chat's own); the terminal final chunk yields economics. The runner's
 *  final.content/reasoning (when given) are authoritative; accumulated deltas fall back. */
async function reduceStream(
  stream: AsyncIterable<{ kind: string }>,
  args: RunTurnPipelineArgs,
): Promise<{ content: string; reasoning: string | null; economics: TurnEconomics | null; warnings: readonly WarningCode[] }> {
  let text = "";
  let reasoning = "";
  let economics: TurnEconomics | null = null;
  const warnings: WarningCode[] = [];
  for await (const chunk of stream as AsyncIterable<TurnStreamChunk>) {
    if (chunk.kind === "text") {
      text += chunk.text;
      args.onDelta({ chatId: args.chatId, kind: "text", text: chunk.text });
    } else if (chunk.kind === "reasoning") {
      reasoning += chunk.text;
      args.onDelta({ chatId: args.chatId, kind: "reasoning", text: chunk.text });
    } else if (chunk.kind === "warning") {
      warnings.push(chunk.code);
    } else {
      economics = chunk.economics;
    }
  }
  const content = economics?.content ?? text;
  const finalReasoning = economics?.reasoning ?? (reasoning.length > 0 ? reasoning : null);
  return { content, reasoning: finalReasoning, economics, warnings };
}

/** Strips a per-speaker canon row down to only its own speaker's content: removes a leaked leading
 *  self-label and truncates any drift into a foreign cast member's line. Applied only on the per-speaker
 *  output path; merged/narrator output is left alone (its labels are the intended transcript).
 *
 *  IMP-1 layer 2b — WHO IS "SELF" DEPENDS ON THE TURN. An `impersonate` draft is the USER's next line, so
 *  the self is the PERSONA and every cast member is foreign. Running the assistant-turn configuration on it
 *  (self = the character, as the `shape`-less fallback did) inverts both halves: it quietly STRIPPED a
 *  leading `Seren:` off a line Seren had written and handed the character's words to the composer as the
 *  user's own — LAUNDERING the bleed rather than catching it (measured: 2/36 local generations,
 *  scripts/probes/impersonate) — while leaving the primary character out of the foreign-drift truncate,
 *  the one name most likely to appear. A leading whole-cast label survives on purpose: it is not
 *  truncatable (no preceding newline) and the composer is a REVIEW surface, so the user sees `Seren: …`
 *  and discards it. That is the deliberate divergence from ST, which DELETES the whole response
 *  (`cleanUpMessage` wrongName, script.js:6472) — ours keeps partial fill for review by design. */
function cleanPerSpeakerContent(content: string, args: RunTurnPipelineArgs): string {
  const ctx = args.assembleContext;
  if (args.kind === "impersonate") {
    const castNames = (ctx.cast ?? [ctx.character]).map((c) => c.name);
    // The SAME name SHAPE stamped the user rows with, so the label the model was trained to echo is
    // exactly the label stripped here.
    return cleanPerSpeakerReply(content, userSpeakerName(ctx.activePersona), castNames);
  }
  if ((args.shape?.output ?? "per-speaker") !== "per-speaker") {
    return content;
  }
  const speakerName = args.shape?.speakerName ?? ctx.character.name;
  const otherNames = (ctx.cast ?? []).map((c) => c.name).filter((name) => name !== speakerName);
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
  const dynamic: string = await Promise.resolve(apply("assembled_dynamic", args.chatId, built.dynamic, args.assembleContext.variableValues ?? {}));
  return dynamic === built.dynamic ? built : { ...built, dynamic };
}

/** Executes one single-speaker turn: BUILD → SHAPE → FIT → REQUEST → REDUCE. Pure orchestration of
 *  injected ops; persists nothing. */
export async function runTurnPipeline(args: RunTurnPipelineArgs): Promise<TurnPipelineResult> {
  // Card-section shape: picks this turn's card(s) + co-speakers off the immutable ctx — the named speaker's
  // under `per-speaker`, the WHOLE cast's under `narrator`. Absent falls back to the single-speaker core,
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
  const shaped = shapeTurn({
    canon: assembled.sendHistory ? toShapeCanon(args.canon, ctx, args.historyMacroNames ?? EMPTY_HISTORY_MACRO_NAMES, promptHistoryEnv(ctx, args)) : [],
    appendUserTurn: args.appendUserTurn ?? null,
    injections: inChatInjections,
    output: args.shape?.output ?? "per-speaker",
    cardScope: args.shape?.cardScope ?? "merged",
    scopedTargetId: args.shape?.scopedTargetId ?? null,
    namesBehavior: ctx.promptConfig.namesBehavior ?? DEFAULT_NAMES_BEHAVIOR,
    speakers,
    groupNudge: args.groupNudge ?? null,
    // roleHandling is the preset's user-intent knob (per-turn override wins via the fold); SHAPE clamps it
    // against the model's roleHandlingFloor.
    // PREFILL IS SUPPRESSED BY TOOLS (ST `addAssistantPrefix`'s `hasAnyTools` shape). A prefill deliberately
    // ends the prompt on an assistant row for the model to continue; wire tools ask it to STOP and emit a
    // call. Shipping both tells the model to do two incompatible things with the same turn end, and ST
    // refuses the combination outright rather than find out what a given provider does with it.
    //
    // Not hypothetical here: `capability.turns.assistantPrefill` is true for `anthropic/claude-opus-4-5` and
    // `claude-haiku-4-5` (pinned in tests/.../catalog/turns.test.ts), and a FOLDED rpg game attaches 6
    // terminal tools to the character turn — so those two models shipped prefill+tools together on every
    // game turn. The Sonnet-5 path this was investigated on has prefill false, which is why it never
    // surfaced. Both tool channels count: `attachedToolNames` (the executed/recursed set) and
    // `terminalTools` (the R1 folded set, attached `tool_choice:"auto"` and never recursed).
    assistantPrefill: args.connection.capability.turns?.assistantPrefill === true && !turnCarriesTools(args),
    // midConversationSystem gates the depth-0 system-injection delivery: a declaring model gets a REAL
    // system wire row; the TURNS_FLOOR default demotes to the visible `[Note from system: …]` user note.
    midConversationSystem: args.connection.capability.turns?.midConversationSystem === true,
    // historySystemRows gates the D129(B) narrator delivery: a MEASURED mid-history-system model ships a
    // narrator canon row as a wire `system` row; unmeasured (every model today) ⇒ assistant-voiced, byte-
    // identical. Read through the contract helper — never a second spelling of the capability field.
    historySystemRows: acceptsHistorySystemRows(args.connection.capability),
    roleHandling: effectiveIntent.advanced?.roleHandling,
    roleHandlingFloor: args.connection.capability.turns?.roleHandlingFloor,
    squashSystemMessages: effectiveIntent.advanced?.squashSystemMessages,
    // The room host's note frames (PROSE-1) rode onto the ctx at build; SHAPE frames the spliced injections.
    prose: ctx.prose,
  });

  // FIT — the history-budget tail.
  const systemTokens = estimateTokens([assembled.static, assembled.dynamic].join("\n\n"));
  const budget = fitBudget(args, effectiveIntent, systemTokens);
  const fitted = fitHistory(shaped.history, budget);
  // Total context consumption for the managed-compaction trigger: kept history + system + reserved output.
  const fitUsedTokens = fitted.usedTokens + systemTokens + budget.reserveOutputTokens;

  // REQUEST — the one seam where the shaped string body becomes content-parts (§3.5, the WIRE plane of the
  // content-class visibility registry): tokenize each row's spans, resolve USER-ATTACHMENT image refs by
  // input.vision (every other image is display-only and collapses to its marker — `isUserAttachment`),
  // ride hidden/choices/unknown spans VERBATIM ({wire: full} — the model keeps its own memory), and collapse
  // card spans to the deterministic stub (except the M2 keep-last-X newest). This runs DOWNSTREAM of SHAPE
  // (squash joins with `\n\n` before tokenization — fences/tags survive the join) and of every string-body
  // regex pass (§3.9 pin: a promptOnly/AI_OUTPUT script sees the FULL card bytes; the stub replaces them for
  // the wire below it). All six connection modes consume the resulting TurnMessage[], so the collapse is
  // uniform per backend.
  const { history, imageDropped } = await buildWireHistory(args, fitted.history);
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
    cacheBreakpointFromEnd: shaped.cacheBreakpointFromEnd ?? null,
    signal: args.signal,
  };

  // REDUCE + the tool-recurse loop. The two request-builder gates chain (they touch disjoint fields, and by
  // construction a turn sets tools OR responseFormat, never both — 04 §8).
  const attach = await attachTools(args, baseRequest);
  const terminal = attachTerminalTools(args, attach.request);
  const structured = attachResponseFormat(args, terminal.request);
  const loop = await runRecurseLoop({ args, request: structured.request, set: attach.set });
  // RECEIVE, applied once over the depth-cumulative text (prose flows across recursion depths into one variant).
  const received = applyReceiveTransforms({ content: loop.content, reasoning: loop.reasoning }, args, ctx);
  return {
    request: structured.request,
    content: received.content,
    reasoning: received.reasoning,
    economics: loop.economics,
    cacheBreakpointFromEnd: structured.request.cacheBreakpointFromEnd,
    droppedCount: fitted.droppedCount,
    contextBoundaryMessageId: fitted.earliestKeptMessageId,
    fitUsedTokens,
    fitCeilingTokens: fitted.ceilingTokens,
    imageDropped,
    // Array-wire records come from the recurse loop; stateful (agent-sdk) records from the MCP onRecord
    // side-channel — mutually exclusive by construction, concatenated so persistence is arm-agnostic.
    toolRecords: [...loop.records, ...attach.mcpRecords],
    terminalToolCalls: terminalCallsOf(terminal.attached, loop.economics),
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
  const set = args.tools.resolveTools(args.attachedToolNames);
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
 *  concept from the split, and a wire is never made ineligible for lacking one delivery shape. */
function attachTerminalTools(args: RunTurnPipelineArgs, baseRequest: TurnRequest): { request: TurnRequest; attached: boolean } {
  const wanted = args.terminalTools ?? [];
  if (wanted.length === 0 || !coEmitsProseWithTools(args.connection.capability)) {
    return { request: baseRequest, attached: false };
  }
  if (args.connection.api === "agent-sdk") {
    return { request: { ...baseRequest, agentTerminalTools: wanted }, attached: true };
  }
  return { request: { ...baseRequest, tools: [...(baseRequest.tools ?? []), ...wanted], toolChoice: { mode: "auto" } }, attached: true };
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
 *  cognitive-complexity cap. */
function terminalCallsOf(attached: boolean, economics: TurnEconomics | null): readonly ToolCallInput[] | null {
  if (!attached || economics === null) {
    return null;
  }
  return economics.toolCalls ?? [];
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
async function runRecurseLoop(input: { readonly args: RunTurnPipelineArgs; readonly request: TurnRequest; readonly set: ChatToolSet | null }): Promise<{
  content: string;
  reasoning: string | null;
  economics: TurnEconomics | null;
  records: readonly ToolCallRecord[];
  warnings: readonly WarningCode[];
}> {
  const { args, set } = input;
  let history = input.request.history;
  let content = "";
  let reasoning: string | null = null;
  let economics: TurnEconomics | null = null;
  const records: ToolCallRecord[] = [];
  // Deduped across depths: the same request-level degrade (a customParameters blob, a dropped knob) re-fires at
  // every recursion, but it is ONE degrade and the user gets ONE notice (the `image_dropped` "once" precedent).
  const warnings = new Set<WarningCode>();
  let depth = 0;
  for (;;) {
    // Sequential by design: each recursion depends on the previous depth's executed results.
    // biome-ignore lint/performance/noAwaitInLoops: the recurse loop is inherently sequential.
    const reduced = await reduceStream(args.runChatTurn({ ...input.request, history }), args);
    content += reduced.content;
    for (const code of reduced.warnings) {
      warnings.add(code);
    }
    if (reduced.reasoning !== null && reduced.reasoning.length > 0) {
      reasoning = (reasoning ?? "") + reduced.reasoning;
    }
    economics = aggregateEconomics(economics, reduced.economics);
    const calls = pivotCalls(set, args.tools, reduced.economics);
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
  return { content, reasoning, economics, records, warnings: [...warnings] };
}

/** Recurses only when tools rode this request AND the finish reason says "tool" AND the reducer assembled
 *  ≥1 call; null means the turn is done. */
function pivotCalls(set: ChatToolSet | null, tools: ChatToolOps | null, economics: TurnEconomics | null): readonly ToolCallInput[] | null {
  if (set === null || tools === null || economics?.finishReason !== "tool") {
    return null;
  }
  const calls = economics.toolCalls;
  return calls !== undefined && calls.length > 0 ? calls : null;
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

/** An image-only row whose every part drops must not collapse to an empty text part — the runner's
 *  empty-row wire filter would delete it, ending the delivered history on the prior assistant row (then
 *  400s on some providers). Substitute the dropped images' alt text (or a neutral marker) instead. */
function droppedImagePlaceholder(droppedAlts: string[]): string {
  return droppedAlts.length > 0 ? `[image: ${droppedAlts.join(", ")}]` : "[image omitted]";
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

/** The per-assembly wire environment for the span→part projection (§3.5 — the WIRE plane). */
interface WirePartsEnv {
  readonly visionOk: boolean;
  readonly resolveImageUrl: (ref: ContentImageRef) => Promise<string | null>;
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

type WirePartResult = ChatContentPart | { droppedAlt: string } | null;
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
  // collapses to its short marker; an attachment resolves-or-drops-to-alt gated by vision.
  image: async (span, env, row) => {
    if (!isUserAttachment(span, row.role, row.userAuthored)) {
      // DISPLAY-ONLY, unconditionally — not a capability drop, so it never flags `imageDropped` (the
      // `image_dropped` warning means "your model can't see the image you attached", and nagging it on
      // every turn of a chat whose greeting embeds a picture would be a lie).
      return { type: "text", text: displayOnlyImageText(span.alt) };
    }
    if (!env.visionOk) {
      return { droppedAlt: span.alt };
    }
    const url = await env.resolveImageUrl(span.ref);
    return url === null ? { droppedAlt: span.alt } : { type: "image", url };
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
 *  reason to reassemble a full turn to exercise one span → wire-part rule). */
export const __spanToWirePartForTest = spanToWirePart;

/** Projects a row's spans into provider content-parts. Adjacent text parts MERGE, so a body whose spans all
 *  ride as text (the common no-image case — hidden tags and all) stays ONE text part, byte-identical to the
 *  pre-registry wire for every wire=full class. */
async function toContentParts(spans: readonly ContentSpan[], env: WirePartsEnv, row: WireRowFacts): Promise<{ parts: ChatContentPart[]; dropped: boolean }> {
  const resolved = await Promise.all(spans.map((span) => spanToWirePart(span, env, row)));
  const parts: ChatContentPart[] = [];
  let dropped = false;
  let mergeBlocked = false;
  const droppedAlts: string[] = [];
  for (const r of resolved) {
    if (r === null) {
      continue;
    }
    if ("droppedAlt" in r) {
      dropped = true;
      // A drop is a part BOUNDARY (the pre-registry wire shape): text on either side of a dropped image
      // stays two parts — only text that was truly adjacent in the body merges.
      mergeBlocked = true;
      if (r.droppedAlt.length > 0) {
        droppedAlts.push(r.droppedAlt);
      }
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
    parts.push({ type: "text", text: dropped ? droppedImagePlaceholder(droppedAlts) : "" });
  }
  return { parts, dropped };
}

/** The REQUEST-step history build (extracted): tokenize each fitted row ONCE, resolve the keep-last-X card
 *  window over the whole assembly, then project every row through the ONE span→part seam. */
async function buildWireHistory(
  args: RunTurnPipelineArgs,
  fittedHistory: readonly {
    readonly role: TurnMessage["role"];
    readonly content: string;
    readonly name?: string | undefined;
    readonly messageId?: MessageId | undefined;
  }[],
): Promise<{ history: TurnMessage[]; imageDropped: boolean }> {
  const visionOk = args.connection.capability.input?.vision === true;
  // COMMITTED canon (the fitted history is stored rows, never the in-flight stream), so an unterminated
  // card closes at EOF and STUBS like any other card instead of riding the wire as a multi-KB raw blob.
  const tokenized = fittedHistory.map((h) => ({ h, spans: tokenizeContent(h.content, { committed: true }) }));
  const env: WirePartsEnv = { visionOk, resolveImageUrl: args.resolveImageUrl, fullCards: resolveFullCards(tokenized, args.cardKeepLastX) };
  // The canon rows a SHAPE fold may have re-roled to `user` (`scopeToSpeaker` stamps another character's
  // assistant line as `Name: …`) — their images stay character-authored, so they never count as attachments.
  const assistantMessageIds = new Set(args.canon.filter((m) => m.role === "assistant").map((m) => m.id));
  const built = await Promise.all(
    tokenized.map(async ({ h, spans }) => {
      const userAuthored = h.messageId === undefined || !assistantMessageIds.has(h.messageId);
      const { parts, dropped } = await toContentParts(spans, env, { role: h.role, userAuthored });
      const row: TurnMessage = h.name === undefined ? { role: h.role, content: parts } : { role: h.role, content: parts, name: h.name };
      return { row, dropped };
    }),
  );
  return { history: built.map((b) => b.row), imageDropped: built.some((b) => b.dropped) };
}
