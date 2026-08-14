// domain/chat/verbs/compaction — the manual `compact` lever + the lock-free `runCompaction` core. The
// portable compaction marker is chats.compactSummary + chats.compactedAtSeq (chat canon, not backend session
// state — so a source swap carries it forward; the stateless read side splices it into the top history slot).
//
// FULL-RESET CHAINED MARKER (#9): each pass rebuilds ONE marker covering the whole in-context conversation —
// the prior marker PLUS every prompt-eligible turn since it, summarized to a fresh marker stamped at the new
// `coveragePoint`. Markers CHAIN ("it's a new conversation"): the new marker SUPERSEDES the prior, never a
// growing prefix. Generation rides the chat's OWN model via the injected `quietGenerate` (a non-canon quiet
// generation through the resolved connection) — NOT the summarizer rail.
//
// TWO ENTRY POINTS, ONE CORE: `runCompaction` is the lock-free core the composition root injects into the
// engine; the manual `compact` verb is the public host-only lever (gates + emits over the same core). The
// engine never imports the verb.
//
// FAILURE HONESTY: a marker generation that throws propagates (the caller surfaces it); an EMPTY generation
// leaves the EXISTING marker untouched and returns `updated:false` so the caller warns — NEVER a half-written
// or blank marker.
//
// FLAG[compaction-transcript]: the summarized transcript labels each turn by its role (user/assistant/system),
// not the resolved speaker name — richer per-speaker labeling is a later refinement.

import type { DurableChatBusEvent } from "@orb/contracts/chat";
import { MESSAGE_KIND_POLICY } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import { chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { projectBodyForSummary } from "@orb/kit/content";
import type { ChatId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ChatContext } from "../context.ts";
import type { QuietGenerate } from "../contract/context.ts";
import { ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import type { CompactParams } from "../contract/params.ts";
import type { CompactResult } from "../contract/results.ts";
import type { ChatService } from "../contract/service.ts";
import { requireHost } from "../guard.ts";
import { loadCanonHistoryAfter, loadChatRow } from "../persistence/queries.ts";
import { compactionCostDelta } from "../substrate/stats-delta.ts";

/** `coveragePoint` = the seq through which the new marker covers (the fit/marker boundary the caller resolved).
 *  Absent ⇒ cover every committed turn. `connection` is the chat's resolved connection the quiet generation
 *  rides. */
interface RunCompactionArgs {
  readonly chatId: ChatId;
  readonly connection: ResolvedConnection;
  /** The host whose box funds the marker generation — the quiet-op cost lands on THIS owner's stats. */
  readonly ownerId: UserId;
  readonly coveragePoint?: number | undefined;
  readonly instructions?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

interface CompactionBundle extends Pick<ChatService, "compact"> {
  readonly runCompaction: (args: RunCompactionArgs) => Promise<CompactResult>;
}

interface CompactionDeps {
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
  /** The quiet-generation seam — a non-canon generation through the chat's own model (wired at compose). */
  readonly quietGenerate: QuietGenerate;
  /** Resolve the chat's connection for the MANUAL lever (the engine hook passes its own `prep.connection`). */
  readonly resolveConnection: (args: { readonly runAsUserId: UserId; readonly chatId: ChatId }) => Promise<ResolvedConnection>;
}

/** Build the marker generation's user prompt from the prior marker (folded in so the new marker supersedes it),
 *  the new transcript span, and any caller guidance. */
function buildCompactionPrompt(args: { readonly priorSummary: string | null; readonly transcript: string; readonly instructions: string | undefined }): string {
  const parts: string[] = [];
  if (args.priorSummary !== null && args.priorSummary.length > 0) {
    parts.push(`Summary so far:\n${args.priorSummary}`);
  }
  parts.push(`Conversation to summarize:\n${args.transcript}`);
  if (args.instructions !== undefined && args.instructions.length > 0) {
    parts.push(`Additional guidance: ${args.instructions}`);
  }
  return parts.join("\n\n");
}

/** The compaction call's per-pass sampling intent (a summary is not creative writing) — an INTERNAL pin,
 *  sourced from the ONE catalog (`SIDE_GEN_POSTURES.compaction`), never a local const. quiet-generate merges
 *  it OVER the chat's preset params, above the `quiet_generate` floor: the low temp is deliberately pinned here,
 *  while the output length is left to the chat's preset params / the quiet floor (the user's maxOutputTokens now
 *  reaches it). Spread into a mutable `UserIntent` (the catalog entry is `readonly`). */
const COMPACTION_INTENT: UserIntent = { ...SIDE_GEN_POSTURES.compaction };

/** Generate the fresh marker for a NON-empty prompt-eligible span + write it. Split out to keep the core under
 *  the complexity cap. A THROW propagates (failure honesty); an EMPTY generation leaves the prior marker intact. */
async function buildMarker(
  ctx: ChatContext,
  quietGenerate: QuietGenerate,
  env: {
    readonly chatId: ChatId;
    readonly connection: ResolvedConnection;
    readonly ownerId: UserId;
    readonly priorSummary: string | null;
    readonly transcript: string;
    readonly instructions: string | undefined;
    readonly coveredThroughSeq: number;
    readonly fromSeq: number;
    readonly signal: AbortSignal | undefined;
  },
): Promise<CompactResult> {
  const userText = buildCompactionPrompt({ priorSummary: env.priorSummary, transcript: env.transcript, instructions: env.instructions });
  const result = await quietGenerate({
    chatId: env.chatId,
    connection: env.connection,
    // PROSE-1 census 77 — the summarizer instruction is the ROOM HOST's slot (a chat's markers keep one
    // voice regardless of who triggered the pass). Empty overrides ⇒ the shipped default, byte-identical.
    systemPrompt: resolveProseText("chat.compaction.system", await ctx.resolveChatProse(env.chatId)),
    userText,
    intent: COMPACTION_INTENT,
    ...(env.signal !== undefined ? { signal: env.signal } : {}),
  });
  const summary = result.text.trim();
  if (summary.length === 0) {
    // Empty generation over a NON-empty span → a real failure. THROW so the caller surfaces it (the hook warns
    // `compaction_failed`, the manual verb propagates); the EXISTING marker + coverage stamp are left untouched
    // (never a blank marker), so a retry next turn is honest.
    throw new ChatOperationError("compaction_empty", `compaction produced an empty marker for chat ${env.chatId}`);
  }
  await ctx.db.update(chats).set({ compactSummary: summary, compactedAtSeq: env.coveredThroughSeq, updatedAt: ctx.now() }).where(eq(chats.id, env.chatId));
  // COST VISIBILITY: the quiet marker generation's spend lands on the owner's + daily stats (the cost-visibility
  // rule). A null/0 cost (a local vLLM turn, or a backend that reports none) is a benign no-op delta.
  if (result.costUsd !== null && result.costUsd > 0) {
    const stmts: BatchStmt[] = [];
    ctx.applyStatsDelta(stmts, ctx.db, compactionCostDelta({ ownerId: env.ownerId, costUsd: result.costUsd, now: ctx.now() }));
    if (stmts.length > 0) {
      await ctx.db.batch(batchMany(stmts));
    }
  }
  return { summary, compactedAtSeq: env.coveredThroughSeq, updated: true };
}

/** The lock-free compaction core. Rebuilds ONE marker over [prior marker + prompt-eligible turns since it,
 *  through `coveragePoint`] via the chat's own model, writes the advanced marker + coverage stamp. A span with
 *  no new turns is an idempotent no-op. No gate / no bus emit — that's the verb's / engine's job. */
function makeRunCompaction(ctx: ChatContext, quietGenerate: QuietGenerate): (args: RunCompactionArgs) => Promise<CompactResult> {
  return async ({ chatId, connection, ownerId, coveragePoint, instructions, signal }: RunCompactionArgs): Promise<CompactResult> => {
    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    const fromSeq = chat.compactedAtSeq ?? 0;
    const afterCheckpoint = await loadCanonHistoryAfter(ctx.db, chatId, fromSeq);
    const capped = coveragePoint === undefined ? afterCheckpoint : afterCheckpoint.filter((m) => m.seq <= coveragePoint);
    // The coverage stamp advances over the whole capped span (hidden rows included — the marker must still cover
    // the seq range so it can't be recompacted), but the SUMMARIZED transcript excludes prompt-hidden rows
    // (`excludedFromPrompt`): the marker stands in for prompt-eligible history and is member-peekable, so it must
    // never fold a hidden row's content into itself (a cross-member leak sink). Identical on the full-span read.
    // The marker stands in for PROMPT-ELIGIBLE history, so the same two planes the shape dispatch reads gate it:
    // the host's `excludedFromPrompt` hide AND the row's declared PURPOSE (D129 — `prompt:"never"`, i.e. an OOC
    // `comment`, is not prompt material, so folding one into a durable member-peekable marker would smuggle a
    // row into the very prompt its policy holds it out of). Read from `MESSAGE_KIND_POLICY` rather than a
    // hardcoded kind list: one home, and a fourth kind is a policy-row decision, not a sweep of this file.
    const coveredThroughSeq = capped.at(-1)?.seq;
    const window = capped.filter((m) => !m.excludedFromPrompt && MESSAGE_KIND_POLICY[m.kind].prompt !== "never");
    if (coveredThroughSeq === undefined) {
      // Nothing new to compact — the marker is already current (idempotent no-op; the coverage point unchanged).
      return { summary: chat.compactSummary ?? "", compactedAtSeq: fromSeq, updated: false };
    }
    if (window.length === 0) {
      // The whole new span is prompt-hidden — nothing summarizable, but the coverage stamp still advances so the
      // hidden span isn't reconsidered forever (no generation spend on an empty transcript).
      await ctx.db.update(chats).set({ compactedAtSeq: coveredThroughSeq, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
      return { summary: chat.compactSummary ?? "", compactedAtSeq: coveredThroughSeq, updated: false };
    }
    // §3.5 summary-plane projection: cards collapse to the stub (the summarizer never eats the blob) and
    // HIDDEN-class spans are STRIPPED — the marker is durable + member-peekable, so a folded-in lie truth
    // would re-open the exact §3.6 leak the payload strip closes (fail-closed; trade named at the kit fn).
    const transcript = window.map((m) => `${m.role}: ${projectBodyForSummary(m.content)}`).join("\n");
    return await buildMarker(ctx, quietGenerate, {
      chatId,
      connection,
      ownerId,
      priorSummary: chat.compactSummary,
      transcript,
      instructions,
      coveredThroughSeq,
      fromSeq,
      signal,
    });
  };
}

/** `compact` — host-only. The manual lever over the lock-free core: gate, resolve the chat's connection, run the
 *  core, emit `chatUpdated`. */
function createCompact(ctx: ChatContext, deps: CompactionDeps, runCompaction: (args: RunCompactionArgs) => Promise<CompactResult>): ChatService["compact"] {
  return async ({ principal, chatId, instructions }: CompactParams): Promise<CompactResult> => {
    // The caller IS the host (requireHost passed) → the host funds the marker generation on the chat's connection.
    await requireHost(ctx, principal, chatId);
    const connection = await deps.resolveConnection({ runAsUserId: principal.userId, chatId });
    const result = await runCompaction({ chatId, connection, ownerId: principal.userId, ...(instructions !== undefined ? { instructions } : {}) });
    await deps.emit({ type: "chatUpdated", chatId });
    return result;
  };
}

/** The root spreads `compact` into the full service AND injects `runCompaction` into the engine. */
export function createCompaction(ctx: ChatContext, deps: CompactionDeps): CompactionBundle {
  const runCompaction = makeRunCompaction(ctx, deps.quietGenerate);
  return {
    compact: createCompact(ctx, deps, runCompaction),
    runCompaction,
  };
}
