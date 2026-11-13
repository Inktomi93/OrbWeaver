// domain/persona/persistence/import-write — the persona-owned bulk-import WRITE. A named exception to
// "persistence is queries only": batch-inserts a profile's personas. An owned persona with equal content —
// folded name, description, title, placement and art (`findDuplicatePersona`, the ONE identity beside the
// persona serde) — is reused. The same name with different content is a collision, resolved by the run's
// per-collision choice: merge links to the owned persona and leaves its content alone (the default), keep-both
// lands a second persona under the next free name (`nextFreeName`). The read-only twin for a dry run asks the same
// decision (`reusedPersona`) under the same choices. No per-CRUD audit/user-bus — a bulk
// migration writes silently; the driver reconciles + emits once at the run level.

import type { ImportReuse, PersonaCollisionChoice } from "@orb/contracts/import";
import { personaCollisionChoiceFor } from "@orb/contracts/import";
import type { BulkImportPersonaInput, BulkImportPersonas, BulkImportPersonasResult, FindOwnedPersonas } from "@orb/contracts/persona";
import { personas } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany, batchStmt } from "@orb/db/query";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, PersonaId } from "@orb/kit/ids";
import type { PersonaCandidate, PersonaIdentity } from "#primitives/serde/persona";
import { findDuplicatePersona, findNameCollision, foldPersonaName, mintPersonaName, personaPlacementOf } from "#primitives/serde/persona";
import type { PersonaImportContext } from "../contract/import.ts";
import { ensureAvatarAssets, loadOwnedAssetHashes, loadOwnedPersonaCandidates } from "./queries.ts";

/** The identity the dedup compares: its art is the stored asset's own content hash. */
function identityFrom(pi: Pick<BulkImportPersonaInput, "name" | "description" | "metadata">, artHash: string | null): PersonaIdentity {
  return { name: pi.name, title: null, description: pi.description, placement: personaPlacementOf(pi.metadata), artHash };
}

function identityOf(pi: BulkImportPersonaInput, artHashes: readonly { readonly id: AssetId; readonly hash: string }[]): PersonaIdentity {
  const artHash = pi.avatarAssetId === null ? null : artHashes.find((row) => row.id === pi.avatarAssetId)?.hash;
  return identityFrom(pi, artHash ?? null);
}

/** The persona an input lands on without minting a row, or null to mint a copy. Equal content is always
 *  reused; the same name with different content (a collision with a persona owned before the run) only when
 *  the choice is merge. The write and its read-only twin both ask this, so a preview cannot drift from the run. */
function reusedPersona<Candidate extends PersonaIdentity>(
  identity: PersonaIdentity,
  candidates: readonly Candidate[],
  owned: readonly Candidate[],
  choice: PersonaCollisionChoice,
): { readonly persona: Candidate; readonly kind: "skipped" | "merged" } | null {
  const duplicate = findDuplicatePersona(identity, candidates);
  if (duplicate !== null) {
    return { persona: duplicate, kind: "skipped" };
  }
  const collision = findNameCollision(identity, owned);
  return collision !== null && choice === "merge" ? { persona: collision, kind: "merged" } : null;
}

/** The read-only twin of {@link createBulkImportPersonas}'s reuse, for a preview that must not write. It judges the
 *  inputs in the order the write lands them and under the same choices: a persona equal to an owned one, or merged
 *  into the owned persona that holds its name, answers `"library"`; one equal to an earlier input answers `"upload"`. */
export function createFindOwnedPersonas(assembly: Pick<DbAssemblyInput<PersonaImportContext>, "db">): FindOwnedPersonas {
  const db = databaseForOwner(assembly.db);
  return async ({ ownerId, personas: input, collisions }): Promise<readonly (ImportReuse | null)[]> => {
    const owned: readonly PersonaIdentity[] = await loadOwnedPersonaCandidates(db, ownerId);
    // call-local: the owned identities plus the inputs judged so far that the write would mint. Ends if it outlives the call.
    const candidates = [...owned];
    return input.map((pi): ImportReuse | null => {
      const identity = identityFrom(pi, pi.artHash);
      const reused = reusedPersona(identity, candidates, owned, personaCollisionChoiceFor(collisions, foldPersonaName(pi.name)));
      if (reused === null) {
        candidates.push(identity);
        return null;
      }
      return owned.includes(reused.persona) ? "library" : "upload";
    });
  };
}

/** Count a reused persona under its kind (a merge also records its folded name) and return its id. */
function tally(
  counts: { skipped: number },
  mergedKeys: Set<string>,
  key: string,
  reused: { readonly persona: { readonly id: PersonaId }; readonly kind: "skipped" | "merged" },
): PersonaId {
  if (reused.kind === "merged") {
    mergedKeys.add(key);
  } else {
    counts.skipped += 1;
  }
  return reused.persona.id;
}

/** Build the persona-owned bulk-import WRITE op. */
export function createBulkImportPersonas(assembly: DbAssemblyInput<PersonaImportContext>): BulkImportPersonas {
  const ctx: PersonaImportContext = { ...assembly, db: databaseForOwner(assembly.db) };
  return async ({ ownerId, personas: input, collisions }): Promise<BulkImportPersonasResult> => {
    const { db } = ctx;
    const avatarIds = input.map((pi) => pi.avatarAssetId).filter((id): id is AssetId => id !== null);
    await ensureAvatarAssets(db, ownerId, avatarIds);
    const candidates = await loadOwnedPersonaCandidates(db, ownerId);
    // Only personas owned BEFORE this call can collide: two inputs sharing a name inside one run still land
    // side by side, as they always did.
    const owned = [...candidates];
    const artHashes = await loadOwnedAssetHashes(db, ownerId, avatarIds);
    // call-local collision scan for the free-name mint over the rows this call just read. Ends if it outlives the call.
    const takenNames = new Set(candidates.map((c) => foldPersonaName(c.name)));

    // `idByName` keys the INPUT's folded name (what a transcript's `user_name` says) to the row it resolved
    // to; the first input under a name wins, as the chat attribution map it feeds keeps one id per name.
    const idByName: Record<string, PersonaId> = {};
    const counts = { created: 0, skipped: 0 };
    // call-local record of the merged names for this run's result. Ends if it outlives the call.
    const mergedKeys = new Set<string>();
    let defaultPersonaId: PersonaId | null = null;
    const inserts: BatchStmt[] = [];
    const at = ctx.now();

    const mint = (identity: PersonaIdentity, pi: (typeof input)[number]): PersonaId => {
      const personaId = ctx.newPersonaId();
      const name = mintPersonaName(pi.name.trim(), takenNames);
      takenNames.add(foldPersonaName(name));
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
      counts.created += 1;
      return personaId;
    };

    for (const pi of input) {
      const key = foldPersonaName(pi.name);
      if (key.length === 0) {
        continue;
      }
      const identity = identityOf(pi, artHashes);
      const reused = reusedPersona(identity, candidates, owned, personaCollisionChoiceFor(collisions, key));
      const personaId = reused === null ? mint(identity, pi) : tally(counts, mergedKeys, key, reused);
      idByName[key] ??= personaId;
      if (pi.isDefault) {
        defaultPersonaId = personaId;
      }
    }

    if (inserts.length > 0) {
      await db.batch(batchMany(inserts));
    }
    return {
      personasCreated: counts.created,
      personasSkipped: counts.skipped,
      personasMerged: mergedKeys.size,
      mergedKeys: [...mergedKeys],
      defaultPersonaId,
      idByName,
    };
  };
}
