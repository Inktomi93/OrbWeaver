// verb: create — mint a new persona row owned by the caller. Ownership is scoped off `principal.userId`
// (the §7.1 source of truth — never a `users` read). The injected `newPersonaId`/`now` keep it
// deterministic (no ambient `mintTypeId()`/`Date.now()`). `metadata` is coerced through the typed schema
// at the write seam (the input arrives as a loose write-record; the column is typed `PersonaMetadata`) so
// a non-transport caller can't smuggle an unvalidated blob past the type. Re-reads with the avatar JOIN
// for the detail view (the inserted row alone would lose the joined `assets.hash`).

import { personas } from "@orb/db";
import { PersonaNotFoundError } from "../contract/errors";
import type { CreatePersonaParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";
import { detailOf, ensureAssetOwned, loadOwnedPersonaWithAvatar } from "../persistence/queries";
import { normalizeWriteMetadata } from "../substrate/metadata";

export function createCreate(ctx: PersonaContext): PersonaService["create"] {
  return async ({ principal, input }: CreatePersonaParams) => {
    const ownerId = principal.userId;
    const avatarAssetId = input.avatarAssetId ?? null;
    if (avatarAssetId !== null) {
      // D21 cross-root belt: the FK proves the asset exists, never that it's the caller's.
      await ensureAssetOwned(ctx.db, ownerId, avatarAssetId);
    }
    const at = ctx.now();
    const personaId = ctx.newPersonaId();
    const metadata = normalizeWriteMetadata(input.metadata ?? null);

    await ctx.db.insert(personas).values({
      id: personaId,
      ownerId,
      name: input.name,
      title: input.title ?? null,
      description: input.description,
      starred: input.starred ?? false,
      avatarAssetId,
      metadata,
      createdAt: at,
      updatedAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.create",
        entityType: "persona",
        entityId: personaId,
        metadata: { name: input.name },
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
