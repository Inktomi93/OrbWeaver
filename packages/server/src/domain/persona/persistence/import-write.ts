// domain/persona/persistence/import-write — the persona-owned bulk-import WRITE. A named exception to
// "persistence is queries only": batch-inserts a profile's personas, ADDITIVELY (owner ruling): an owned
// persona with equal content — folded name, description, title, placement and art (`findDuplicatePersona`,
// the ONE identity beside the persona serde) — is reused; the same name with different content lands as a
// second persona under the next free name (`nextFreeName`); nothing is merged or updated in place. No
// per-CRUD audit/user-bus — a bulk migration writes silently; the driver reconciles + emits once at the run
// level.

import type { BulkImportPersonaInput, BulkImportPersonasResult } from "@orb/contracts/persona";
import { personas } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { AssetId, PersonaId } from "@orb/kit/ids";
import { nextFreeName } from "@orb/kit/strings";
import type { PersonaCandidate, PersonaIdentity } from "#kit/serde/persona";
import { findDuplicatePersona, foldPersonaName, personaPlacementOf } from "#kit/serde/persona";
import type { BulkImportPersonas, PersonaImportContext } from "../contract/import.ts";
import { loadOwnedAssetHashes, loadOwnedPersonaCandidates } from "./queries.ts";

/** One input as the identity the dedup compares: its art is the stored asset's own content hash. */
function identityOf(pi: BulkImportPersonaInput, artHashes: readonly { readonly id: AssetId; readonly hash: string }[]): PersonaIdentity {
  const artHash = pi.avatarAssetId === null ? null : artHashes.find((row) => row.id === pi.avatarAssetId)?.hash;
  return { name: pi.name, title: null, description: pi.description, placement: personaPlacementOf(pi.metadata), artHash: artHash ?? null };
}

/** Build the persona-owned bulk-import WRITE op. */
export function createBulkImportPersonas(ctx: PersonaImportContext): BulkImportPersonas {
  return async ({ ownerId, personas: input }): Promise<BulkImportPersonasResult> => {
    const { db } = ctx;
    const candidates = await loadOwnedPersonaCandidates(db, ownerId);
    const artHashes = await loadOwnedAssetHashes(
      db,
      ownerId,
      input.map((pi) => pi.avatarAssetId).filter((id): id is AssetId => id !== null),
    );
    // @orb-waive persistence-no-in-memory-state(Set): call-local collision scan for the free-name mint over the rows this call just read. Ends if it outlives the call.
    const takenNames = new Set(candidates.map((c) => c.name));

    // `idByName` keys the INPUT's folded name (what a transcript's `user_name` says) to the row it resolved
    // to; the first input under a name wins, as the chat attribution map it feeds keeps one id per name.
    const idByName: Record<string, PersonaId> = {};
    let personasCreated = 0;
    let personasSkipped = 0;
    let defaultPersonaId: PersonaId | null = null;
    const inserts: BatchStmt[] = [];
    const at = ctx.now();

    const mint = (identity: PersonaIdentity, pi: (typeof input)[number]): PersonaId => {
      const personaId = ctx.newPersonaId();
      const name = nextFreeName(pi.name, takenNames);
      takenNames.add(name);
      const landed: PersonaCandidate = { ...identity, id: personaId, name };
      candidates.push(landed);
      inserts.push(
        batchStmt(
          db.insert(personas).values({
            id: personaId,
            ownerId,
            name,
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
      const key = foldPersonaName(pi.name);
      if (key.length === 0) {
        continue;
      }
      const identity = identityOf(pi, artHashes);
      const duplicate = findDuplicatePersona(identity, candidates);
      let personaId: PersonaId;
      if (duplicate === null) {
        personaId = mint(identity, pi);
      } else {
        personasSkipped += 1;
        personaId = duplicate.id;
      }
      idByName[key] ??= personaId;
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
