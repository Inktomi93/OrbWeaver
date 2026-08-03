// domain/embeddings/persistence/handoff-restamp — the embeddings-owned digest re-key the host-handoff copy
// executes. A named exception to "persistence is queries only" (it builds writes), and the ownership half of
// why it lives here at all: `chat_digests` / `chat_digest_speakers` are embeddings' tables and chat may not
// write them. The WHY is in `../contract/handoff-restamp.ts`; this file is the mechanism.
//
// The SPEAKERS statement joins through `chat_digests` for its chat scope: the join table carries no chatId of
// its own, and a bare `characterId` UPDATE would re-key that character's digests in EVERY room — the
// cross-tenant blast radius this whole seam exists to avoid.

import { chatDigestSpeakers, chatDigests } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import { and, eq, inArray } from "drizzle-orm";
import type { EmbeddingsHandoffRestampContext, HandoffRestampStatements } from "../contract/handoff-restamp";

export function createHandoffRestampStatements(ctx: EmbeddingsHandoffRestampContext): HandoffRestampStatements {
  return ({ chatId, pairs }): Promise<readonly BatchStmt[]> => {
    const { db } = ctx;
    const statements = pairs.flatMap(({ sourceCharacterId, characterId }) => [
      // The BUCKET key — the digest row itself belongs to whoever it is the memory OF.
      batchStmt(
        db
          .update(chatDigests)
          .set({ scopedCharacterId: characterId })
          .where(and(eq(chatDigests.chatId, chatId), eq(chatDigests.scopedCharacterId, sourceCharacterId))),
      ),
      // The CONTAINS join — chat-scoped through the parent digest, never a bare characterId sweep.
      batchStmt(
        db
          .update(chatDigestSpeakers)
          .set({ characterId })
          .where(
            and(
              eq(chatDigestSpeakers.characterId, sourceCharacterId),
              inArray(chatDigestSpeakers.digestId, db.select({ id: chatDigests.id }).from(chatDigests).where(eq(chatDigests.chatId, chatId))),
            ),
          ),
      ),
    ]);
    return Promise.resolve(statements);
  };
}
