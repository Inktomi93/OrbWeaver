// verb: export — read an owned persona as the portable backup shape. Resolves the owned row to
// PersonaDetail, then hands the fields to buildPersonaBackup, which deliberately excludes avatarAssetId
// (a binary asset reference can't travel in a JSON backup). import.ts is the round-trip twin.

import type { PersonaBackupInput } from "@orb/contracts/persona";
import { buildPersonaBackup } from "#kit/serde/persona";
import type { PersonaContext } from "../context";
import { PersonaNotFoundError } from "../contract/errors";
import type { ExportPersonaParams } from "../contract/params";
import type { PersonaService } from "../contract/service";
import { detailOf, loadOwnedPersonaWithAvatar } from "../persistence/queries";

export function createExport(ctx: PersonaContext): PersonaService["export"] {
  return async ({ principal, personaId }: ExportPersonaParams): Promise<PersonaBackupInput> => {
    const row = await loadOwnedPersonaWithAvatar(ctx.db, principal.userId, personaId);
    if (row === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    const detail = detailOf(row);
    return buildPersonaBackup({
      name: detail.name,
      title: detail.title,
      description: detail.description,
      starred: detail.starred,
      metadata: detail.metadata,
    });
  };
}
