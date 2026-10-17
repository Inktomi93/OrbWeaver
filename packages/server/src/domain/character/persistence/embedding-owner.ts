// Trusted system reads choose the entity owner's encoder, not the acting workload user's (D20).

import { characters as charactersTable } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

/** Bind the trusted indexer's owner lookup; never a user-facing existence oracle. */
export function createLoadCharacterEmbeddingOwner(handle: DatabaseHandle): (characterId: CharacterId) => Promise<UserId | null> {
  const db = databaseForOwner(handle);
  return async (characterId) => {
    // @orb-waive owner-scoped-reads(charactersTable): a trusted system consumer (D20) — the embeddings indexer and corpus sweep read a card's owner to choose whose vector space the write lands in; no Principal or caller-supplied id reaches it. Ends if a user-facing door calls this op.
    const rows = await db.select({ ownerId: charactersTable.ownerId }).from(charactersTable).where(eq(charactersTable.id, characterId)).limit(1);
    return rows[0]?.ownerId ?? null;
  };
}
