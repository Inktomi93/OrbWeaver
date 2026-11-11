// domain/chat/persistence/handoff-resume — the durable completion marker for the only non-statement-shaped
// host-handoff tail. The authority swap writes this row; the accepted host can resume actor re-key + event
// delivery after the nomination has already cleared. JSON is parsed here, never cast.

import { handoffCardPairsSchema } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatHandoffResumptions } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchStmt } from "@orb/db/query";
import type { ChatId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { HandoffResumption } from "../contract/context.ts";

/** Marker insert, unexecuted so it commits with the role swap. A pre-existing marker is never overwritten. */
export function insertHandoffResumptionStatement(db: Db, args: HandoffResumption & { readonly now: number }): BatchStmt {
  return batchStmt(
    db.insert(chatHandoffResumptions).values({
      chatId: args.chatId,
      acceptedByUserId: args.acceptedByUserId,
      actorRekeys: args.actorRekeys,
      createdAt: args.now,
    }),
  );
}

/** The durable tail for a room, or null. A corrupt payload is a loud invariant failure. */
export async function loadHandoffResumption(db: Db, chatId: ChatId): Promise<HandoffResumption | null> {
  const rows = await db.select().from(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    chatId: row.chatId,
    acceptedByUserId: row.acceptedByUserId,
    actorRekeys: handoffCardPairsSchema.parse(row.actorRekeys),
  };
}

// A stale retry must not erase another accepted host's completion marker.
function clearHandoffResumptionQuery(db: Db, chatId: ChatId, acceptedByUserId: UserId): ReturnType<ReturnType<Db["delete"]>["where"]> {
  return db.delete(chatHandoffResumptions).where(and(eq(chatHandoffResumptions.chatId, chatId), eq(chatHandoffResumptions.acceptedByUserId, acceptedByUserId)));
}

/** Accepted-host-scoped marker clear, unexecuted so completion can commit it with the durable event. */
export function clearHandoffResumptionStatement(db: Db, chatId: ChatId, acceptedByUserId: UserId): BatchStmt {
  return batchStmt(clearHandoffResumptionQuery(db, chatId, acceptedByUserId));
}
