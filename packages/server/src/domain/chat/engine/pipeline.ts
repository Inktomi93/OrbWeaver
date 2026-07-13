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
  ChatContentPart,
  ChatDeltaEvent,
  ChatInjection,
  MessageView,
  ToolCallRecord,
} from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import type { ContentImageRef } from "@orb/kit/content";
import { tokenizeContent } from "@orb/kit/content";
import type { CharacterId, ChatId, MessageId, PersonaId, WorldEntryId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { executeRegexScripts } from "@orb/kit/regex";
import { cleanPerSpeakerReply } from "@orb/kit/speaker-label";
import { estimateTokens } from "@orb/kit/tokens";
import { applyReceivePostProcess } from "@orb/server/kit/post-process";
import { parseReasoningTags } from "@orb/server/kit/reasoning";
import { getLog } from "#foundation/observability";
import type { ToolCallInput } from "#infra/providers";
import type {
  ApplyRegexReplaceOp,
  ChatToolExecFrame,
  ChatToolOps,
  ChatToolSet,
  RunChatTurnOp,
} from "../contract/context";
import type {
  HistoryMacroNames,
  TurnEconomics,
  TurnKind,
  TurnMessage,
  TurnRequest,
  TurnSpeakerShape,
} from "../contract/results";
import {
  buildPrompt,
  buildTurnMacroContext,
  fitHistory,
  renderHistoryMacros,
  shapeContextForSpeaker,
  shapeTurn,
} from "../substrate/assembly-access";

/** A SHAPE canon row (system rows never reach the delivered history). */
interface ShapeCanonRow {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly authorName?: string | null;
  readonly characterId?: CharacterId | null;
  readonly messageId: MessageId;
}

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
  readonly toolRecurseLimit: number;
  /** The principal-blind identity frame `executeToolCalls` receives. */
  readonly toolExecFrame: ChatToolExecFrame;
  /** The per-chat macro name producer `toShapeCanon` resolves each history row's own macro stamps
   *  against; absent means empty maps (every row falls through to its speaker-default floor). */
  readonly historyMacroNames?: HistoryMacroNames | undefined;
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
  /** True when tools were attached but the model's capability lacks tools support (ran tool-less). */
  readonly toolsUnsupported: boolean;
  /** The WI entries that fired this turn (budget-survived). */
  readonly worldInfoEntryIds: readonly WorldEntryId[];
  /** The id of the earliest message actually included in the assembled history this turn, or null. */
  readonly contextBoundaryMessageId: MessageId | null;
}

/** The wire authorName for a user/narrator row: the row's own stamped personaId resolved through the
 *  per-chat producer, not the current active persona. A null stamp or unresolvable id yields null, so
 *  `applyNamesBehavior` falls back to the active persona. */
function userRowAuthorName(
  personaId: PersonaId | null,
  macroNames: HistoryMacroNames,
): string | null {
  return personaId !== null ? (macroNames.personaNamesById.get(personaId)?.name ?? null) : null;
}

/** Maps the loaded canon to SHAPE wire rows: drops hidden + system rows, resolves each row's macros
 *  against its own stamps + the per-chat macroNames producer (matching client display resolution). */
function toShapeCanon(
  canon: readonly MessageView[],
  ctx: AssembleContext,
  macroNames: HistoryMacroNames,
): ShapeCanonRow[] {
  const nameById = new Map<CharacterId, string>();
  const cast = ctx.cast ?? [];
  const ids = ctx.castCharacterIds ?? [];
  ids.forEach((id, i) => {
    const name = cast[i]?.name;
    if (id !== null && name !== undefined) {
      nameById.set(id, name);
    }
  });
  const rows: ShapeCanonRow[] = [];
  for (const m of canon) {
    if (m.excludedFromPrompt || m.role === "system") {
      continue;
    }
    const stamps = { characterId: m.characterId, personaId: m.personaId };
    if (m.role === "assistant") {
      const authorName = m.characterId !== null ? (nameById.get(m.characterId) ?? null) : null;
      rows.push({
        role: "assistant",
        content: renderHistoryMacros(m.content, stamps, ctx, {
          producer: macroNames,
          speakerCharName: authorName ?? undefined,
        }),
        characterId: m.characterId,
        authorName,
        messageId: m.id,
      });
    } else {
      // User/narrator rows: {{user}}/{{persona}} resolve to this row's own stamped personaId, falling back
      // to the active persona only when the stamp is null.
      rows.push({
        role: "user",
        content: renderHistoryMacros(m.content, stamps, ctx, { producer: macroNames }),
        authorName: userRowAuthorName(m.personaId, macroNames),
        messageId: m.id,
      });
    }
  }
  return rows;
}

/** The history-budget reserve: the model window capped by the user's soft max, reserving the intent's
 *  output budget + the assembled system tokens. */
function fitBudget(
  args: RunTurnPipelineArgs,
  systemTokens: number,
): {
  windowTokens: number;
  softMaxTokens: number | undefined;
  reserveOutputTokens: number;
  systemTokens: number;
} {
  const reserveOutputTokens =
    args.intent.maxOutputTokens ?? args.connection.capability.output.maxTokens.max;
  return {
    windowTokens: args.connection.capability.context.window,
    softMaxTokens: args.intent.maxContextTokens,
    reserveOutputTokens,
    systemTokens,
  };
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
    | { kind: "text"; text: string }
    | { kind: "reasoning"; text: string }
    | { kind: "final"; economics: TurnEconomics }
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
          onWarn: (msg, warnErr) =>
            getLog().warn({ err: warnErr, macroWarn: msg }, "chat: macro budget/eval trip (D53)"),
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
        getLog().warn(
          { err: scriptErr, placement: "AI_OUTPUT", findRegex: script.findRegex },
          "chat: host-tier regex script failed (D53 watchdog)",
        ),
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
        getLog().warn(
          { err: scriptErr, placement: "REASONING", findRegex: script.findRegex },
          "chat: host-tier regex script failed (D53 watchdog)",
        ),
    });
  }

  return { content, reasoning };
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

  // BUILD — the system-prompt halves + the after-history (in_chat) section splices.
  const assembled = buildPrompt(ctx.promptConfig, ctx);

  // SHAPE — the wire history + the cache breakpoint.
  const inChatInjections: ChatInjection[] = [
    ...(ctx.chatInjections ?? []).filter((i) => i.position === "in_chat"),
    ...assembled.afterHistory,
  ];
  const speakers = {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive — `activePersona` is `AssemblePersona | null | undefined` (cross-package zod inference), so `?.name ?? "User"` is required.
    user: ctx.activePersona?.name ?? "User",
    assistant: args.shape?.speakerName ?? ctx.character.name,
  };
  const shaped = shapeTurn({
    canon: assembled.sendHistory
      ? toShapeCanon(args.canon, ctx, args.historyMacroNames ?? EMPTY_HISTORY_MACRO_NAMES)
      : [],
    appendUserTurn: args.appendUserTurn ?? null,
    injections: inChatInjections,
    output: args.shape?.output ?? "per-speaker",
    cardScope: args.shape?.cardScope ?? "merged",
    scopedTargetId: args.shape?.scopedTargetId ?? null,
    namesBehavior: ctx.promptConfig.namesBehavior ?? "default",
    speakers,
    groupNudge: args.groupNudge ?? null,
    // roleHandling is the preset's user-intent knob; SHAPE clamps it against the model's roleHandlingFloor.
    assistantPrefill: args.connection.capability.turns?.assistantPrefill === true,
    roleHandling: ctx.promptConfig.params.advanced?.roleHandling,
    roleHandlingFloor: args.connection.capability.turns?.roleHandlingFloor,
  });

  // FIT — the history-budget tail.
  const systemTokens = estimateTokens([assembled.static, assembled.dynamic].join("\n\n"));
  const fitted = fitHistory(shaped.history, fitBudget(args, systemTokens));

  // REQUEST — the one seam where the shaped string body becomes content-parts: tokenize embedded image
  // refs, resolve to URLs, gated by input.vision (a non-vision model drops them + we flag the turn).
  const visionOk = args.connection.capability.input?.vision === true;
  const built = await Promise.all(
    fitted.history.map(async (h) => {
      const { parts, dropped } = await toContentParts(h.content, visionOk, args.resolveImageUrl);
      const row: TurnMessage =
        h.name === undefined
          ? { role: h.role, content: parts }
          : { role: h.role, content: parts, name: h.name };
      return { row, dropped };
    }),
  );
  const history: TurnMessage[] = built.map((b) => b.row);
  const imageDropped = built.some((b) => b.dropped);
  const baseRequest: TurnRequest = {
    connection: args.connection,
    chatId: args.chatId,
    prompt: assembled,
    history,
    intent: args.intent,
    kind: args.kind,
    ownerConsented: args.ownerConsented,
    cacheBreakpointFromEnd: shaped.cacheBreakpointFromEnd ?? null,
    signal: args.signal,
  };

  // REDUCE + the tool-recurse loop.
  const attach = attachTools(args, baseRequest);
  const loop = await runRecurseLoop({ args, request: attach.request, set: attach.set });
  // RECEIVE, applied once over the depth-cumulative text (prose flows across recursion depths into one variant).
  const received = applyReceiveTransforms(
    { content: loop.content, reasoning: loop.reasoning },
    args,
  );
  return {
    request: attach.request,
    content: received.content,
    reasoning: received.reasoning,
    economics: loop.economics,
    cacheBreakpointFromEnd: attach.request.cacheBreakpointFromEnd,
    droppedCount: fitted.droppedCount,
    contextBoundaryMessageId: fitted.earliestKeptMessageId,
    imageDropped,
    toolRecords: loop.records,
    toolsUnsupported: attach.unsupported,
    worldInfoEntryIds: ctx.wiTrace?.entryIds ?? [],
  };
}

// Tools ride only when names were gather-contributed AND the ops are wired AND capability.tools declares
// support — attached-but-unsupported drops them (runs tool-less) and flags tools_unsupported. A tool-less
// request carries no tools field.
function attachTools(
  args: RunTurnPipelineArgs,
  baseRequest: TurnRequest,
): { request: TurnRequest; set: ChatToolSet | null; unsupported: boolean } {
  const wantTools = args.attachedToolNames.length > 0 && args.tools !== null;
  const toolsSupported = args.connection.capability.tools !== undefined;
  if (!wantTools || args.tools === null) {
    return { request: baseRequest, set: null, unsupported: false };
  }
  if (!toolsSupported) {
    return { request: baseRequest, set: null, unsupported: true };
  }
  const set = args.tools.resolveTools(args.attachedToolNames);
  return {
    request: {
      ...baseRequest,
      tools: args.tools.toWireTools(set),
      toolChoice: { mode: "auto" },
    },
    set,
    unsupported: false,
  };
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
}): Promise<{
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
    // biome-ignore lint/performance/noAwaitInLoops: the recurse loop is inherently sequential (03 §2).
    const batch = await args.tools.executeToolCalls(set, calls, args.toolExecFrame);
    records.push(...batch);
    history = [...history, ...toolExchangeMessages(reduced.content, batch)];
    depth += 1;
  }
  return { content, reasoning, economics, records };
}

/** Recurses only when tools rode this request AND the finish reason says "tool" AND the reducer assembled
 *  ≥1 call; null means the turn is done. */
function pivotCalls(
  set: ChatToolSet | null,
  tools: ChatToolOps | null,
  economics: TurnEconomics | null,
): readonly ToolCallInput[] | null {
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
function aggregateEconomics(
  acc: TurnEconomics | null,
  next: TurnEconomics | null,
): TurnEconomics | null {
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

/** Tokenizes a shaped string body into provider content-parts; image spans resolve to a URL or drop when
 *  the model lacks vision or the ref resolves to null. */
async function toContentParts(
  body: string,
  visionOk: boolean,
  resolveImageUrl: (ref: ContentImageRef) => Promise<string | null>,
): Promise<{ parts: ChatContentPart[]; dropped: boolean }> {
  const resolved = await Promise.all(
    tokenizeContent(body).map(
      async (span): Promise<ChatContentPart | { droppedAlt: string } | null> => {
        if (span.kind === "text") {
          return span.text.length > 0 ? { type: "text", text: span.text } : null;
        }
        if (!visionOk) {
          return { droppedAlt: span.alt };
        }
        const url = await resolveImageUrl(span.ref);
        return url === null ? { droppedAlt: span.alt } : { type: "image", url };
      },
    ),
  );
  const parts: ChatContentPart[] = [];
  let dropped = false;
  const droppedAlts: string[] = [];
  for (const r of resolved) {
    if (r === null) {
      continue;
    }
    if ("droppedAlt" in r) {
      dropped = true;
      if (r.droppedAlt.length > 0) {
        droppedAlts.push(r.droppedAlt);
      }
      continue;
    }
    parts.push(r);
  }
  if (parts.length === 0) {
    // Only substitute a placeholder when a drop emptied the row; a genuinely empty body keeps its empty text part.
    parts.push({ type: "text", text: dropped ? droppedImagePlaceholder(droppedAlts) : "" });
  }
  return { parts, dropped };
}
