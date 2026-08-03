// verb: export — read an owned persona as ONE portable file. Resolves the owned row to PersonaDetail, then
// hands the fields to `#kit/serde/persona`, which deliberately excludes avatarAssetId (a binary asset
// reference can't travel in a JSON backup). ONE producer for both doors: the bundle descriptor streams this
// file and the single-entity export door serves the same bytes. import.ts is the round-trip twin.

import { slugifyHandle } from "@orb/kit/slug";
import { buildPersonaBackup } from "#kit/serde/persona";
import type { PersonaContext } from "../context";
import { PersonaNotFoundError } from "../contract/errors";
import type { ExportPersonaParams } from "../contract/params";
import type { PersonaPortableFile } from "../contract/results";
import type { PersonaService } from "../contract/service";
import { detailOf, loadOwnedPersonaWithAvatar } from "../persistence/queries";

export function createExport(ctx: PersonaContext): PersonaService["export"] {
  return async ({ principal, personaId }: ExportPersonaParams): Promise<PersonaPortableFile> => {
    const row = await loadOwnedPersonaWithAvatar(ctx.db, principal.userId, personaId);
    if (row === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    const detail = detailOf(row);
    return {
      filename: `${slugifyHandle(detail.name)}.json`,
      bytes: buildPersonaBackup({
        name: detail.name,
        title: detail.title,
        description: detail.description,
        starred: detail.starred,
        metadata: detail.metadata,
      }),
    };
  };
}
