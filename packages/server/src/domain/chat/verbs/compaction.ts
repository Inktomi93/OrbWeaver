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
import type { Resolved } from "@orb/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import { chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { projectBodyForSummary } from "@orb/kit/content";
import type { ChatId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import type { ChatContext } from "../context.ts";
import type { QuietGenerate } from "../contract/context.ts";
import { ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import type { CompactParams } from "../contract/params.ts";
import type { CompactResult } from "../contract/results.ts";
import type { ChatService } from "../contract/service.ts";
import { requireHost } from "../guard.ts";
import { loadCanonHistoryAfter, loadChatRow } from "../persistence/queries.ts";
import { isPromptEligible } from "../substrate/prompt-eligibility.ts";
import { compactionCostDelta } from "../substrate/stats-delta.ts";

/** `coveragePoint` = the seq through which the new marker covers (the fit/marker boundary the caller resolved).
 *  Absent ⇒ cover every committed turn. `connection` is the chat's resolved connection the quiet generation
 *  rides. */
interface RunCompactionArgs {
  readonly chatId: ChatId;
  readonly connection: Resolved<"chat">;
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
  readonly resolveConnection: (args: { readonly funderUserId: UserId; readonly chatId: ChatId }) => Promise<Resolved<"chat">>;
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
 *  it OVER the RESOLVED preset's params (a chat carries no preset — D58; the host's active pick resolves at
 *  generation time), above the `quiet_generate` floor: the low temp is deliberately pinned here, while the
 *  output length is left to the resolved preset's params / the quiet floor (the user's maxOutputTokens now
 *  reaches it). Spread into a mutable `UserIntent` (the catalog entry is `readonly`). */
const COMPACTION_INTENT: UserIntent = { ...SIDE_GEN_POSTURES.compaction };

/** Generate the fresh marker for a NON-empty prompt-eligible span + write it. Split out to keep the core under
 *  the complexity cap. A THROW propagates (failure honesty); an EMPTY generation leaves the prior marker intact. */
async function buildMarker(
  ctx: ChatContext,
  quietGenerate: QuietGenerate,
  env: {
    readonly chatId: ChatId;
    readonly connection: Resolved<"chat">;
    readonly ownerId: UserId;
    readonly priorSummary: string | null;
    readonly transcript: string;
    readonly instructions: string | undefined;
    readonly coveredThroughSeq: number;
    /** The coverage stamp this pass READ, verbatim (null = never compacted) — the CAS predicate below. */
    readonly priorCoverage: number | null;
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
  // THE WRITE IS CONDITIONAL, AND THE CORE STAYS LOCK-FREE (#1463 item 5). Two passes can run at once (the
  // engine's managed hook beside the host's manual lever), both read the same `compactedAtSeq` and both pay
  // for a generation — that duplicate SPEND is the accepted cost of lock-freedom and is unchanged. What must
  // not follow is the losing pass stamping its narrower marker OVER the winner's advanced one: the coverage
  // point would regress and the span between them would be re-summarized (and re-billed) on every later pass.
  // So the marker write carries the coverage stamp this pass READ as its predicate (the house CAS idiom — the
  // predicate is the VALUE, `plugin-kv::compareAndSetKv`; `is` rather than `=` because the column is nullable
  // and NULL is the never-compacted state). `RETURNING` is post-update, so a non-empty result means THIS
  // statement moved the row; zero rows means a sibling advanced the marker and this one's is discarded.
  const stmts: BatchStmt[] = [
    ctx.db
      .update(chats)
      .set({ compactSummary: summary, compactedAtSeq: env.coveredThroughSeq, updatedAt: ctx.now() })
      .where(and(eq(chats.id, env.chatId), sql`${chats.compactedAtSeq} is ${env.priorCoverage}`))
      .returning({ id: chats.id }),
  ];
  // COST VISIBILITY: the quiet marker generation's spend lands on the owner's + daily stats (the cost-visibility
  // rule). A null/0 cost (a local vLLM turn, or a backend that reports none) is a benign no-op delta.
  if (result.costUsd !== null && result.costUsd > 0) {
    ctx.applyStatsDelta(stmts, ctx.db, compactionCostDelta({ ownerId: env.ownerId, costUsd: result.costUsd, now: ctx.now() }));
  } else {
    ctx.bumpStatsCanonVersion(stmts, ctx.db, env.ownerId);
  }
  const results = await ctx.db.batch(batchMany(stmts));
  // `batchMany` erases the tuple type (the ONE sanctioned cast); statement 0 is the guarded UPDATE's
  // RETURNING rows — the claim-chat precedent for reading a conditional write's outcome out of a batch.
  const stamped = results[0] as readonly { readonly id: ChatId }[];
  if (stamped.length === 0) {
    // A sibling pass advanced the marker while this one was generating. THIS marker is discarded (never
    // written over the newer one) and the settled state is reported, so the caller's `updated:false` says
    // honestly that this pass changed nothing. The generation's cost delta above still applies — the spend
    // happened whether or not its product landed, and hiding it would understate real money.
    return await settledMarker(ctx, env.chatId, env.priorCoverage ?? 0);
  }
  return { summary, compactedAtSeq: env.coveredThroughSeq, updated: true };
}

/** The settled marker, re-read after a CAS lost — what the losing pass reports instead of its own discarded
 *  product. `fallbackSeq` covers the (unreachable-in-practice) racing-delete read. */
async function settledMarker(ctx: ChatContext, chatId: ChatId, fallbackSeq: number): Promise<CompactResult> {
  const settled = await loadChatRow(ctx.db, chatId);
  return { summary: settled?.compactSummary ?? "", compactedAtSeq: settled?.compactedAtSeq ?? fallbackSeq, updated: false };
}

/** The stamp-only advance: the whole new span is prompt-INELIGIBLE, so there is nothing summarizable, but the
 *  coverage stamp still moves so that span is not reconsidered forever (and no generation is paid for over an
 *  empty transcript). CONDITIONAL for the same reason the marker write is ({@link buildMarker}) — a stamp-only
 *  advance must not walk a concurrent pass's coverage point backwards either. */
async function advanceCoverageOnly(
  ctx: ChatContext,
  env: {
    readonly chatId: ChatId;
    readonly ownerId: UserId;
    readonly priorSummary: string | null;
    readonly priorCoverage: number | null;
    readonly coveredThroughSeq: number;
  },
): Promise<CompactResult> {
  const stmts: BatchStmt[] = [
    ctx.db
      .update(chats)
      .set({ compactedAtSeq: env.coveredThroughSeq, updatedAt: ctx.now() })
      .where(and(eq(chats.id, env.chatId), sql`${chats.compactedAtSeq} is ${env.priorCoverage}`))
      .returning({ id: chats.id }),
  ];
  ctx.bumpStatsCanonVersion(stmts, ctx.db, env.ownerId);
  const results = await ctx.db.batch(batchMany(stmts));
  const stamped = results[0] as readonly { readonly id: ChatId }[];
  if (stamped.length === 0) {
    return await settledMarker(ctx, env.chatId, env.priorCoverage ?? 0);
  }
  return { summary: env.priorSummary ?? "", compactedAtSeq: env.coveredThroughSeq, updated: false };
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
    // row into the very prompt its policy holds it out of). The verdict is `substrate/prompt-eligibility`'s —
    // ONE predicate shared with the quiet extractor's scene, so the two prompt boundaries cannot drift (they
    // did: #1463 item 3), and a fourth kind stays a policy-row decision rather than a sweep of this file.
    const coveredThroughSeq = capped.at(-1)?.seq;
    const window = capped.filter((m) => isPromptEligible(m));
    if (coveredThroughSeq === undefined) {
      // Nothing new to compact — the marker is already current (idempotent no-op; the coverage point unchanged).
      return { summary: chat.compactSummary ?? "", compactedAtSeq: fromSeq, updated: false };
    }
    if (window.length === 0) {
      return await advanceCoverageOnly(ctx, {
        chatId,
        ownerId,
        priorSummary: chat.compactSummary,
        priorCoverage: chat.compactedAtSeq,
        coveredThroughSeq,
      });
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
      priorCoverage: chat.compactedAtSeq,
      signal,
    });
  };
}

/** `compact` — host-only. The manual lever over the lock-free core: gate, resolve the chat's connection, run the
 *  core, emit `chatUpdated`. */
function createCompact(ctx: ChatContext, deps: CompactionDeps, runCompaction: (args: RunCompactionArgs) => Promise<CompactResult>): ChatService["compact"] {
  return async ({ principal, chatId, instructions }: CompactParams): Promise<CompactResult> => {
    // The caller IS the host (requireHost passed) → the host funds the marker generation on their OWN connection.
    await requireHost(ctx, principal, chatId);
    const connection = await deps.resolveConnection({ funderUserId: principal.userId, chatId });
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
