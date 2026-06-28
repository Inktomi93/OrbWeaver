// verb: create — mint a new character owned by the caller (app-authored: import provenance null). Ownership
// is scoped off `principal.userId` (the §7.1 source of truth — never a `users` read). The injected
// `newCharacterId`/`now` keep it deterministic. The card is built from the wire input (defaults applied),
// the `contentHash` is the FLATTEN of that card (NOT NULL column), and `character.updated` is emitted so the
// embeddings indexer re-embeds. Re-reads with the avatar JOIN for the detail view.

import type { CharacterCard } from "@orb/contracts/character";
import { CharacterNotFoundError } from "../contract/errors";
import type { CreateCharacterParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { insertCharacter } from "../persistence/card";
import { detailOf, loadOwnedCharacterWithAvatar } from "../persistence/queries";
import { cardContentHash } from "../substrate/content-hash";

export function createCreate(ctx: CharacterContext): CharacterService["create"] {
  return async ({ principal, input }: CreateCharacterParams) => {
    const ownerId = principal.userId;
    const at = ctx.now();
    const characterId = ctx.newCharacterId();

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
    return detailOf(row);
  };
}
