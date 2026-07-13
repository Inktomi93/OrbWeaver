// verb: duplicate — clone an owned persona into a fresh row (FINAL-Persona §A.6b gap #2, mirrors
// `domain/character/verbs/duplicate.ts`). The clone: name suffixed " (copy)" (personas carry no unique-name
// constraint — `db/schema/persona.ts` — so no `-2`/`-3` numbering hunt is needed, unlike character's unique
// `handle`); `starred` reset to false (a fresh identity, not a second favorite); `avatarAssetId`/`metadata`
// carried forward VERBATIM — re-pointing to the SAME asset id is trivial (no new asset/blob is minted; the
// task's "not the avatar asset unless trivial to re-point" bar).

import { personas } from "@orb/db";
import type { PersonaContext } from "../context";
import { PersonaNotFoundError } from "../contract/errors";
import type { DuplicatePersonaParams } from "../contract/params";
import type { PersonaService } from "../contract/service";
import { detailOf, loadOwnedPersonaWithAvatar } from "../persistence/queries";

const COPY_SUFFIX = " (copy)";

export function createDuplicate(ctx: PersonaContext): PersonaService["duplicate"] {
  return async ({ principal, personaId }: DuplicatePersonaParams) => {
    const ownerId = principal.userId;
    const source = await loadOwnedPersonaWithAvatar(ctx.db, ownerId, personaId);
    if (source === undefined) {
      throw new PersonaNotFoundError(personaId);
    }

    const newId = ctx.newPersonaId();
    const at = ctx.now();
    await ctx.db.insert(personas).values({
      id: newId,
      ownerId,
      name: `${source.persona.name}${COPY_SUFFIX}`,
      title: source.persona.title,
      description: source.persona.description,
      starred: false,
      avatarAssetId: source.persona.avatarAssetId,
      metadata: source.persona.metadata,
      createdAt: at,
      updatedAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.duplicate",
        entityType: "persona",
        entityId: newId,
        metadata: { from: personaId },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "personasChanged", personaId: newId });

    const row = await loadOwnedPersonaWithAvatar(ctx.db, ownerId, newId);
    if (row === undefined) {
      throw new PersonaNotFoundError(newId);
    }
    return detailOf(row);
  };
}
