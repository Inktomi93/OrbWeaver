// domain/chat/persistence/handoff-resume — the durable completion marker for the only non-statement-shaped
// host-handoff tail. The authority swap writes this row; the accepted host can resume actor re-key + event
// delivery after the nomination has already cleared. JSON is parsed here, never cast.

import type { Db } from "@orb/db";
import { chatHandoffResumptions } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchStmt } from "@orb/db/query";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { HandoffResumption } from "../contract/context.ts";

const actorRekeysSchema = z.array(
  z.object({
    // Internal, FK-derived ids rather than wire input. The JSON seam proves the stored shape/string kind;
    // the source and destination were minted/read through character's typed doors before this marker exists.
    sourceCharacterId: z.custom<CharacterId>((value) => typeof value === "string" && value.length > 0, {
      error: "sourceCharacterId must be a non-empty string",
    }),
    characterId: z.custom<CharacterId>((value) => typeof value === "string" && value.length > 0, { error: "characterId must be a non-empty string" }),
  }),
);

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
    actorRekeys: actorRekeysSchema.parse(row.actorRekeys),
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
