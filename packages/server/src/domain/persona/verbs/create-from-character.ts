// verb: createFromCharacter — mint a persona from an owned character's card. Copies name/description/
// avatar; when swapMacros, the description's {{char}}/{{user}} invert. Reads the characters row directly,
// gating ownership in one round-trip: a foreign/absent character → PersonaCharacterNotFoundError. The row
// stores sourceCharacterId + swapMacros provenance so the swap decision is recoverable.

import { characters, personas } from "@orb/db";
import { eq } from "drizzle-orm";
import { PersonaCharacterNotFoundError, PersonaNotFoundError } from "../contract/errors";
import type { CreateFromCharacterParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";
import { detailOf, loadOwnedPersonaWithAvatar } from "../persistence/queries";
import { swapPersonaMacros } from "../substrate/macro-swap";

const LIMIT_ONE = 1;

export function createCreateFromCharacter(
  ctx: PersonaContext,
): PersonaService["createFromCharacter"] {
  return async ({ principal, characterId, swapMacros }: CreateFromCharacterParams) => {
    const ownerId = principal.userId;
    const rows = await ctx.db
      .select({
        name: characters.name,
        description: characters.description,
        avatarAssetId: characters.avatarAssetId,
        ownerId: characters.ownerId,
      })
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(LIMIT_ONE);
    const card = rows[0];
    if (card === undefined || card.ownerId !== ownerId) {
      throw new PersonaCharacterNotFoundError(characterId);
    }

    const source = card.description ?? "";
    const description = swapMacros ? swapPersonaMacros(source) : source;
    const at = ctx.now();
    const personaId = ctx.newPersonaId();

    await ctx.db.insert(personas).values({
      id: personaId,
      ownerId,
      name: card.name,
      description,
      avatarAssetId: card.avatarAssetId,
      metadata: { sourceCharacterId: characterId, swapMacros },
      createdAt: at,
      updatedAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.createFromCharacter",
        entityType: "persona",
        entityId: personaId,
        metadata: { characterId, name: card.name, swapMacros },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "personasChanged", personaId });

    const row = await loadOwnedPersonaWithAvatar(ctx.db, ownerId, personaId);
    if (row === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    return detailOf(row);
  };
}
