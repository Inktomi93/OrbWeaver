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

import type { AssembleContext, AssembledPrompt, ChatContentPart, ChatDeltaEvent, ChatInjection, MessageView, ToolCallRecord } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ContentImageRef, ContentSpan } from "@orb/kit/content";
import { cardWireStub, tokenizeContent } from "@orb/kit/content";
import type { CharacterId, ChatId, MessageId, PersonaId, WorldEntryId } from "@orb/kit/ids";
import type { MacroRegistry, RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { executeRegexScripts } from "@orb/kit/regex";
import { cleanPerSpeakerReply } from "@orb/kit/speaker-label";
import { estimateTokens } from "@orb/kit/tokens";
import { applyReceivePostProcess } from "@orb/server/kit/post-process";
import { parseReasoningTags } from "@orb/server/kit/reasoning";
import { getLog } from "#foundation/observability";
import type { ToolCallInput, WireTool } from "#infra/providers";
import type { ApplyPromptTransformsOp, ApplyRegexReplaceOp, ChatToolExecFrame, ChatToolOps, ChatToolSet, RunChatTurnOp } from "../contract/context";
import type { HistoryMacroNames, TurnEconomics, TurnKind, TurnMessage, TurnRequest, TurnSpeakerShape } from "../contract/results";
import {
  buildHistoryBudget,
  buildPrompt,
  buildTurnMacroContext,
  fitHistory,
  materializeOutputReserve,
  shapeContextForSpeaker,
  shapeTurn,
  toShapeCanon,
} from "../substrate/assembly-access";

/** What `runTurnPipeline` consumes — the immutable assemble ctx + the loaded canon + the resolved connection
 *  + the turn axes. */
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
   *  (crew CW2) sets it, and the gate below drops+warns when the model can't honor it. */
  readonly responseFormat?: ResponseFormat | undefined;
  readonly toolRecurseLimit: number;
  /** The principal-blind identity frame `executeToolCalls` receives. */
  readonly toolExecFrame: ChatToolExecFrame;
  /** The D50 PromptTransform apply op (04 §6) — applied at the `assembled_dynamic` point (end of BUILD, over
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
   *  ride the wire FULL; every older card collapses to the deterministic `[card: title]` stub. Absent/0 =
   *  immediate total collapse (the argued cache/budget-honest default). Wired from the game config by the
   *  P4 wave; the mechanism is feature-agnostic. */
  readonly cardKeepLastX?: number | undefined;
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
  /** True when ≥1 image part was dropped because the model lacks vision. */
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

/** Drains the role's stream: text/reasoning deltas accumulate + fan out; the terminal final chunk yields
 *  economics. The runner's final.content/reasoning (when given) are authoritative; accumulated deltas fall back. */
async function reduceStream(
  stream: AsyncIterable<{ kind: string }>,
  args: RunTurnPipelineArgs,
): Promise<{ content: string; reasoning: string | null; economics: TurnEconomics | null }> {
  let text = "";
  let reasoning = "";
  let economics: TurnEconomics | null = null;
  for await (const chunk of stream as AsyncIterable<
    { kind: "text"; text: string } | { kind: "reasoning"; text: string } | { kind: "final"; economics: TurnEconomics }
  >) {
    if (chunk.kind === "text") {
      text += chunk.text;
      args.onDelta({ chatId: args.chatId, kind: "text", text: chunk.text });
    } else if (chunk.kind === "reasoning") {
      reasoning += chunk.text;
      args.onDelta({ chatId: args.chatId, kind: "reasoning", text: chunk.text });
    } else {
      economics = chunk.economics;
    }
  }
  const content = economics?.content ?? text;
  const finalReasoning = economics?.reasoning ?? (reasoning.length > 0 ? reasoning : null);
  return { content, reasoning: finalReasoning, economics };
}

/** Strips a per-speaker canon row down to only its own speaker's content: removes a leaked leading
 *  self-label and truncates any drift into a foreign cast member's line. Applied only on the per-speaker
 *  output path; merged/narrator output is left alone (its labels are the intended transcript). */
function cleanPerSpeakerContent(content: string, args: RunTurnPipelineArgs): string {
  if ((args.shape?.output ?? "per-speaker") !== "per-speaker") {
    return content;
  }
  const ctx = args.assembleContext;
  const speakerName = args.shape?.speakerName ?? ctx.character.name;
  const otherNames = (ctx.cast ?? []).map((c) => c.name).filter((name) => name !== speakerName);
  return cleanPerSpeakerReply(content, speakerName, otherNames);
}

/** Applies fixed-order receive post-processing before the engine persists \{content, reasoning\}: <think>
 *  demux, then AI_OUTPUT regex, post-process, per-speaker clean, then REASONING regex. Each host-side regex
 *  runs under the injected ReDoS watchdog. */
function applyReceiveTransforms(
  reduced: { content: string; reasoning: string | null },
  args: RunTurnPipelineArgs,
): { content: string; reasoning: string | null } {
  const ctx = args.assembleContext;
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
  // Per-speaker card-section shape: picks this speaker's card + co-speakers off the immutable ctx;
  // absent falls back to the single-speaker core, byte-identical.
  const ctx =
    args.shape !== undefined
      ? shapeContextForSpeaker(args.assembleContext, {
          ref: args.shape.speakerRef,
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
  // `assembled_dynamic` PromptTransform point (04 §6): rewrite the dynamic half only (static is untransformable).
  const assembled = await applyDynamicTransform(args, buildPrompt(ctx.promptConfig, ctx, args.macroRegistry));

  // SHAPE — the wire history + the cache breakpoint.
  const inChatInjections: ChatInjection[] = [...(ctx.chatInjections ?? []).filter((i) => i.position === "in_chat"), ...assembled.afterHistory];
  const speakers = {
    user: ctx.activePersona?.name ?? "User",
    assistant: args.shape?.speakerName ?? ctx.character.name,
  };
  const shaped = shapeTurn({
    canon: assembled.sendHistory ? toShapeCanon(args.canon, ctx, args.historyMacroNames ?? EMPTY_HISTORY_MACRO_NAMES) : [],
    appendUserTurn: args.appendUserTurn ?? null,
    injections: inChatInjections,
    output: args.shape?.output ?? "per-speaker",
    cardScope: args.shape?.cardScope ?? "merged",
    scopedTargetId: args.shape?.scopedTargetId ?? null,
    namesBehavior: ctx.promptConfig.namesBehavior ?? "default",
    speakers,
    groupNudge: args.groupNudge ?? null,
    // roleHandling is the preset's user-intent knob (per-turn override wins via the fold); SHAPE clamps it
    // against the model's roleHandlingFloor.
    assistantPrefill: args.connection.capability.turns?.assistantPrefill === true,
    // midConversationSystem gates the depth-0 system-injection delivery: a declaring model gets a REAL
    // system wire row; the TURNS_FLOOR default demotes to the visible `[Note from system: …]` user note.
    midConversationSystem: args.connection.capability.turns?.midConversationSystem === true,
    roleHandling: effectiveIntent.advanced?.roleHandling,
    roleHandlingFloor: args.connection.capability.turns?.roleHandlingFloor,
    squashSystemMessages: effectiveIntent.advanced?.squashSystemMessages,
  });

  // FIT — the history-budget tail.
  const systemTokens = estimateTokens([assembled.static, assembled.dynamic].join("\n\n"));
  const budget = fitBudget(args, effectiveIntent, systemTokens);
  const fitted = fitHistory(shaped.history, budget);
  // Total context consumption for the managed-compaction trigger: kept history + system + reserved output.
  const fitUsedTokens = fitted.usedTokens + systemTokens + budget.reserveOutputTokens;

  // REQUEST — the one seam where the shaped string body becomes content-parts (§3.5, the WIRE plane of the
  // content-class visibility registry): tokenize each row's spans, resolve/drop image refs by input.vision,
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
  const received = applyReceiveTransforms({ content: loop.content, reasoning: loop.reasoning }, args);
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
  };
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
 *  ELIGIBILITY (the honest degrade — the contributor is told by the `null` on the way back out):
 *   • the model must declare `capability.tools` (same gate `attachTools` gives registry tools);
 *   • the wire must carry `tools[]` on a chat turn — the STATEFUL agent-sdk arm does not (it mounts an
 *     in-process MCP server whose tools the SDK executes, which is precisely the loop a terminal tool must
 *     not enter).
 *  Ineligible ⇒ the request is byte-identical to a tool-less one and `attached:false` flows back, so the
 *  contributor runs its own fallback instead of silently losing state. */
function attachTerminalTools(args: RunTurnPipelineArgs, baseRequest: TurnRequest): { request: TurnRequest; attached: boolean } {
  const wanted = args.terminalTools ?? [];
  const eligible = args.connection.capability.tools !== undefined && args.connection.api !== "agent-sdk";
  if (wanted.length === 0 || !eligible) {
    return { request: baseRequest, attached: false };
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
}> {
  const { args, set } = input;
  let history = input.request.history;
  let content = "";
  let reasoning: string | null = null;
  let economics: TurnEconomics | null = null;
  const records: ToolCallRecord[] = [];
  let depth = 0;
  for (;;) {
    // Sequential by design: each recursion depends on the previous depth's executed results.
    // biome-ignore lint/performance/noAwaitInLoops: the recurse loop is inherently sequential (03 §2).
    const reduced = await reduceStream(args.runChatTurn({ ...input.request, history }), args);
    content += reduced.content;
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
  return { content, reasoning, economics, records };
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

/** The per-assembly wire environment for the span→part projection (§3.5 — the WIRE plane). */
interface WirePartsEnv {
  readonly visionOk: boolean;
  readonly resolveImageUrl: (ref: ContentImageRef) => Promise<string | null>;
  /** The card spans riding FULL this assembly (the M2 keep-last-X window; empty = every card stubs). */
  readonly fullCards: ReadonlySet<ContentSpan>;
}

const NO_FULL_CARDS: ReadonlySet<ContentSpan> = new Set([]);

/** The M2 keep-last-X window: the LAST X card spans across the fitted history (document order, counted from
 *  the tail) ride the wire full; everything older stubs. Deterministic PER ASSEMBLY — the same history at a
 *  given turn always yields the same last-X set; a card entering the stub zone as newer cards arrive is a
 *  bounded one-time cache break per card, inherent to a sliding window (§3.5). */
function resolveFullCards(tokenized: readonly { readonly spans: readonly ContentSpan[] }[], keepLastX: number): ReadonlySet<ContentSpan> {
  if (keepLastX <= 0) {
    return NO_FULL_CARDS;
  }
  const cards = tokenized.flatMap((t) => t.spans.filter((s) => s.kind === "card"));
  return new Set(cards.slice(-keepLastX));
}

/** One span → its wire part (§3.5, the total dispatch over the content-class registry's WIRE plane):
 *  `text` rides as-is; `image` = the existing drop-to-alt arm gated by vision; `hidden`/`unknown-directive`
 *  ride VERBATIM (wire=full — the model must remember its own lie / the true event / its own bytes; the
 *  transcript is honest); `choices` is STRIPPED entirely (wire=drop — the CYOA fence must not re-pile
 *  unselected options into context on later turns; the user's pick already became a real user turn);
 *  `card` collapses to the deterministic stub unless inside the keep-last-X window (wire=stub). */
async function spanToWirePart(span: ContentSpan, env: WirePartsEnv): Promise<ChatContentPart | { droppedAlt: string } | null> {
  if (span.kind === "text") {
    return span.text.length > 0 ? { type: "text", text: span.text } : null;
  }
  if (span.kind === "choices") {
    return null;
  }
  if (span.kind === "hidden" || span.kind === "unknown-directive") {
    return { type: "text", text: span.raw };
  }
  if (span.kind === "card") {
    return { type: "text", text: env.fullCards.has(span) ? span.raw : cardWireStub(span.title) };
  }
  if (!env.visionOk) {
    return { droppedAlt: span.alt };
  }
  const url = await env.resolveImageUrl(span.ref);
  return url === null ? { droppedAlt: span.alt } : { type: "image", url };
}

/** Projects a row's spans into provider content-parts. Adjacent text parts MERGE, so a body whose spans all
 *  ride as text (the common no-image case — hidden tags and all) stays ONE text part, byte-identical to the
 *  pre-registry wire for every wire=full class. */
async function toContentParts(spans: readonly ContentSpan[], env: WirePartsEnv): Promise<{ parts: ChatContentPart[]; dropped: boolean }> {
  const resolved = await Promise.all(spans.map((span) => spanToWirePart(span, env)));
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
  fittedHistory: readonly { readonly role: TurnMessage["role"]; readonly content: string; readonly name?: string | undefined }[],
): Promise<{ history: TurnMessage[]; imageDropped: boolean }> {
  const visionOk = args.connection.capability.input?.vision === true;
  // COMMITTED canon (the fitted history is stored rows, never the in-flight stream), so an unterminated
  // card closes at EOF and STUBS like any other card instead of riding the wire as a multi-KB raw blob.
  const tokenized = fittedHistory.map((h) => ({ h, spans: tokenizeContent(h.content, { committed: true }) }));
  const env: WirePartsEnv = { visionOk, resolveImageUrl: args.resolveImageUrl, fullCards: resolveFullCards(tokenized, args.cardKeepLastX ?? 0) };
  const built = await Promise.all(
    tokenized.map(async ({ h, spans }) => {
      const { parts, dropped } = await toContentParts(spans, env);
      const row: TurnMessage = h.name === undefined ? { role: h.role, content: parts } : { role: h.role, content: parts, name: h.name };
      return { row, dropped };
    }),
  );
  return { history: built.map((b) => b.row), imageDropped: built.some((b) => b.dropped) };
}
