// verb: attachToCharacter — attach a caller-OWNED document to a caller-OWNED character (DB8). Gates BOTH sides
// on ownership: the character (`ensureCharacterOwned` — a sanctioned `characters` schema read, the world-info
// precedent) AND the document (`loadOwnedMeta`). NOT the D18 host authority — a character is an owned entity,
// not a membership room. `character_documents` keys on `(characterId, documentId)` (D23 per-type FK). A roster
// character's attached docs feed the chat retrieval union (resolveActiveDocumentIds, databank-design/05 §3.2 —
// character-scope participates in retrieval as of this wave, not storage-only). Idempotent re-attach.

import { characterDocuments } from "@orb/db";
import { DocumentNotFoundError } from "../../contract/errors.ts";
import type { CharacterAttachParams } from "../../contract/params.ts";
import type { DatabankContext, DatabankService } from "../../contract/service.ts";
import { ensureCharacterOwned, loadOwnedMeta } from "../../persistence/queries.ts";

export function createAttachToCharacter(ctx: DatabankContext): DatabankService["attachToCharacter"] {
  return async ({ principal, documentId, characterId }: CharacterAttachParams): Promise<void> => {
    const ownerId = principal.userId;
    const [, owned] = await Promise.all([ensureCharacterOwned(ctx.db, ownerId, characterId), loadOwnedMeta(ctx.db, ownerId, documentId)]);
    if (owned === undefined) {
      throw new DocumentNotFoundError(documentId);
    }
    const inserted = await ctx.db
      .insert(characterDocuments)
      .values({ characterId, documentId })
      .onConflictDoNothing()
      .returning({ documentId: characterDocuments.documentId });
    if (inserted.length === 0) {
      return; // already attached — idempotent
    }
    await ctx.audit(
      { actorUserId: ownerId, action: "databank.attachToCharacter", entityType: "document", entityId: documentId, metadata: { characterId } },
      ctx.now(),
    );
  };
}
