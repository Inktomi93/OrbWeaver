// verb: update — patch an owned persona (whitelisted fields; undefined skips, null clears). The
// whitelist is load-bearing: stripUndefined over an explicit field list stops an internal caller from
// smuggling identity columns past the structural type. UPDATE ... WHERE id=? AND owner_id=? RETURNING
// folds the ownership check into the mutation.

import { personas } from "@orb/db";
import { stripUndefined } from "@orb/kit/objects";
import { and, eq } from "drizzle-orm";
import type { PersonaContext } from "../context";
import { PersonaNotFoundError } from "../contract/errors";
import type { UpdatePersonaParams } from "../contract/params";
import type { PersonaService } from "../contract/service";
import { detailOf, ensureAssetOwned, loadOwnedPersonaWithAvatar } from "../persistence/queries";
import { normalizeWriteMetadata } from "../substrate/metadata";

export function createUpdate(ctx: PersonaContext): PersonaService["update"] {
  return async ({ principal, personaId, input }: UpdatePersonaParams) => {
    const ownerId = principal.userId;
    if (input.avatarAssetId !== null && input.avatarAssetId !== undefined) {
      // The FK proves the asset exists, never that it's the caller's.
      await ensureAssetOwned(ctx.db, ownerId, input.avatarAssetId);
    }
    const metadata =
      input.metadata === undefined ? undefined : normalizeWriteMetadata(input.metadata);
    const edits = stripUndefined({
      name: input.name,
      title: input.title,
      description: input.description,
      starred: input.starred,
      avatarAssetId: input.avatarAssetId,
      metadata,
    });

    if (Object.keys(edits).length > 0) {
      const at = ctx.now();
      const rows = await ctx.db
        .update(personas)
        .set({ ...edits, updatedAt: at })
        .where(and(eq(personas.id, personaId), eq(personas.ownerId, ownerId)))
        .returning({ id: personas.id });
      if (rows.length === 0) {
        throw new PersonaNotFoundError(personaId);
      }
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "persona.update",
          entityType: "persona",
          entityId: personaId,
          metadata: { fields: Object.keys(edits) },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "personasChanged", personaId });
    }

    const updated = await loadOwnedPersonaWithAvatar(ctx.db, ownerId, personaId);
    if (updated === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    return detailOf(updated);
  };
}
