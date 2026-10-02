// verb: import — restore an owned persona from ONE portable FILE, the export.ts round-trip twin. THE one
// import path: the single-entity door and the bundle descriptor both land here, so the refusal copy and the
// collision rule have exactly one home. ADDITIVE (owner ruling): an owned persona with equal content —
// folded name, description, title, placement, art (`findDuplicatePersona`, beside the persona serde) — is
// reused untouched; the same name with different content lands as a second persona under the next free
// name; nothing is merged in place. The backup shape never carries avatarAssetId, so there is no
// asset-ownership guard to run here. NEVER throws for a malformed file.

import { personas } from "@orb/db";
import { nextFreeName } from "@orb/kit/strings";
import { portableParseError } from "#kit/serde/lib";
import { findDuplicatePersona, PERSONA_SCHEMA_KIND, parsePersonaBackup, personaPlacementOf } from "#kit/serde/persona";
import type { PersonaContext } from "../context.ts";
import { PersonaNotFoundError } from "../contract/errors.ts";
import type { ImportPersonaParams } from "../contract/params.ts";
import type { PersonaImportOutcome } from "../contract/results.ts";
import type { PersonaService } from "../contract/service.ts";
import { detailOf, loadOwnedPersonaCandidates, loadOwnedPersonaWithAvatar } from "../persistence/queries.ts";

export function createImport(ctx: PersonaContext): PersonaService["import"] {
  return async ({ principal, bytes }: ImportPersonaParams): Promise<PersonaImportOutcome> => {
    const ownerId = principal.userId;
    const at = ctx.now();
    const parsed = parsePersonaBackup(bytes);
    if (!parsed.ok) {
      return { ok: false, error: portableParseError(PERSONA_SCHEMA_KIND, parsed.reason) };
    }
    const backup = parsed.value;

    const candidates = await loadOwnedPersonaCandidates(ctx.db, ownerId);
    const duplicate = findDuplicatePersona(
      { name: backup.name, title: backup.title, description: backup.description, placement: personaPlacementOf(backup.metadata), artHash: null },
      candidates,
    );
    if (duplicate !== null) {
      const existing = await loadOwnedPersonaWithAvatar(ctx.db, ownerId, duplicate.id);
      if (existing === undefined) {
        throw new PersonaNotFoundError(duplicate.id);
      }
      return { ok: true, persona: detailOf(existing), created: false };
    }

    const personaId = ctx.newPersonaId();
    const name = nextFreeName(
      backup.name,
      candidates.map((c) => c.name),
    );
    await ctx.db.insert(personas).values({
      id: personaId,
      ownerId,
      name,
      title: backup.title,
      description: backup.description,
      starred: backup.starred,
      avatarAssetId: null,
      metadata: backup.metadata,
      createdAt: at,
      updatedAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.import",
        entityType: "persona",
        entityId: personaId,
        metadata: { name, renamedFrom: name === backup.name ? null : backup.name },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "personasChanged", personaId });
    ctx.emit({ type: "persona.updated", personaId });

    const row = await loadOwnedPersonaWithAvatar(ctx.db, ownerId, personaId);
    if (row === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    return { ok: true, persona: detailOf(row), created: true };
  };
}
