// domain/persona/persistence/import-write — the persona-OWNED bulk-import WRITE (Option B; PD-77). A named
// exception to "persistence is queries only": it batch-inserts a profile's personas, dedup-by-name over ONE
// owner-scoped pre-fetch. `import` injects it as a contract-typed op (`@orb/contracts/persona`
// `BulkImportPersonaInput` in, `BulkImportPersonasResult` out) and does the ST translation itself. Touches
// ONLY the `personas` table (Tier-1-DB item 1). NO per-CRUD audit/user-bus (that is the interactive-verb
// path; a bulk migration writes silently — the driver reconciles + emits once at the run level).
//
// DEDUP: a name collision reuses the FIRST existing persona (imports never duplicate an authoring identity).
// `idByName` returns lowercased-name → id for EVERY non-empty input (created + reused) so import can populate
// `personaByUserName` for chat attribution.

import type { BulkImportPersonasResult } from "@orb/contracts/persona";
import { personas } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { PersonaId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { BulkImportPersonas, PersonaImportContext } from "../contract/import";

/** Build the persona-owned bulk-import WRITE op. */
export function createBulkImportPersonas(ctx: PersonaImportContext): BulkImportPersonas {
  return async ({ ownerId, personas: input }): Promise<BulkImportPersonasResult> => {
    const { db } = ctx;

    // Dedup oracle: every persona this owner already has, by lowercased name. A collision reuses the FIRST
    // existing id (a query-local Record — no in-memory persistence state).
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
    const at = ctx.now();

    // Resolve one persona to an id (reuse an existing name-match, else stage an insert). Mutates `idByName`
    // + `inserts` + the create/skip tallies; returns the id.
    const resolve = (key: string, pi: (typeof input)[number]): PersonaId => {
      const found = idByName[key];
      if (found !== undefined) {
        personasSkipped += 1; // already have this authoring identity — reuse it, don't duplicate
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
