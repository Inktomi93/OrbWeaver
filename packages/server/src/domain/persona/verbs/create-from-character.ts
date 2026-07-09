// verb: createFromCharacter — mint a persona from an owned character's card (ST convertCharacterToPersona).
// Copies name/description/avatar; when `swapMacros`, the description's `{{char}}`/`{{user}}` invert (the
// player's POV). Reads the FLAT `characters` row directly (D28 — no version table; a SANCTIONED schema read
// that also gates ownership in one round-trip: a foreign/absent character → `PersonaCharacterNotFoundError`).
//
// NON-LOSSY: the row stores `sourceCharacterId` + `swapMacros` provenance in the
// typed metadata, so the swap decision is recoverable (a persona minted from a card can re-derive its
// description if the card is edited). The persona shares the character's avatar asset (both FK the same
// `assets.id`).

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
