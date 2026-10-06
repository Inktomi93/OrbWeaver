// Retained canon changes share one accounting cohort snapshot and a first-write fence, independent of funding.

import type { StatsDelta } from "@orb/contracts/stats";
import { chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ChatId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import type { ChatContext } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { PreparedRetainedCanonStats } from "../contract/generation-observation.ts";
import { appendStatsDeltas, retainedCanonDeltas } from "../substrate/stats-delta.ts";
import { isRetainedParentFenceViolation, retainedChatFenceStatement } from "./canon-write.ts";

/** Resolve each distinct voice once; all snapshots must still agree when the atomic batch writes. */
export async function prepareRetainedCanonStats(ctx: ChatContext, chatId: ChatId, deltas: readonly StatsDelta[]): Promise<PreparedRetainedCanonStats> {
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
    predicate: sql`${and(...scoped.map(({ scope }) => scope.predicate))}`,
    deltas: deltas.flatMap((delta) =>
      scoped.filter(({ characterId }) => characterId === delta.characterId).flatMap(({ scope }) => retainedCanonDeltas(scope, [delta])),
    ),
  };
}

/** Every signed canon mutation advances all affected owner fences in the same guarded batch. */
export async function commitRetainedCanonStats(ctx: ChatContext, chatId: ChatId, statements: BatchStmt[], deltas: readonly StatsDelta[]): Promise<void> {
  const prepared = await prepareRetainedCanonStats(ctx, chatId, deltas);
  const selection = sql`select ${chats.id} from ${chats} where ${and(eq(chats.id, chatId), prepared.predicate)}`;
  statements.unshift(retainedChatFenceStatement(ctx.db, selection));
  appendStatsDeltas(ctx, statements, prepared.deltas);
  if (deltas.length === 0) {
    for (const ownerId of prepared.ownerIds) {
      ctx.bumpStatsCanonVersion(statements, ctx.db, ownerId);
    }
  }
  try {
    await ctx.db.batch(batchMany(statements));
  } catch (error) {
    if (isRetainedParentFenceViolation(error) && (await ctx.db.all(selection)).length === 0) {
      const refusal = new ChatOperationError(CHAT_OP_CODES.aborted, "the retained accounting cohort changed before canon could be committed");
      refusal.cause = error;
      throw refusal;
    }
    throw error;
  }
}
