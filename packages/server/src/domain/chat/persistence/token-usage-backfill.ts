// domain/chat/persistence/token-usage-backfill — chat-owned canon rails for import's catch-up workload.
// The reader is restricted to imported chats. The writer is a compare-and-set: it either promotes legacy
// numeric usage without touching the numbers, or fills an entirely NULL pair atomically. A later measured
// writer changes the predicate and wins.

import type { CompareAndSetImportedTokenUsage, ImportedTokenUsageCandidate, ListImportedTokenUsageCandidates } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatParticipants, chats, messages, messageVariants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";

const MAX_PAGE = 1000;

export function createListImportedTokenUsageCandidates(db: Db): ListImportedTokenUsageCandidates {
  return async ({ hostUserId, afterVariantId, limit }): Promise<readonly ImportedTokenUsageCandidate[]> => {
    const predicates: SQL[] = [
      isNotNull(chats.importedFrom),
      eq(chatParticipants.kind, "human"),
      eq(chatParticipants.role, "host"),
      isNotNull(chatParticipants.userId),
      isNull(chatParticipants.leftSeq),
    ];
    if (hostUserId !== null) {
      predicates.push(eq(chatParticipants.userId, hostUserId));
    }
    if (afterVariantId !== null) {
      predicates.push(gt(messageVariants.id, afterVariantId));
    }
    const rows = await db
      .select({
        variantId: messageVariants.id,
        ownerId: chatParticipants.userId,
        role: messages.role,
        content: messageVariants.content,
        metadata: messageVariants.metadata,
        tokensIn: messageVariants.tokensIn,
        tokensOut: messageVariants.tokensOut,
        tokenProvenance: messageVariants.tokenProvenance,
      })
      .from(messageVariants)
      .innerJoin(messages, eq(messages.id, messageVariants.messageId))
      .innerJoin(chats, eq(chats.id, messages.chatId))
      .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.role, "host")))
      .where(and(...predicates))
      .orderBy(asc(messageVariants.id))
      .limit(Math.min(Math.max(limit, 1), MAX_PAGE));
    return rows.map((row) => ({ ...row, ownerId: row.ownerId as UserId }));
  };
}

export function createCompareAndSetImportedTokenUsage(db: Db): CompareAndSetImportedTokenUsage {
  return async ({ candidate, resolution }): Promise<boolean> => {
    const legacyNumeric = candidate.tokensIn !== null || candidate.tokensOut !== null;
    const values = legacyNumeric
      ? { tokenProvenance: "measured" as const }
      : {
          tokensIn: resolution.tokensIn,
          tokensOut: resolution.tokensOut,
          tokenProvenance: resolution.tokenProvenance,
        };
    const changed = await db
      .update(messageVariants)
      .set(values)
      .where(
        and(
          eq(messageVariants.id, candidate.variantId),
          eq(messageVariants.tokenProvenance, "unrecorded"),
          eq(messageVariants.content, candidate.content),
          candidate.metadata === null ? isNull(messageVariants.metadata) : eq(messageVariants.metadata, candidate.metadata),
          candidate.tokensIn === null ? isNull(messageVariants.tokensIn) : eq(messageVariants.tokensIn, candidate.tokensIn),
          candidate.tokensOut === null ? isNull(messageVariants.tokensOut) : eq(messageVariants.tokensOut, candidate.tokensOut),
        ),
      )
      .returning({ id: messageVariants.id });
    return changed.length === 1;
  };
}
