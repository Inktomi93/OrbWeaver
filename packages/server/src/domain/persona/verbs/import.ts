// verb: import — restore an owned persona from a backup blob (FINAL-Persona §A.6b gap #3, the `export.ts`
// round-trip twin). Runs the untrusted blob through the ONE persona-backup serde core (`#kit/serde/persona`
// `parsePersonaBackup`) which owns the backup grammar — the `create`-parity field defaults + the metadata
// narrowing — then writes like `create.ts` minus the avatar branch: the backup shape never carries
// `avatarAssetId` (`@orb/contracts/persona` `personaBackupSchema` excludes it), so there is no asset-ownership
// belt to run here.
//
// IDEMPOTENT / MERGE (audit gap G-7): dedups on `(ownerId, name)` — the preset/world-info backup-import
// reuse-or-merge precedent. A same-named owned persona is MERGED IN PLACE (its visible fields swapped, same
// id, `merged:true` in the audit); otherwise a fresh owned row is minted (`merged:false`). Re-importing the
// same backup creates ZERO duplicate rows. Returns the resolved `PersonaDetail` either way (the client shows
// the restored persona); the created-vs-merged signal rides the audit `merged` flag.

import { personas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { parsePersonaBackup } from "#kit/serde/persona";
import { PersonaNotFoundError } from "../contract/errors";
import type { ImportPersonaParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";
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

    // Merge into the existing same-named persona (visible fields swapped in place, same id, avatar untouched
    // — the backup carries none). The name is the match key, so it is left as-is.
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
