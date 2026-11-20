// verb: export — read an owned persona as ONE portable file. Resolves the owned row to PersonaDetail, then
// hands the fields to `#primitives/serde/persona`, which deliberately excludes avatarAssetId (a binary asset
// reference can't travel in a JSON backup). ONE producer for both doors: the bundle descriptor streams this
// file and the single-entity export door serves the same bytes. import.ts is the round-trip twin. Stored metadata
// that is not JSON is written as none and reported to `note`, never dropped silently.

import { PORTABLE_EXPORT_CARRY } from "@orb/contracts/portability";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { UnreadableJsonText } from "@orb/kit/json";
import { slugifyHandle } from "@orb/kit/slug";
import { buildPersonaBackup } from "#primitives/serde/persona";
import { STORED_CONFIG_UNREADABLE } from "#primitives/stored-config";
import { PersonaNotFoundError } from "../contract/errors.ts";
import type { PersonaContext, PersonaService } from "../contract/service.ts";
import { detailOf, loadOwnedPersonaWithAvatar } from "../persistence/queries.ts";

export function createExport(ctx: PersonaContext): PersonaService["export"] {
  return async ({ principal, personaId, note }) => {
    const row = await loadOwnedPersonaWithAvatar(ctx.db, principal.userId, personaId);
    if (row === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    const detail = detailOf(row);
    if (row.persona.metadata instanceof UnreadableJsonText) {
      note({
        kind: "persona",
        item: detail.name,
        code: STORED_CONFIG_UNREADABLE,
        failure: VERSIONED_PARSE_FAILURES.notJson,
        carried: PORTABLE_EXPORT_CARRY.withoutMetadata,
      });
    }
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
