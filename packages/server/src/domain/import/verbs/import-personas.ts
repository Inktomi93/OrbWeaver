// verb: importPersonas (PD-77) — write a profile's settings.json personas (dedup-by-name) and POPULATE the
// cross-verb `personaByUserName` map so the chat importers can attribute their `user_name`s. MUST run BEFORE
// the chat importers (the driver + the import-st runner order it so). Writes against `@orb/db` DIRECTLY (the
// bulk-serializer exemption, RULING A) via `ctx.profile`.
//
// DEDUP: a name collision reuses the FIRST existing persona (imports never duplicate an authoring identity) —
// pre-fetched in ONE owner-scoped query. A re-import (or two personas sharing a name across avatars) is a
// no-op for the existing row. `avatarAssetId` is set by the driver after storing `avatarBytes` (domain/import
// can't reach domain/assets — the avatar store is injected, same as the card PNG).

import type { PersonaMetadata } from "@orb/contracts/persona";
import { personas } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { PersonaId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ImportPersonasResult } from "../contract/results";
import type { ImportContext, ImportProfileDeps, ImportService } from "../contract/service";
import type { ImportPersonaInput } from "../contract/views";
import { requireProfile } from "../guard";

export function createImportPersonas(ctx: ImportContext): ImportService["importPersonas"] {
  return async ({
    personas: input,
  }: {
    readonly personas: readonly ImportPersonaInput[];
  }): Promise<ImportPersonasResult> => {
    const profile: ImportProfileDeps = requireProfile(ctx);
    const { db, now, personaByUserName } = profile;
    const ownerId = ctx.ownerId;

    // Dedup oracle: every persona this owner already has, by lowercased name. A collision reuses the FIRST
    // existing id (a plain Record — query-local, no in-memory persistence state).
    const existing = await db
      .select({ id: personas.id, name: personas.name })
      .from(personas)
      .where(eq(personas.ownerId, ownerId));
    const idByName: Record<string, PersonaId> = {};
    for (const p of existing) {
      const key = p.name.trim().toLowerCase();
      if (idByName[key] === undefined) {
        idByName[key] = p.id;
      }
    }

    let personasCreated = 0;
    let personasSkipped = 0;
    let defaultPersonaId: PersonaId | null = null;
    const inserts: BatchStmt[] = [];
    const at = now();

    // Resolve one parsed persona to an id (reuse an existing name-match, else stage an insert). Returns the
    // id + whether it was newly created; mutates `idByName` + `inserts` (the batch accumulator).
    const resolve = (pi: ImportPersonaInput): PersonaId => {
      const key = pi.parsed.name.trim().toLowerCase();
      const found = idByName[key];
      if (found !== undefined) {
        personasSkipped += 1; // already have this authoring identity — reuse it, don't duplicate
        return found;
      }
      const id = profile.newPersonaId();
      idByName[key] = id;
      inserts.push(
        batchStmt(
          db.insert(personas).values({
            id,
            ownerId,
            name: pi.parsed.name,
            description: pi.parsed.description,
            avatarAssetId: pi.avatarAssetId ?? null,
            metadata: (pi.parsed.metadata as PersonaMetadata | null) ?? null,
            createdAt: at,
            updatedAt: at,
          }),
        ),
      );
      personasCreated += 1;
      return id;
    };

    for (const pi of input) {
      const key = pi.parsed.name.trim().toLowerCase();
      if (key.length === 0) {
        continue;
      }
      const personaId = resolve(pi);
      personaByUserName.set(key, personaId);
      if (pi.parsed.isDefault) {
        defaultPersonaId = personaId;
      }
    }
    if (inserts.length > 0) {
      await db.batch(batchMany(inserts));
    }
    return { personasCreated, personasSkipped, defaultPersonaId };
  };
}
