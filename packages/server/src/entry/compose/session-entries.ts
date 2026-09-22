// The D8 `session_entries` write-path (issue #71): the ONLY `@orb/db` touch this concern gets — the
// agent-sdk backend is a sealed executor (never imports `@orb/db`/a domain, `Core-Path-Registry.md` D8 +
// the `infra/**` "NEVER @orb/db" file-header invariant), so the compose root builds the real
// `db.insert`/`db.update` ops here and injects them DOWN as a `SessionEntryWriter` (session/store.ts).
//
// `insert` covers a brand-new sdk-session lineage entry (dispositions `seeded`/`forked`): the next
// per-chat `seq` is derived from the current max (no counter to keep in sync across restarts), and the
// FIRST entry for a chat is the live primary (`isPrimary`) — later entries are secondaries awaiting the
// dual-session reap (schema header, `packages/db/src/schema/sdk-session.ts`; the reap/promote job itself
// is OUT of this issue's scope). `update` covers the `reseeded` disposition — the SAME `sdkSessionId`
// rewritten in place, so it is a plain column update, never a second row (the `sdk_session_id` UNIQUE
// index would reject a duplicate insert).

import type { Db } from "@orb/db";
import { sessionEntries } from "@orb/db";
import type { SessionEntryWriter } from "@orb/inference";
import { ID_PREFIX } from "@orb/kit/ids";
import { and, eq, max } from "drizzle-orm";
import { minter } from "./minter.ts";

export function createSessionEntryWriter(db: Db): SessionEntryWriter {
  const newSessionEntryId = minter(ID_PREFIX.sessionEntry);
  return {
    async insert(entry): Promise<void> {
      const rows = await db
        .select({ maxSeq: max(sessionEntries.seq) })
        .from(sessionEntries)
        .where(eq(sessionEntries.chatId, entry.chatId));
      const priorMax = rows[0]?.maxSeq;
      const seq = priorMax === null || priorMax === undefined ? 0 : priorMax + 1;
      const [connectionPrimary] = await db
        .select({ id: sessionEntries.id })
        .from(sessionEntries)
        .where(and(eq(sessionEntries.chatId, entry.chatId), eq(sessionEntries.connectionId, entry.connectionId), eq(sessionEntries.isPrimary, true)))
        .limit(1);
      await db.insert(sessionEntries).values({
        id: newSessionEntryId(),
        chatId: entry.chatId,
        sdkSessionId: entry.sdkSessionId,
        connectionId: entry.connectionId,
        seq,
        // Today this is the SEEDED-TURN COUNT, not a true canon `messages.seq` — the backend seam
        // (`AgentSeedTurn`) carries no seq; extend that seam before pointing a horizon reader here.
        seededThroughSeq: entry.seededThroughSeq,
        canonHash: entry.canonHash,
        isPrimary: connectionPrimary === undefined,
      });
    },
    async update(entry): Promise<void> {
      const updated = await db
        .update(sessionEntries)
        .set({ seededThroughSeq: entry.seededThroughSeq, canonHash: entry.canonHash })
        .where(and(eq(sessionEntries.sdkSessionId, entry.sdkSessionId), eq(sessionEntries.connectionId, entry.connectionId)))
        .returning({ id: sessionEntries.id });
      if (updated.length !== 1) {
        throw new Error("session entry update refused: the SDK session does not belong to the resolved connection");
      }
    },
  };
}
