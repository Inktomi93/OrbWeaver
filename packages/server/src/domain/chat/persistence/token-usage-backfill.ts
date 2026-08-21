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
import { alias } from "drizzle-orm/sqlite-core";

const MAX_PAGE = 1000;

/** The self-join used to pick ONE host seat per chat (below). */
const hostSeat = alias(chatParticipants, "host_seat");

export function createListImportedTokenUsageCandidates(db: Db): ListImportedTokenUsageCandidates {
  return async ({ hostUserId, afterVariantId, limit }): Promise<readonly ImportedTokenUsageCandidate[]> => {
    // ONE CANDIDATE PER VARIANT. `chat_participants` carries no uniqueness over (chatId, role='host') — the
    // one-host rule is writer discipline (D18), not physics — so a plain `role='host'` join emits one row
    // PER present human host, and a room that ever holds two double-counts every variant in it: `scanned`,
    // `ownersScanned` and `compareAndSetSkipped` all inflate (the CAS itself is idempotent, so only the
    // audit numbers lie) and the loser host is never reconciled. The seat this resolves to is the
    // EARLIEST-JOINED present human host — the founding/funding seat every writer mints and the one a
    // handoff hands to — so the census is deterministic whatever the roster holds.
    const canonicalHostSeat = db
      .select({ id: hostSeat.id })
      .from(hostSeat)
      .where(and(eq(hostSeat.chatId, chats.id), eq(hostSeat.role, "host"), eq(hostSeat.kind, "human"), isNotNull(hostSeat.userId), isNull(hostSeat.leftSeq)))
      .orderBy(asc(hostSeat.joinSeq), asc(hostSeat.id))
      .limit(1);
    const predicates: SQL[] = [isNotNull(chats.importedFrom)];
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
      .innerJoin(chatParticipants, eq(chatParticipants.id, canonicalHostSeat))
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
