// verb: create — mint a new character owned by the caller. Ownership is scoped off `principal.userId` (the
// §7.1 source of truth — never a `users` read). The injected `newCharacterId`/`now` keep it deterministic.
// The card is built from the wire input (defaults applied), the `contentHash` is the FLATTEN of that card
// (NOT NULL column), and `character.updated` is emitted so the embeddings indexer re-embeds. Import
// Import provenance (`importedFrom`/`importHash`) is stamped when the optional `provenance` arrives (the import
// composition-root wire); app-authored cards omit it and the columns stay null. Re-reads with the
// avatar JOIN for the detail view.

import type { CharacterCard } from "@orb/contracts/character";
import { cardContentHash } from "#kit/serde/card";
import type { CharacterContext } from "../context.ts";
import { CHARACTER_HANDLE_RESERVED, CharacterNotFoundError, CharacterOperationError } from "../contract/errors.ts";
import type { CharacterImportProvenance, CreateCharacterParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { insertCharacter } from "../persistence/card.ts";
import { canonicalTagsOf, detailOf, ensureAssetOwned, loadOwnedCharacterWithAvatar } from "../persistence/queries.ts";
import { cardTokenSize } from "../substrate/card-tokens.ts";
import { isReservedGroupHandle } from "../substrate/group-character.ts";

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

/** The V3 content promotions defaulted from the wire input — extracted so `cardFromInput` stays under the
 *  cognitive-complexity gate. */
function promotionsFromInput(input: CreateCharacterParams["input"]): Pick<CharacterCard, "nickname" | "source" | "creationDate" | "modificationDate"> {
  return {
    nickname: input.nickname ?? null,
    source: input.source ?? null,
    creationDate: input.creationDate ?? null,
    modificationDate: input.modificationDate ?? null,
  };
}

/** Apply the wire input's defaults → the full `CharacterCard` to flatten + insert. Extracted (like
 *  `provenanceColumns`/`guardAvatarOwned`) to keep the verb closure under the cognitive-complexity gate. */
function cardFromInput(input: CreateCharacterParams["input"]): CharacterCard {
  return {
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
    ...promotionsFromInput(input),
    extensions: input.extensions ?? null,
    residualData: input.residualData ?? null,
    avatarAssetId: input.avatarAssetId ?? null,
    refinery: null,
  };
}

export function createCreate(ctx: CharacterContext): CharacterService["create"] {
  return async ({ principal, input, provenance }: CreateCharacterParams) => {
    const ownerId = principal.userId;
    if (isReservedGroupHandle(input.handle)) {
      throw new CharacterOperationError(CHARACTER_HANDLE_RESERVED, `handle "${input.handle}" is reserved for synthetic group characters`);
    }
    await guardAvatarOwned(ctx, ownerId, input.avatarAssetId);
    const at = ctx.now();
    const characterId = ctx.newCharacterId();
    const { importedFrom, importHash } = provenanceColumns(provenance);

    const card = cardFromInput(input);

    await insertCharacter(
      ctx.db,
      {
        id: characterId,
        handle: input.handle,
        ownerId,
        contentHash: cardContentHash(card),
        tokenSize: cardTokenSize(card),
        importedFrom,
        importHash,
        createdAt: at,
        ...card,
      },
      ctx.bumpStatsCanonVersion,
    );

    // EMISSION FOLLOWS THE DURABLE WRITE *AND* ITS AUDIT. `emit` is a synchronous void op that hands the
    // character to the embeddings indexer; it used to fire ahead of `await ctx.audit(...)`, so an audit that
    // rejected left the caller with a failed create while the indexer had already embedded the row and the
    // owner's feed had no `charactersChanged` to reconcile it with. The audit is the last thing that can
    // fail, so nothing is announced until it has landed.
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
    // A brand-new card is all content → the indexer embeds it (contentChanged is always true for create).
    ctx.emit({ type: "character.updated", characterId, contentChanged: true });
    ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId });

    const row = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return detailOf(row, await canonicalTagsOf(ctx.db, characterId));
  };
}
