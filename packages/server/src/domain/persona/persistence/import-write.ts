// domain/persona/persistence/import-write — the persona-owned bulk-import WRITE. A named exception to
// "persistence is queries only": batch-inserts a profile's personas, dedup-by-name over one owner-scoped
// pre-fetch. No per-CRUD audit/user-bus — a bulk migration writes silently; the driver reconciles + emits
// once at the run level. A name collision reuses the FIRST existing persona.

import type { BulkImportPersonasResult } from "@orb/contracts/persona";
import { personas } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { PersonaId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { BulkImportPersonas, PersonaImportContext } from "../contract/import.ts";

/** Build the persona-owned bulk-import WRITE op. */
export function createBulkImportPersonas(ctx: PersonaImportContext): BulkImportPersonas {
  return async ({ ownerId, personas: input }): Promise<BulkImportPersonasResult> => {
    const { db } = ctx;

    const existing = await db.select({ id: personas.id, name: personas.name }).from(personas).where(eq(personas.ownerId, ownerId));
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
    const at = ctx.now();

    const resolve = (key: string, pi: (typeof input)[number]): PersonaId => {
      const found = idByName[key];
      if (found !== undefined) {
        personasSkipped += 1;
        return found;
      }
      const personaId = ctx.newPersonaId();
      idByName[key] = personaId;
      inserts.push(
        batchStmt(
          db.insert(personas).values({
            id: personaId,
            ownerId,
            name: pi.name,
            title: null,
            description: pi.description,
            starred: false,
            avatarAssetId: pi.avatarAssetId,
            metadata: pi.metadata,
            createdAt: at,
            updatedAt: at,
          }),
        ),
      );
      personasCreated += 1;
      return personaId;
    };

    for (const pi of input) {
      const key = pi.name.trim().toLowerCase();
      if (key.length === 0) {
        continue;
      }
      const personaId = resolve(key, pi);
      if (pi.isDefault) {
        defaultPersonaId = personaId;
      }
    }

    if (inserts.length > 0) {
      await db.batch(batchMany(inserts));
    }
    return { personasCreated, personasSkipped, defaultPersonaId, idByName };
  };
}
