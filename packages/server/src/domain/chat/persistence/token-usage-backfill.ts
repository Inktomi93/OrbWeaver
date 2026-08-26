// domain/chat/persistence/token-usage-backfill — chat-owned canon rails for import's catch-up workload.
// The reader is restricted to imported chats. The writer is a compare-and-set: it either promotes legacy
// numeric usage without touching the numbers, or fills an entirely NULL pair atomically. A later measured
// writer changes the predicate and wins.

import type { CompareAndSetImportedTokenUsage, ImportedTokenUsageCandidate, ListImportedTokenUsageCandidates } from "@orb/contracts/chat";
import type { BumpStatsCanonVersion } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chatParticipants, chats, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

const MAX_PAGE = 1000;

/** The self-join used to pick ONE host seat per chat (below). */
const hostSeat = alias(chatParticipants, "host_seat");

export function createListImportedTokenUsageCandidates(db: Db): ListImportedTokenUsageCandidates {
  return async ({ hostUserId, afterVariantId, limit }): Promise<readonly ImportedTokenUsageCandidate[]> => {
    // ONE CANDIDATE PER VARIANT. A plain `role='host'` join emits one row PER matching host seat, and a
    // room that ever yields two double-counts every variant in it: `scanned`, `ownersScanned` and
    // `compareAndSetSkipped` all inflate (the CAS itself is idempotent, so only the audit numbers lie) and
    // the loser host is never reconciled. Two things now make that impossible, and BOTH are load-bearing:
    // (1) `chat_participants_chat_host_unique` — a partial UNIQUE over (chatId) WHERE role='host' AND
    // left_seq IS NULL (#390) — caps the PRESENT host seats at one (this was writer discipline only until
    // that index landed; D18); (2) this resolver's own `leftSeq IS NULL` + limit-1 — a DEPARTED host KEEPS
    // role='host' and is deliberately outside that index, so without the presence filter every prior host
    // of the room would re-enter the join. The `ORDER BY joinSeq, id` picks the EARLIEST-JOINED present
    // human host: the founding/funding seat every writer mints and the one a handoff hands to. It is now a
    // tiebreak over a state the index forbids — kept as the deterministic belt below the physics, never as
    // its substitute.
    const canonicalHostSeat = db
      .select({ id: hostSeat.id })
      .from(hostSeat)
      .where(and(eq(hostSeat.chatId, chats.id), eq(hostSeat.role, "host"), eq(hostSeat.kind, "human"), isNotNull(hostSeat.userId), isNull(hostSeat.leftSeq)))
      .orderBy(asc(hostSeat.joinSeq), asc(hostSeat.id))
      .limit(1);
    // Scope is CHAT-was-imported, deliberately (#402, owner-ruled 2026-08-21 accept-as-designed): live
    // turns continued in an imported chat are swept too, so an unrecorded live variant can gain an
    // ESTIMATED tokensOut (tokensIn stays null). The figures are honest and labeled `estimated`; a
    // variant-era narrowing was priced and rejected as unneeded complexity.
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

export function createCompareAndSetImportedTokenUsage(db: Db, bumpCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>): CompareAndSetImportedTokenUsage {
  return async ({ candidate, resolution }): Promise<boolean> => {
    const legacyNumeric = candidate.tokensIn !== null || candidate.tokensOut !== null;
    const values = legacyNumeric
      ? { tokenProvenance: "measured" as const }
      : {
          tokensIn: resolution.tokensIn,
          tokensOut: resolution.tokensOut,
          tokenProvenance: resolution.tokenProvenance,
        };
    const statements: BatchStmt[] = [
      db
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
        .returning({ id: messageVariants.id }),
    ];
    // A losing CAS may conservatively advance the token. That costs at most a retry; separating the update
    // from its fence would let a winning write escape the rebuild snapshot entirely.
    bumpCanonVersion(statements, db, candidate.ownerId);
    const results = await db.batch(batchMany(statements));
    const changed = results[0] as readonly { readonly id: string }[];
    return changed.length === 1;
  };
}
