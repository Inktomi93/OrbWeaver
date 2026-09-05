// domain/persona/persistence/import-write — the persona-owned bulk-import WRITE. A named exception to
// "persistence is queries only": batch-inserts a profile's personas, dedup-by-name over one owner-scoped
// pre-fetch. No per-CRUD audit/user-bus — a bulk migration writes silently; the driver reconciles + emits
// once at the run level. A name collision reuses the existing persona — resolved through the domain's ONE
// dedup index (`loadOwnedPersonaIdsByDedupName` + `substrate/dedup-name`), the same one the single-FILE
// import door uses, so the two doors cannot disagree about what "the same person" is. NEWEST wins a
// same-folded-name collision (this used to take the FIRST row an unordered select happened to return).

import type { BulkImportPersonasResult } from "@orb/contracts/persona";
import { personas } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { PersonaId } from "@orb/kit/ids";
import type { BulkImportPersonas, PersonaImportContext } from "../contract/import.ts";
import { dedupPersonaName } from "../substrate/dedup-name.ts";
import { loadOwnedPersonaIdsByDedupName } from "./queries.ts";

/** Build the persona-owned bulk-import WRITE op. */
export function createBulkImportPersonas(ctx: PersonaImportContext): BulkImportPersonas {
  return async ({ ownerId, personas: input }): Promise<BulkImportPersonasResult> => {
    const { db } = ctx;

    // THE SAME dedup index the single-FILE door resolves through (`loadOwnedPersonaIdsByDedupName`) — one
    // fold, one collision rule, both doors. This used to be a second hand-rolled fold here, and the two
    // disagreed: "Alice" through the file door and " alice " through this one minted two rows for one person.
    const idByName: Record<string, PersonaId> = Object.fromEntries(await loadOwnedPersonaIdsByDedupName(db, ownerId));

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
      const key = dedupPersonaName(pi.name);
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
