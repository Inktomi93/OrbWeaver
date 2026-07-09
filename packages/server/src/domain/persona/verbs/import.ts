// verb: import — mint a fresh owned persona from a backup blob (FINAL-Persona §A.6b gap #3, the `export.ts`
// round-trip twin). Mirrors `create.ts` (same insert shape) minus the avatar branch — `PersonaBackupInput`
// never carries `avatarAssetId` (the backup shape excludes it, `@orb/contracts/persona`
// `personaBackupSchema`), so there is no asset-ownership belt to run here.

import { personas } from "@orb/db";
import { PersonaNotFoundError } from "../contract/errors";
import type { ImportPersonaParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";
import { detailOf, loadOwnedPersonaWithAvatar } from "../persistence/queries";
import { normalizeWriteMetadata } from "../substrate/metadata";

export function createImport(ctx: PersonaContext): PersonaService["import"] {
  return async ({ principal, input }: ImportPersonaParams) => {
    const ownerId = principal.userId;
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
      avatarAssetId: null,
      metadata,
      createdAt: at,
      updatedAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.import",
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
