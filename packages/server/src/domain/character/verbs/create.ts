// verb: create — mint a new character owned by the caller. Ownership is scoped off `principal.userId` (the
// §7.1 source of truth — never a `users` read). The injected `newCharacterId`/`now` keep it deterministic.
// The card is built from the wire input (defaults applied), the `contentHash` is the FLATTEN of that card
// (NOT NULL column), and `character.updated` is emitted so the embeddings indexer re-embeds. Import
// provenance (`importedFrom`/`importHash`) is stamped when the optional `provenance` arrives (the import
// composition-root wire — PD-43); app-authored cards omit it and the columns stay null. Re-reads with the
// avatar JOIN for the detail view.

import type { CharacterCard } from "@orb/contracts/character";
import { cardContentHash } from "#kit/serde/card";
import { CharacterNotFoundError } from "../contract/errors";
import type { CharacterImportProvenance, CreateCharacterParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { insertCharacter } from "../persistence/card";
import {
  canonicalTagsOf,
  detailOf,
  ensureAssetOwned,
  loadOwnedCharacterWithAvatar,
} from "../persistence/queries";

/** Split the optional provenance into the two nullable row columns (null/null when app-authored). Extracted
 *  so the verb closure stays under the cognitive-complexity gate that the card-defaults block already loads. */
function provenanceColumns(provenance: CharacterImportProvenance | undefined): {
  readonly importedFrom: string | null;
  readonly importHash: string | null;
} {
  if (provenance === undefined) {
    return { importedFrom: null, importHash: null };
  }
  return { importedFrom: provenance.importedFrom, importHash: provenance.importHash };
}

/** D21 cross-root belt: the FK proves a supplied avatar asset exists, never that it's the caller's.
 *  Extracted (like `provenanceColumns`) to keep the verb closure under the cognitive-complexity gate. */
async function guardAvatarOwned(
  ctx: CharacterContext,
  ownerId: CreateCharacterParams["principal"]["userId"],
  avatarAssetId: CreateCharacterParams["input"]["avatarAssetId"],
): Promise<void> {
  if (avatarAssetId !== null && avatarAssetId !== undefined) {
    await ensureAssetOwned(ctx.db, ownerId, avatarAssetId);
  }
}

export function createCreate(ctx: CharacterContext): CharacterService["create"] {
  return async ({ principal, input, provenance }: CreateCharacterParams) => {
    const ownerId = principal.userId;
    await guardAvatarOwned(ctx, ownerId, input.avatarAssetId);
    const at = ctx.now();
    const characterId = ctx.newCharacterId();
    const { importedFrom, importHash } = provenanceColumns(provenance);

    const card: CharacterCard = {
      name: input.name,
      description: input.description,
      personality: input.personality ?? null,
      scenario: input.scenario ?? null,
      greetings: input.greetings ?? [],
      exampleMessages: input.exampleMessages ?? null,
      systemPrompt: input.systemPrompt ?? null,
      postHistoryInstructions: input.postHistoryInstructions ?? null,
      depthPrompt: input.depthPrompt ?? null,
      creatorNotes: input.creatorNotes ?? null,
      creator: input.creator ?? null,
      cardVersion: input.cardVersion ?? null,
      regexScripts: input.regexScripts ?? [],
      extensions: input.extensions ?? null,
      avatarAssetId: input.avatarAssetId ?? null,
      refinery: null,
    };

    await insertCharacter(ctx.db, {
      id: characterId,
      handle: input.handle,
      ownerId,
      contentHash: cardContentHash(card),
      importedFrom,
      importHash,
      createdAt: at,
      ...card,
    });

    ctx.emit({ type: "character.updated", characterId });
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "character.create",
        entityType: "character",
        entityId: characterId,
        metadata: { handle: input.handle },
      },
      at,
    );

    const row = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return detailOf(row, await canonicalTagsOf(ctx.db, characterId));
  };
}
