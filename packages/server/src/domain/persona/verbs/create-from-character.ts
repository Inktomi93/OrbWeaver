// verb: createFromCharacter — mint a persona from an owned character's card. Copies name/description/
// avatar; when swapMacros, the description's {{char}}/{{user}} invert. The source card is read through
// persistence' `loadOwnedCharacterCard`, which gates ownership in one round-trip: a foreign/absent
// character → PersonaCharacterNotFoundError. `characters` is CHARACTER's table, so the read lives in
// persona's `persistence/` (the cross-domain ownership-check home, beside `ensureCharacterOwned`) and never
// in the verb — Tier-1-DB.md §"Cross-tier composition" / the `own-tables-only` gate. The row stores
// sourceCharacterId + swapMacros provenance so the swap decision is recoverable.

import { personas } from "@orb/db";
import type { PersonaContext } from "../context.ts";
import { PersonaNotFoundError } from "../contract/errors.ts";
import type { CreateFromCharacterParams } from "../contract/params.ts";
import type { PersonaService } from "../contract/service.ts";
import { detailOf, loadOwnedCharacterCard, loadOwnedPersonaWithAvatar } from "../persistence/queries.ts";
import { swapPersonaMacros } from "../substrate/macro-swap.ts";

export function createCreateFromCharacter(ctx: PersonaContext): PersonaService["createFromCharacter"] {
  return async ({ principal, characterId, swapMacros }: CreateFromCharacterParams) => {
    const ownerId = principal.userId;
    const card = await loadOwnedCharacterCard(ctx.db, ownerId, characterId);

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
