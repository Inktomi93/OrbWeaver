// verb: import — restore an owned persona from a backup blob, the export.ts round-trip twin. The backup
// shape never carries avatarAssetId, so there is no asset-ownership belt to run here. Idempotent: dedups on
// (ownerId, name) — a same-named persona is merged in place (merged:true in the audit); otherwise a fresh
// row is minted.

import { personas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { parsePersonaBackup } from "#kit/serde/persona";
import type { PersonaContext } from "../context";
import { PersonaNotFoundError } from "../contract/errors";
import type { ImportPersonaParams } from "../contract/params";
import type { PersonaService } from "../contract/service";
import {
  detailOf,
  findOwnedPersonaByName,
  loadOwnedPersonaWithAvatar,
} from "../persistence/queries";

export function createImport(ctx: PersonaContext): PersonaService["import"] {
  return async ({ principal, input }: ImportPersonaParams) => {
    const ownerId = principal.userId;
    const at = ctx.now();
    const backup = parsePersonaBackup(input);

    const existingId = await findOwnedPersonaByName(ctx.db, ownerId, backup.name);

    const personaId = existingId ?? ctx.newPersonaId();
    if (existingId !== null) {
      await ctx.db
        .update(personas)
        .set({
          title: backup.title,
          description: backup.description,
          starred: backup.starred,
          metadata: backup.metadata,
          updatedAt: at,
        })
        .where(and(eq(personas.id, existingId), eq(personas.ownerId, ownerId)));
    } else {
      await ctx.db.insert(personas).values({
        id: personaId,
        ownerId,
        name: backup.name,
        title: backup.title,
        description: backup.description,
        starred: backup.starred,
        avatarAssetId: null,
        metadata: backup.metadata,
        createdAt: at,
        updatedAt: at,
      });
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.import",
        entityType: "persona",
        entityId: personaId,
        metadata: { name: backup.name, merged: existingId !== null },
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
