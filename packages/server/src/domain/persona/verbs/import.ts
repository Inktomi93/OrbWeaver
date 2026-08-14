// verb: import — restore an owned persona from ONE portable FILE, the export.ts round-trip twin. THE one
// import path: the single-entity door and the bundle descriptor both land here, so the refusal copy and the
// merge semantics have exactly one home (F8 — the descriptor used to carry this body at the composition
// root, where no domain test mirror could see it). The backup shape never carries avatarAssetId, so there is
// no asset-ownership belt to run here. Idempotent: dedups on (ownerId, name) — a same-named persona is merged
// in place (merged:true in the audit); otherwise a fresh row is minted. NEVER throws for a malformed file.

import { personas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { portableParseError } from "#kit/serde/lib";
import { PERSONA_SCHEMA_KIND, parsePersonaBackup } from "#kit/serde/persona";
import type { PersonaContext } from "../context.ts";
import { PersonaNotFoundError } from "../contract/errors.ts";
import type { ImportPersonaParams } from "../contract/params.ts";
import type { PersonaImportOutcome } from "../contract/results.ts";
import type { PersonaService } from "../contract/service.ts";
import { detailOf, findOwnedPersonaByName, loadOwnedPersonaWithAvatar } from "../persistence/queries.ts";

export function createImport(ctx: PersonaContext): PersonaService["import"] {
  return async ({ principal, bytes }: ImportPersonaParams): Promise<PersonaImportOutcome> => {
    const ownerId = principal.userId;
    const at = ctx.now();
    const parsed = parsePersonaBackup(bytes);
    if (!parsed.ok) {
      return { ok: false, error: portableParseError(PERSONA_SCHEMA_KIND, parsed.reason) };
    }
    const backup = parsed.value;

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
    // The MERGE arm is a content write to a persona that may be seated in live rooms (a restore over an
    // existing name rewrites title/description/metadata), so it takes the room plane too (entity→room bridge
    // §3.6). Emitted on the fresh-mint arm as well: the reach lookup resolves ∅ for an unseated persona, so
    // the branch would buy one query's difference at the cost of a second code path.
    ctx.emit({ type: "persona.updated", personaId });

    const row = await loadOwnedPersonaWithAvatar(ctx.db, ownerId, personaId);
    if (row === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    return { ok: true, persona: detailOf(row), created: existingId === null };
  };
}
