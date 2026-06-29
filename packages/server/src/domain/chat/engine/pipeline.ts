// domain/chat/engine/pipeline — the per-turn EXECUTION pipeline (chat.md §2 "the domain calls a role, never
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
import type { ApplyRegexReplaceOp, RunChatTurnOp } from "../contract/context";
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
  /** The per-speaker two-axis SHAPE (chat.md Part III §7), set by the group round driver. ABSENT ⇒ the
   *  single-speaker core's pinned default (per-speaker/merged/no fold, `{{char}}`=the ctx primary). */
  readonly shape?: TurnSpeakerShape | undefined;
  /** Fan one streamed delta out (the engine wires this to the chat bus / SSE log). Fire-and-forget by the
   *  reducer (the per-delta emit is NOT on the durable-await path — that is the lifecycle events). */
  readonly onDelta: (delta: ChatDeltaEvent) => void;
  readonly signal?: AbortSignal | undefined;
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

/** RECEIVE post-processing (chat.md §2 RECEIVE order) applied to the reduced `{content, reasoning}` BEFORE the
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
 * Execute ONE single-speaker turn: BUILD → SHAPE → FIT → REQUEST → REDUCE (chat.md §2). Pure orchestration
 * of injected ops; persists nothing (the engine lifecycle commits the returned result). The assemble ctx is
 * consumed READ-ONLY (immutability — chat.md §5).
 */
export async function runTurnPipeline(args: RunTurnPipelineArgs): Promise<TurnPipelineResult> {
  const ctx = args.assembleContext;

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
    // The arbitration/round-driver chunk's two-axis seam (chat.md Part III §7): the per-speaker label is the
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
  const request: TurnRequest = {
    connection: args.connection,
    prompt: assembled,
    history,
    intent: args.intent,
    kind: args.kind,
    cacheBreakpointFromEnd: shaped.cacheBreakpointFromEnd ?? null,
    signal: args.signal,
  };

  // 5. REDUCE — one drain of the role stream.
  const reduced = await reduceStream(args.runChatTurn(request), args);
  // 6. RECEIVE — <think>-demux → AI_OUTPUT regex → post-process → REASONING regex (chat.md §2; canon-mutating
  //    at write — the engine persists THIS post-regex {content, reasoning}). The reduced economics are unchanged.
  const received = applyReceiveTransforms(reduced, args);
  return {
    request,
    content: received.content,
    reasoning: received.reasoning,
    economics: reduced.economics,
    cacheBreakpointFromEnd: request.cacheBreakpointFromEnd,
    droppedCount: fitted.droppedCount,
    imageDropped,
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
