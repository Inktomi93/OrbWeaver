// The D8 `session_entries` write-path (issue #71): the ONLY `@orb/db` touch this concern gets — the
// agent-sdk backend is a sealed executor (never imports `@orb/db`/a domain, D8 +
// the `infra/**` "NEVER @orb/db" file-header invariant), so the compose root builds the real
// `db.insert`/`db.update` ops here and injects them DOWN as a `SessionEntryWriter` (session/store.ts).
//
// THE PRIMARY SEAT. Every write names the lineage its connection now runs on, so every write moves the
// `(chat, connection)` primary onto that row: un-primary the connection's current seat, THEN set the
// touched row, in ONE `db.batch` — the demote → promote order the partial unique
// `session_entries_primary_unique` requires (the host-handoff idiom, `acceptHostHandoffSwapStatements` in
// `domain/chat/persistence/participant.ts`). Two funders in one room
// each hold their own seat; neither write can touch the other connection's rows.
//
// `insert` covers a new lineage (dispositions `seeded`/`forked`). It is an upsert on `sdk_session_id`:
// the store is process-local, so after a restart the same deterministic id is re-seeded and must land on
// its existing row, not trip the UNIQUE index. The next per-chat `seq` is a scalar subquery INSIDE the
// insert, so concurrent inserts for one chat serialize on the batch's write lock instead of racing a
// separate max() read. `update` covers an in-place rewrite of an existing row (`reseeded`, `rewound`,
// `readopted`); it never creates a row.
//
// Both refuse an sdkSessionId whose row belongs to another `(chat, connection)`: the demote is guarded
// on the same predicate, so a refused write changes nothing.

import type { Db } from "@orb/db";
import { sessionEntries } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { SessionEntryWriter } from "@orb/inference";
import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { minter } from "./minter.ts";

const FOREIGN_SESSION_REFUSAL = "session entry write refused: the SDK session does not belong to the resolved connection";

// A second handle on the table for the subqueries, so their columns never resolve to the outer row.
const lineage = alias(sessionEntries, "lineage");

export function createSessionEntryWriter(db: Db): SessionEntryWriter {
  const newSessionEntryId = minter(ID_PREFIX.sessionEntry);

  /** Demote the connection's current seat in `chatId`, unless `sdkSessionId` is already owned elsewhere. */
  function demoteSeat(chatId: SQL<ChatId | null>, connectionId: UserConnectionId, sdkSessionId: string): BatchStmt {
    return db
      .update(sessionEntries)
      .set({ isPrimary: false })
      .where(
        and(
          eq(sessionEntries.chatId, chatId),
          eq(sessionEntries.connectionId, connectionId),
          eq(sessionEntries.isPrimary, true),
          ne(sessionEntries.sdkSessionId, sdkSessionId),
          notExists(
            db
              .select({ id: lineage.id })
              .from(lineage)
              .where(and(eq(lineage.sdkSessionId, sdkSessionId), or(ne(lineage.chatId, chatId), ne(lineage.connectionId, connectionId)))),
          ),
        ),
      );
  }

  /** The chat that owns `sdkSessionId` under `connectionId`, as a scalar subquery (NULL when none does). */
  function ownerChatOf(connectionId: UserConnectionId, sdkSessionId: string): SQL<ChatId | null> {
    return sql<ChatId | null>`(${db
      .select({ chatId: lineage.chatId })
      .from(lineage)
      .where(and(eq(lineage.sdkSessionId, sdkSessionId), eq(lineage.connectionId, connectionId)))})`;
  }

  return {
    async insert(entry): Promise<void> {
      const [, promoted] = await db.batch([
        demoteSeat(sql<ChatId>`${entry.chatId}`, entry.connectionId, entry.sdkSessionId),
        db
          .insert(sessionEntries)
          .values({
            id: newSessionEntryId(),
            chatId: entry.chatId,
            sdkSessionId: entry.sdkSessionId,
            connectionId: entry.connectionId,
            seq: sql<number>`(${db
              .select({ next: sql<number>`coalesce(max(${lineage.seq}) + 1, 0)` })
              .from(lineage)
              .where(eq(lineage.chatId, entry.chatId))})`,
            // Today this is the SEEDED-TURN COUNT, not a true canon `messages.seq` — the backend seam
            // (`AgentSeedTurn`) carries no seq; extend that seam before pointing a horizon reader here.
            seededThroughSeq: entry.seededThroughSeq,
            canonHash: entry.canonHash,
            isPrimary: true,
          })
          .onConflictDoUpdate({
            target: sessionEntries.sdkSessionId,
            set: { seededThroughSeq: entry.seededThroughSeq, canonHash: entry.canonHash, isPrimary: true },
            setWhere: sql`${eq(sessionEntries.chatId, entry.chatId)} AND ${eq(sessionEntries.connectionId, entry.connectionId)}`,
          })
          .returning({ id: sessionEntries.id }),
      ]);
      if (promoted.length !== 1) {
        throw new Error(FOREIGN_SESSION_REFUSAL);
      }
    },
    async update(entry): Promise<void> {
      const [, promoted] = await db.batch([
        demoteSeat(ownerChatOf(entry.connectionId, entry.sdkSessionId), entry.connectionId, entry.sdkSessionId),
        db
          .update(sessionEntries)
          .set({ seededThroughSeq: entry.seededThroughSeq, canonHash: entry.canonHash, isPrimary: true })
          .where(and(eq(sessionEntries.sdkSessionId, entry.sdkSessionId), eq(sessionEntries.connectionId, entry.connectionId)))
          .returning({ id: sessionEntries.id }),
      ]);
      if (promoted.length !== 1) {
        throw new Error(FOREIGN_SESSION_REFUSAL);
      }
    },
  };
}
