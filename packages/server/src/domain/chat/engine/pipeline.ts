// domain/chat/engine/pipeline — the per-turn EXECUTION pipeline ("the domain calls a role, never
// a backend" + the turn lifecycle's assemble→shape→run→reduce→fit middle). PURE orchestration of INJECTED
// ops: it does NOT touch the db, credentials, or any backend — it BUILDS a `TurnRequest` from the DONE
// assembly producer's output + the DONE SHAPE, calls the injected `runChatTurn` ROLE, reduces the stream, and
// applies the §8 history-budget fit. Returns a result the engine lifecycle persists (this file persists
// nothing).
//
// THE ORDER (read top to bottom in `runTurnPipeline`):
//   1. BUILD   — `assemblePrompt(config, ctx)` → the static/dynamic system halves + the after-history splices.
//   2. SHAPE   — `shape(ctx→ShapeInput, speaker)` → the egocentric/spliced/squashed/name-stamped wire history
//                + the §8 `cacheBreakpointFromEnd` (single-speaker core: per-speaker / merged / no fold).
//   3. FIT     — `fitHistoryToWindow` (the §8 history-budget TAIL — the final SHAPE step; offset-from-end
//                survives its front-drop, so the breakpoint needs no retag).
//   4. REQUEST — assemble the `TurnRequest` (connection + prompt + fitted history + intent + kind + the
//                breakpoint offset). The runner translates THIS into its sealed request (we never see it).
//   5. REDUCE  — iterate `runChatTurn(req)`: fan text/reasoning deltas to `onDelta`, fold the terminal
//                `final` chunk's economics. ONE model call + reduce — NO D48 tool-recurse loop (that is the
//                NEXT chunk; the seam is "a single drain of the async iterable").
//
// SINGLE-SPEAKER CORE: output is pinned `per-speaker` / `merged` (no narrator, no scoped egocentric fold) —
// the arbitration/auto-mode chunk extends this to resolve `output`/`cardScope`/`scopedTargetId` per the
// resolved cast. The seam is the `shape({...})` literal below.

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
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { executeRegexScripts } from "@orb/kit/regex";
import { estimateTokens } from "@orb/kit/tokens";
import { applyReceivePostProcess } from "@orb/server/kit/post-process";
import { parseReasoningTags } from "@orb/server/kit/reasoning";
import type { ToolCallInput } from "#infra/providers";
import type {
  ApplyRegexReplaceOp,
  ChatToolExecFrame,
  ChatToolOps,
  ChatToolSet,
  RunChatTurnOp,
} from "../contract/context";
import type {
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
  shapeContextForSpeaker,
  shapeTurn,
} from "../substrate/assembly-access";

/** A SHAPE canon row (the `shape()` input shape — file-local, matched structurally; the wire role axis is
 *  `user|assistant`, system rows never reach the delivered history). */
interface ShapeCanonRow {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly authorName?: string | null;
  readonly characterId?: CharacterId | null;
}

/** What `runTurnPipeline` consumes — the immutable assemble ctx + the loaded canon + the resolved connection
 *  + the turn axes. File-local (the `types-in-contract` gate); the engine passes a structural literal. */
interface RunTurnPipelineArgs {
  /** The injected chat ROLE (`ctx.runChatTurn`) — the ONE turn dispatch. */
  readonly runChatTurn: RunChatTurnOp;
  /** The injected node:vm ReDoS watchdog (`ctx.applyRegexReplace`, D53) — the RECEIVE AI_OUTPUT/REASONING regex
   *  passes run their `text.replace` under it (the engine binds it from ctx; tests inject directly). */
  readonly applyRegexReplace: ApplyRegexReplaceOp;
  /** Resolve a parsed message-image ref → a model-fetchable URL, or null to drop it (the engine binds
   *  `ctx.resolveImageUrl` with the turn's owner). Used at the REQUEST seam to produce image content-parts. */
  readonly resolveImageUrl: (ref: ContentImageRef) => Promise<string | null>;
  /** The IMMUTABLE assemble ctx (RESOLVE+GATHER product — never mutated here; SHAPE is pure of it). */
  readonly assembleContext: AssembleContext;
  /** The loaded canon history (D26 slot⋈variant), oldest→newest — `loadCanonHistory`'s rows. */
  readonly canon: readonly MessageView[];
  readonly connection: ResolvedConnection;
  readonly intent: UserIntent;
  readonly kind: TurnKind;
  readonly chatId: ChatId;
  /** A synthetic trailing user turn (regen/continue); null for a plain send (the canon tail is the user row). */
  readonly appendUserTurn?: string | null | undefined;
  /** The multi-speaker group nudge; null for the single-speaker core. */
  readonly groupNudge?: string | null | undefined;
  /** The per-speaker two-axis SHAPE, set by the group round driver. ABSENT ⇒ the
   *  single-speaker core's pinned default (per-speaker/merged/no fold, `{{char}}`=the ctx primary). */
  readonly shape?: TurnSpeakerShape | undefined;
  /** Fan one streamed delta out (the engine wires this to the chat bus / SSE log). Fire-and-forget by the
   *  reducer (the per-delta emit is NOT on the durable-await path — that is the lifecycle events). */
  readonly onDelta: (delta: ChatDeltaEvent) => void;
  readonly signal?: AbortSignal | undefined;
  // ── The D48 recurse-loop axis (tool-use-design/03 §2; all engine-threaded from prep/ctx) ──────────
  /** The injected tool ops (`ctx.tools`); null = tool-use unwired (the byte-identical no-op). */
  readonly tools: ChatToolOps | null;
  /** The GATHER-contributed attachment names (03 §2.3); empty = no tools ride (plain chats, today). */
  readonly attachedToolNames: readonly string[];
  /** The chat-level recurse-depth cap (03 §2.1; the verb reads the metadata knob, seed 5). */
  readonly toolRecurseLimit: number;
  /** The Principal-blind identity frame `executeToolCalls` receives (the entry adapter resolves the
   *  host Principal from `runAsUserId` — the turn-identity gate keeps principals out of this tier). */
  readonly toolExecFrame: ChatToolExecFrame;
}

/** The pipeline product the engine persists — the reduced generation + the request (for `promptSnapshot`) +
 *  the §8 offset. File-local; the engine reads the inferred return. */
interface TurnPipelineResult {
  readonly request: TurnRequest;
  readonly content: string;
  readonly reasoning: string | null;
  /** The terminal `final` chunk's economics (null if the runner emitted none). */
  readonly economics: TurnEconomics | null;
  readonly cacheBreakpointFromEnd: number | null;
  /** How many oldest turns the fit-pass dropped (trace). */
  readonly droppedCount: number;
  /** True when ≥1 image part was dropped because the model lacks `input.vision` (D45) — the engine emits a
   *  `warning` bus event (`image_dropped`) once per turn when set. */
  readonly imageDropped: boolean;
  /** The turn's cumulative tool exchange across every recursion depth (emission/execution order — D48;
   *  empty on a tool-less turn; the engine persists it on the variant). */
  readonly toolRecords: readonly ToolCallRecord[];
  /** True when tools were ATTACHED but `capability.tools` is absent — dropped, the turn ran tool-less
   *  (the engine emits the `tools_unsupported` warning once; D48/D51's domain-side gate). */
  readonly toolsUnsupported: boolean;
}

/** Map the loaded canon (D26 `MessageView`) → the SHAPE wire rows: drop hidden + system rows (system content
 *  rides the assembled system block, never the messages[] wire), resolve each assistant row's authoring
 *  character name (from the cast, index-aligned with `castCharacterIds`) + each user row's persona name. */
function toShapeCanon(canon: readonly MessageView[], ctx: AssembleContext): ShapeCanonRow[] {
  const nameById = new Map<CharacterId, string>();
  const cast = ctx.cast ?? [];
  const ids = ctx.castCharacterIds ?? [];
  ids.forEach((id, i) => {
    const name = cast[i]?.name;
    if (id !== null && name !== undefined) {
      nameById.set(id, name);
    }
  });
  // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive — `activePersona`/`pinnedPersona` are `AssemblePersona | null | undefined` (cross-package @orb/contracts/chat zod inference, the family the assemble.ts/context.ts headers document), so `?.name ?? …` is required.
  const userName = ctx.activePersona?.name ?? ctx.pinnedPersona?.name ?? null;
  const rows: ShapeCanonRow[] = [];
  for (const m of canon) {
    if (m.excludedFromPrompt || m.role === "system") {
      continue;
    }
    if (m.role === "assistant") {
      rows.push({
        role: "assistant",
        content: m.content,
        characterId: m.characterId,
        authorName: m.characterId !== null ? (nameById.get(m.characterId) ?? null) : null,
      });
    } else {
      rows.push({ role: "user", content: m.content, authorName: userName });
    }
  }
  return rows;
}

/** The §8 history-budget reserve: the model window (capability) capped by the user's soft max, reserving the
 *  intent's output budget + the assembled system tokens. */
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

/** Drain the role's stream: text/reasoning deltas → accumulate + fan out; the terminal `final` → economics.
 *  ONE drain, no tool-recurse (D48 is the NEXT chunk). The runner's `final.content`/`reasoning` (when given)
 *  are the authoritative text; the accumulated deltas are the fallback. */
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

/** RECEIVE post-processing applied to the reduced `{content, reasoning}` BEFORE the
 *  engine persists it (canon-mutating-at-write — §7). The order is fixed:
 *    0. `<think>` demux — split inline reasoning out of content ONLY when the native reasoning channel is empty
 *       AND `reasoningParse.autoParse` is on (native-first; never double-counts a real reasoning trace — D47#3).
 *    1. AI_OUTPUT regex on content (host-tier scripts; the replace TEMPLATE gets the author-side macro ctx —
 *       macros NEVER run on the model OUTPUT itself, only on the template; shared-dissolution §9).
 *    2. post-process on content (singleLine/dropIncomplete/trim) — AFTER the AI_OUTPUT regex (§3 rule 8).
 *    3. REASONING regex on the reasoning channel.
 *  Each host-side regex `text.replace` runs under the injected node:vm watchdog (`args.applyRegexReplace`, D53). */
function applyReceiveTransforms(
  reduced: { content: string; reasoning: string | null },
  args: RunTurnPipelineArgs,
): { content: string; reasoning: string | null } {
  const ctx = args.assembleContext;
  const cfg = ctx.promptConfig;
  let content = reduced.content;
  let reasoning = reduced.reasoning;

  // 0. <think> inline-reasoning fallback — gated on empty-native-reasoning + autoParse (native-first dedup).
  const rp = cfg.reasoningParse;
  if (rp?.autoParse === true && (reasoning === null || reasoning.length === 0)) {
    const parsed = parseReasoningTags(content, { prefix: rp.prefix, suffix: rp.suffix });
    if (parsed !== null) {
      reasoning = parsed.reasoning;
      content = parsed.content;
    }
  }

  // 1 + 3. host-tier AI_OUTPUT/REASONING regex (build the author-side replace-template macro ctx ONCE).
  const scripts = ctx.hostTierRegexScripts ?? [];
  const macroCtx =
    scripts.length > 0
      ? buildTurnMacroContext({
          assembleCtx: ctx,
          model: args.connection.model,
          chatId: args.chatId,
        })
      : null;
  if (macroCtx !== null) {
    content = executeRegexScripts({
      text: content,
      scripts,
      placement: "AI_OUTPUT",
      ctx: macroCtx,
      applyReplace: args.applyRegexReplace,
    });
  }

  // 2. post-process AFTER the AI_OUTPUT regex (always — independent of host scripts).
  content = applyReceivePostProcess(content, cfg.postProcess);

  if (macroCtx !== null && reasoning !== null) {
    reasoning = executeRegexScripts({
      text: reasoning,
      scripts,
      placement: "REASONING",
      ctx: macroCtx,
      applyReplace: args.applyRegexReplace,
    });
  }

  return { content, reasoning };
}

/**
 * Execute ONE single-speaker turn: BUILD → SHAPE → FIT → REQUEST → REDUCE. Pure orchestration
 * of injected ops; persists nothing (the engine lifecycle commits the returned result). The assemble ctx is
 * consumed READ-ONLY (immutability).
 */
export async function runTurnPipeline(args: RunTurnPipelineArgs): Promise<TurnPipelineResult> {
  // Per-speaker CARD-SECTION shape: pick THIS speaker's card + co-speakers off the immutable
  // ctx (D60 — an agent's card is its soul). ABSENT shape ⇒ the single-speaker core, byte-identical (D16).
  const ctx =
    args.shape !== undefined
      ? shapeContextForSpeaker(args.assembleContext, {
          ref: args.shape.speakerRef,
          cardScope: args.shape.cardScope,
        })
      : args.assembleContext;

  // 1. BUILD — the system-prompt halves + the after-history (`in_chat`) section splices.
  const assembled = buildPrompt(ctx.promptConfig, ctx);

  // 2. SHAPE — the wire history + the §8 breakpoint. The `in_chat` injections are the WI/user `in_chat`
  //    entries (already on the ctx) ∪ the BUILD after-history sections.
  const inChatInjections: ChatInjection[] = [
    ...(ctx.chatInjections ?? []).filter((i) => i.position === "in_chat"),
    ...assembled.afterHistory,
  ];
  const speakers = {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive — `activePersona` is `AssemblePersona | null | undefined` (cross-package zod inference), so `?.name ?? "User"` is required.
    user: ctx.activePersona?.name ?? "User",
    // The arbitration/round-driver chunk's two-axis seam: the per-speaker label is the
    // resolved speaker's name (per-speaker) / joined-cast name (narrator); ABSENT ⇒ the ctx primary.
    assistant: args.shape?.speakerName ?? ctx.character.name,
  };
  const shaped = shapeTurn({
    canon: assembled.sendHistory ? toShapeCanon(args.canon, ctx) : [],
    appendUserTurn: args.appendUserTurn ?? null,
    injections: inChatInjections,
    // The two-axis (output × cardScope × scopedTarget); ABSENT ⇒ the single-speaker core's pinned default
    // (per-speaker / merged / no egocentric fold). Solo stays byte-identical (D16).
    output: args.shape?.output ?? "per-speaker",
    cardScope: args.shape?.cardScope ?? "merged",
    scopedTargetId: args.shape?.scopedTargetId ?? null,
    namesBehavior: ctx.promptConfig.namesBehavior ?? "default",
    speakers,
    groupNudge: args.groupNudge ?? null,
  });

  // 3. FIT — the §8 history-budget tail (offset-from-end survives the front-drop).
  const systemTokens = estimateTokens([assembled.static, assembled.dynamic].join("\n\n"));
  const fitted = fitHistory(shaped.history, fitBudget(args, systemTokens));

  // 4. REQUEST — the chat-domain turn request the role translates. This is the ONE seam where the shaped
  //    STRING body becomes content-parts (D45): tokenize embedded image refs → resolve to URLs (asset→CAS,
  //    external→gated) → image parts, gated by `input.vision` (a non-vision model drops them + we flag the
  //    turn). The SHAPE row's `name` (the `completion` names-behavior; names.ts) threads to the wire `name`.
  const visionOk = args.connection.capability.input?.vision === true;
  const built = await Promise.all(
    fitted.history.map(async (h) => {
      const { parts, dropped } = await toContentParts(h.content, visionOk, args.resolveImageUrl);
      const row: TurnMessage =
        // Omit the `name` key entirely unless set, so the common path stays a clean role+content row.
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
    prompt: assembled,
    history,
    intent: args.intent,
    kind: args.kind,
    cacheBreakpointFromEnd: shaped.cacheBreakpointFromEnd ?? null,
    signal: args.signal,
  };

  // 5. REDUCE + the D48 recurse loop (tool-use-design/03 §2).
  const attach = attachTools(args, baseRequest);
  const loop = await runRecurseLoop({ args, request: attach.request, set: attach.set });
  // 6. RECEIVE — <think>-demux → AI_OUTPUT regex → post-process → REASONING regex (canon-mutating
  //    at write — the engine persists THIS post-regex {content, reasoning}), applied ONCE over the
  //    depth-cumulative text (prose flows across recursion depths into the ONE variant — 03 §2).
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
    imageDropped,
    toolRecords: loop.records,
    toolsUnsupported: attach.unsupported,
  };
}

// The D48 attach gate (03 §1 + 02 §2): tools ride only when names were GATHER-contributed AND the ops
// are wired AND `capability.tools` declares support — attached-but-unsupported DROPS them (the turn runs
// tool-less) and flags `tools_unsupported` (the engine emits the domain warning; D51's rule). A tool-less
// request carries NO tools field: byte-identical to pre-D48, wired or null (the 05 §T4 pin).
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
      // The LOOP's default when tools ride (02 §2) — a caller default, never a translator constant.
      toolChoice: { mode: "auto" },
    },
    set,
    unsupported: false,
  };
}

// ── The D48 recurse loop (03 §2 — normative rules each pinned by the loop goldens) ────────────────
// `finishReason:"tool"` is the ONLY pivot (never text-sniffing); the exchange is materialized from the
// RECORDS (arguments/result verbatim — provenance = replay); streaming is continuous across depths on
// the one variant; usage aggregates into one economics row; at the limit, pending calls are RECORDED
// NOT EXECUTED (result:null — side effects the model can't narrate are worse than none). MICRO-CALL
// (03's header delegates): records accumulate in-loop and persist ONCE at commit — our D26 flow mints
// the variant row at commit, so there is no row to flush per-depth against; a crash mid-loop loses the
// records WITH the generation (nothing half-persisted). Revisit criterion: handlers with real external
// side effects wanting crash provenance.
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
    // SEQUENTIAL BY DESIGN: each recursion depends on the previous depth's executed results.
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

/** The recurse pivot (03 §2): recurse ONLY when tools rode this request AND the normalized finish
 *  reason says "tool" AND the reducer assembled ≥1 call — `null` means "the turn is done". Never
 *  text-sniffing; a provider that says stop is done. */
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

/** A limit-hit pending call → the recorded-but-unexecuted record (03 §2.2: `result:null`,
 *  `isError:false` — full provenance, "requested, not run"; the host can regenerate). */
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

/** Materialize one depth's exchange into wire rows FROM THE RECORDS (03 §2 — the model reads exactly
 *  what was persisted, so a swipe-replay reassembles the identical wire history): ONE assistant row
 *  carrying that depth's prose (if any) + its tool-call parts, then ONE `tool` row per record. */
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
        // An executed record's result is ALWAYS a JSON document (the ONE stringify site); null cannot
        // occur here (unexecuted records end the turn, they never re-enter the wire).
        content: record.result ?? "",
        ...(record.isError ? { isError: true } : {}),
      },
    ],
  }));
  return [{ role: "assistant", content: assistantParts }, ...results];
}

/** Fold one depth's economics into the turn aggregate (ONE economics row per user-visible turn —
 *  03 §2): counts/costs SUM (absent stays absent — never a fabricated zero), `ttftMs` is the FIRST
 *  depth's, the terminal reasons/model/window are the LAST depth's, `toolCalls` never aggregates
 *  (per-depth wire data — the records are the durable form). */
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

/** Tokenize a shaped STRING body → provider content-parts (D45). Text spans pass through (empty text skipped);
 *  image spans resolve to `{type:"image",url}` — dropped (with `dropped=true`) when the model lacks vision or
 *  the ref resolves to null (gone asset / `forbidExternalMedia`). A row with no surviving parts → a single
 *  empty text part (the byte-identical text path; never an empty content array on the wire). */
async function toContentParts(
  body: string,
  visionOk: boolean,
  resolveImageUrl: (ref: ContentImageRef) => Promise<string | null>,
): Promise<{ parts: ChatContentPart[]; dropped: boolean }> {
  // Resolve every span concurrently (image refs in one row are independent) — `"dropped"` marks a stripped
  // image, `null` an empty text span to skip.
  const resolved = await Promise.all(
    tokenizeContent(body).map(async (span): Promise<ChatContentPart | "dropped" | null> => {
      if (span.kind === "text") {
        return span.text.length > 0 ? { type: "text", text: span.text } : null;
      }
      if (!visionOk) {
        return "dropped";
      }
      const url = await resolveImageUrl(span.ref);
      return url === null ? "dropped" : { type: "image", url };
    }),
  );
  const parts: ChatContentPart[] = [];
  let dropped = false;
  for (const r of resolved) {
    if (r === "dropped") {
      dropped = true;
    } else if (r !== null) {
      parts.push(r);
    }
  }
  if (parts.length === 0) {
    parts.push({ type: "text", text: "" });
  }
  return { parts, dropped };
}
