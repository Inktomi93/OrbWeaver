// Retained canon changes share one accounting cohort snapshot and a first-write fence, independent of funding.

import type { StatsDelta } from "@orb/contracts/stats";
import { chats, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany } from "@orb/db/query";
import type { ChatId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import type { ChatContext } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { PreparedRetainedCanonStats, RetainedCanonCapture, RetainedCanonMutation, RetainedCanonSource } from "../contract/generation-observation.ts";
import { appendStatsDeltas, retainedCanonDeltas } from "../substrate/stats-delta.ts";
import { isRetainedParentFenceViolation, retainedChatFenceStatement } from "./canon-write.ts";

/** Resolve each distinct voice once; all snapshots must still agree when the atomic batch writes. */
export async function prepareRetainedCanonStats(
  ctx: ChatContext,
  chatId: ChatId,
  deltas: readonly StatsDelta[],
  capture: RetainedCanonCapture,
): Promise<PreparedRetainedCanonStats> {
  const voices = deltas.map((delta) => delta.characterId).filter((id, index, all) => all.indexOf(id) === index);
  const scoped = await Promise.all(
    (voices.length === 0 ? [null] : voices).map(async (characterId) => ({
      scope: await ctx.resolveRetainedChatAccountingScope(chatId, characterId),
      characterId,
    })),
  );
  const ownerIds = scoped.flatMap(({ scope }) => scope.ownerIds).filter((id, index, all) => all.indexOf(id) === index);
  return {
    ownerIds,
    predicate: sql`${and(...scoped.map(({ scope }) => scope.predicate), ...capture.sources.map(retainedCanonSourcePredicate), ...capture.contributions.map(({ predicate }) => predicate))}`,
    deltas: deltas.flatMap((delta) =>
      scoped.filter(({ characterId }) => characterId === delta.characterId).flatMap(({ scope }) => retainedCanonDeltas(scope, [delta])),
    ),
  };
}

// Card ownership can stay unchanged when a copy handoff rekeys the slot; cohort equality cannot pin its voice.
function retainedCanonSourcePredicate(source: RetainedCanonSource): ReturnType<typeof sql> {
  return sql`exists (select 1 from ${messages} inner join ${messageVariants} on ${messageVariants.id} = ${messages.selectedVariantId}
    where ${messages.id} = ${source.id} and ${messages.chatId} = ${source.chatId}
      and ${messages.characterId} is ${source.characterId} and ${messages.role} = ${source.role}
      and ${messages.selectedVariantId} = ${source.selectedVariantId}
      and ${messageVariants.content} = ${source.content} and ${messageVariants.reasoning} is ${source.reasoning}
      and (select count(*) from ${messageVariants} where ${messageVariants.messageId} = ${source.id}) = ${source.variantCount})`;
}

/** Every signed canon mutation advances all affected owner fences in the same guarded batch. */
export async function commitRetainedCanonStats(ctx: ChatContext, chatId: ChatId, statements: BatchStmt[], mutation: RetainedCanonMutation): Promise<void> {
  const prepared = await prepareRetainedCanonStats(ctx, chatId, mutation.deltas, mutation);
  const selection = sql`select ${chats.id} from ${chats} where ${and(eq(chats.id, chatId), prepared.predicate)}`;
  statements.unshift(retainedChatFenceStatement(ctx.db, selection));
  appendStatsDeltas(ctx, statements, prepared.deltas);
  if (mutation.deltas.length === 0) {
    for (const ownerId of prepared.ownerIds) {
      ctx.bumpStatsCanonVersion(statements, ctx.db, ownerId);
    }
  }
  try {
    await ctx.db.batch(batchMany(statements));
  } catch (error) {
    if (isRetainedParentFenceViolation(error) && (await ctx.db.all(selection)).length === 0) {
      const refusal = new ChatOperationError(CHAT_OP_CODES.aborted, "the retained canon or accounting cohort changed before it could be committed");
      refusal.cause = error;
      throw refusal;
    }
    throw error;
  }
}
