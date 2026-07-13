// domain/chat/verbs/compaction — the manual `compact` lever + the lock-free `runCompaction` core. The
// portable compaction checkpoint is chats.compactSummary + chats.compactedAtSeq (chat canon, not agent-sdk
// session state — so the stateless OpenRouter runner uses it too).
//
// TWO ENTRY POINTS, ONE CORE: `runCompaction` is the lock-free core the composition root injects into the
// engine; the manual `compact` verb is the public host-only lever (gates + emits over the same core). The
// engine never imports the verb.
//
// FLAG[compaction-transcript]: the summarized transcript labels each turn by its role (user/assistant/system),
// not the resolved speaker name — richer per-speaker labeling is a later refinement.

import type { ChatBusEvent } from "@orb/contracts/chat";
import { chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ChatContext } from "../contract/context";
import { ChatNotFoundError } from "../contract/errors";
import type { CompactParams } from "../contract/params";
import type { CompactResult } from "../contract/results";
import type { ChatService } from "../contract/service";
import { requireHost } from "../guard";
import { loadCanonHistoryAfter, loadChatRow } from "../persistence/queries";

/** `throughSeq` caps the window at a breakpoint (absent ⇒ compact every new turn). */
interface RunCompactionArgs {
  readonly chatId: ChatId;
  readonly throughSeq?: number | undefined;
  readonly instructions?: string | undefined;
}

interface CompactionBundle extends Pick<ChatService, "compact"> {
  readonly runCompaction: (args: RunCompactionArgs) => Promise<CompactResult>;
}

interface CompactionDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
}

const COMPACTION_SYSTEM_PROMPT =
  "You are a precise conversation summarizer. Produce a faithful, compact summary of the roleplay so far " +
  "that preserves the key facts, character states, decisions, locations, and unresolved threads. Do not " +
  "invent details and do not add commentary — output only the summary.";

/** Build the summarizer's user prompt from the prior checkpoint summary (folded in so the new summary
 *  supersedes it), the new transcript, and any caller guidance. */
function buildCompactionPrompt(args: {
  readonly priorSummary: string | null;
  readonly transcript: string;
  readonly instructions: string | undefined;
}): string {
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

/** The lock-free compaction core. Loads the current checkpoint, summarizes the history after it (capped at
 *  `throughSeq`), writes the advanced checkpoint. A window with no new turns is an idempotent no-op. No gate
 *  / no bus emit — that's the verb's / engine's job. */
function makeRunCompaction(ctx: ChatContext): (args: RunCompactionArgs) => Promise<CompactResult> {
  return async ({
    chatId,
    throughSeq,
    instructions,
  }: RunCompactionArgs): Promise<CompactResult> => {
    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    const fromSeq = chat.compactedAtSeq ?? 0;
    const afterCheckpoint = await loadCanonHistoryAfter(ctx.db, chatId, fromSeq);
    const window =
      throughSeq === undefined
        ? afterCheckpoint
        : afterCheckpoint.filter((m) => m.seq <= throughSeq);
    const coveredThroughSeq = window.at(-1)?.seq;
    if (coveredThroughSeq === undefined) {
      // Nothing new to compact — the checkpoint is already current (idempotent no-op).
      return { summary: chat.compactSummary ?? "", compactedAtSeq: fromSeq };
    }

    const transcript = window.map((m) => `${m.role}: ${m.content}`).join("\n");
    const userPrompt = buildCompactionPrompt({
      priorSummary: chat.compactSummary,
      transcript,
      instructions,
    });
    const result = await ctx.summarize([{ systemPrompt: COMPACTION_SYSTEM_PROMPT, userPrompt }]);
    const summary = result.items.at(0)?.text ?? chat.compactSummary ?? "";

    await ctx.db
      .update(chats)
      .set({ compactSummary: summary, compactedAtSeq: coveredThroughSeq, updatedAt: ctx.now() })
      .where(eq(chats.id, chatId));
    return { summary, compactedAtSeq: coveredThroughSeq };
  };
}

/** `compact` — host-only. The manual lever over the lock-free core: gate, run the core, emit `chatUpdated`. */
function createCompact(
  ctx: ChatContext,
  emit: CompactionDeps["emit"],
  runCompaction: (args: RunCompactionArgs) => Promise<CompactResult>,
): ChatService["compact"] {
  return async ({ principal, chatId, instructions }: CompactParams): Promise<CompactResult> => {
    await requireHost(ctx, principal, chatId);
    const result = await runCompaction({ chatId, instructions });
    await emit({ type: "chatUpdated", chatId });
    return result;
  };
}

/** The root spreads `compact` into the full service AND injects `runCompaction` into the engine. */
export function createCompaction(ctx: ChatContext, deps: CompactionDeps): CompactionBundle {
  const runCompaction = makeRunCompaction(ctx);
  return {
    compact: createCompact(ctx, deps.emit, runCompaction),
    runCompaction,
  };
}
