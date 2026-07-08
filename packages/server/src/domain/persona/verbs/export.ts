// verb: export — read an owned persona as the portable backup shape (FINAL-Persona §A.6b gap #3). Projects
// `PersonaDetail` onto `@orb/contracts/persona`'s `personaBackupSchema` shape (name/title/description/
// starred/metadata) — deliberately NO `avatarAssetId` (a binary asset reference can't travel in a JSON
// backup; re-attaching an avatar after restore is a separate, explicit action). `import.ts` is the round-
// trip twin: `export` → `import` reproduces the same persona (a fresh id, avatar-less).

import type { PersonaBackupInput } from "@orb/contracts/persona";
import { PersonaNotFoundError } from "../contract/errors";
import type { ExportPersonaParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";
import { detailOf, loadOwnedPersonaWithAvatar } from "../persistence/queries";

export function createExport(ctx: PersonaContext): PersonaService["export"] {
  return async ({ principal, personaId }: ExportPersonaParams): Promise<PersonaBackupInput> => {
    const row = await loadOwnedPersonaWithAvatar(ctx.db, principal.userId, personaId);
    if (row === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    // Reuse `detailOf`'s read-seam narrowing (`personaMetadataSchema.nullable().catch(null)`) so a
    // corrupt stored blob degrades to `null` here exactly like every other persona read — never a
    // second, divergent parse path.
    const detail = detailOf(row);
    return {
      name: detail.name,
      title: detail.title,
      description: detail.description,
      starred: detail.starred,
      metadata: detail.metadata,
    };
  };
}
