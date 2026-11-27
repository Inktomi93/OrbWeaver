// domain/persona/persistence/import-write — the persona-owned bulk-import WRITE. A named exception to
// "persistence is queries only": batch-inserts a profile's personas. An owned persona with equal content, or one an
// earlier input of the batch lands — folded name, description, title, placement and art (`findDuplicatePersona`, the
// ONE identity beside the persona serde) — is reused. The same name with different content as a persona owned before
// the batch is a collision, resolved by the run's per-collision choice: merge links to the owned persona and leaves its
// content alone (the default), keep-both lands a second persona under the next free name (`nextFreeName`). The dry
// run is this same loop with the write left out, so a preview cannot drift from the run. No per-CRUD audit/user-bus —
// a bulk migration writes silently; the driver reconciles + emits once at the run level.

import type { ImportAnswer, PersonaCollisionChoice, PersonaCollisionChoices } from "@orb/contracts/import";
import { personaCollisionChoiceFor } from "@orb/contracts/import";
import type { BulkImportPersonaInput, BulkImportPersonas, BulkImportPersonasResult, DryRunPersonaInput } from "@orb/contracts/persona";
import { personas } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany, batchStmt } from "@orb/db/query";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, PersonaId, UserId } from "@orb/kit/ids";
import type { PersonaCandidate, PersonaIdentity } from "#primitives/serde/persona";
import { findDuplicatePersona, findNameCollision, foldPersonaName, mintPersonaName, personaContentKey, personaPlacementOf } from "#primitives/serde/persona";
import type { PersonaImportContext } from "../contract/import.ts";
import { ensureAvatarAssets, loadOwnedAssetHashes, loadOwnedPersonaCandidates } from "./queries.ts";

/** The identity the dedup compares: its art is the stored asset's own content hash. */
function identityFrom(pi: Pick<BulkImportPersonaInput, "name" | "description" | "metadata">, artHash: string | null): PersonaIdentity {
  return { name: pi.name, title: null, description: pi.description, placement: personaPlacementOf(pi.metadata), artHash };
}

/** The persona an input lands on without minting a row, or null to mint a copy. Equal content is always
 *  reused; the same name with different content (a collision with a persona owned before the run) only when
 *  the choice is merge. */
function reusedPersona(
  identity: PersonaIdentity,
  candidates: readonly PersonaCandidate[],
  owned: readonly PersonaCandidate[],
  choice: PersonaCollisionChoice,
): { readonly persona: PersonaCandidate; readonly kind: "skipped" | "merged" } | null {
  const duplicate = findDuplicatePersona(identity, candidates);
  if (duplicate !== null) {
    return { persona: duplicate, kind: "skipped" };
  }
  const collision = findNameCollision(identity, owned);
  return collision !== null && choice === "merge" ? { persona: collision, kind: "merged" } : null;
}

/** One input as the batch judged it, in order: the persona it reused, or the row it mints. */
interface Judged<Input> {
  readonly input: Input;
  readonly key: string;
  readonly identity: PersonaIdentity;
  readonly reused: ReturnType<typeof reusedPersona>;
  /** The minted row, when `reused` is null. */
  readonly minted: PersonaCandidate | null;
  /** The row the input resolves to: the reused persona or the minted one. */
  readonly personaId: PersonaId;
}

/** Judge every input against the owner's personas and the ones the batch mints before it. A minted persona is entered
 *  as a candidate under its minted name, so a later equal input reuses it. */
function judgeBatch<Input extends Pick<BulkImportPersonaInput, "name">>(args: {
  readonly owned: readonly PersonaCandidate[];
  readonly inputs: readonly Input[];
  readonly identityOf: (input: Input) => PersonaIdentity;
  readonly collisions: PersonaCollisionChoices | undefined;
  readonly newPersonaId: PersonaImportContext["newPersonaId"];
}): Judged<Input>[] {
  const candidates = [...args.owned];
  // call-local collision scan for the free-name mint over the owned names and the batch's mints. Ends if it outlives the call.
  const takenNames = new Set(candidates.map((c) => foldPersonaName(c.name)));
  return args.inputs.map((input) => {
    const key = foldPersonaName(input.name);
    const identity = args.identityOf(input);
    const reused = reusedPersona(identity, candidates, args.owned, personaCollisionChoiceFor(args.collisions, key));
    if (reused !== null) {
      return { input, key, identity, reused, minted: null, personaId: reused.persona.id };
    }
    const name = mintPersonaName(input.name.trim(), takenNames);
    takenNames.add(foldPersonaName(name));
    const minted: PersonaCandidate = { ...identity, id: args.newPersonaId(), name };
    candidates.push(minted);
    return { input, key, identity, reused, minted, personaId: minted.id };
  });
}

type Batch<Input> = Omit<Parameters<BulkImportPersonas>[0], "personas" | "dryRun"> & { readonly personas: readonly Input[] };

/** Build the persona-owned bulk-import WRITE op. */
export function createBulkImportPersonas(assembly: DbAssemblyInput<PersonaImportContext>): BulkImportPersonas {
  const ctx: PersonaImportContext = { ...assembly, db: databaseForOwner(assembly.db) };

  async function insertMinted(ownerId: UserId, judged: readonly Judged<BulkImportPersonaInput>[]): Promise<void> {
    const at = ctx.now();
    const inserts: BatchStmt[] = judged.flatMap(({ input: pi, minted }) =>
      minted === null
        ? []
        : [
            batchStmt(
              ctx.db.insert(personas).values({
                id: minted.id,
                ownerId,
                name: minted.name,
                title: null,
                description: pi.description,
                starred: false,
                avatarAssetId: pi.avatarAssetId,
                metadata: pi.metadata,
                createdAt: at,
                updatedAt: at,
              }),
            ),
          ],
    );
    if (inserts.length > 0) {
      await ctx.db.batch(batchMany(inserts));
    }
  }

  async function bulkImportPersonas(args: Batch<DryRunPersonaInput> & { readonly dryRun: true }): Promise<readonly ImportAnswer[]>;
  async function bulkImportPersonas(args: Batch<BulkImportPersonaInput> & { readonly dryRun: false }): Promise<BulkImportPersonasResult>;
  async function bulkImportPersonas(
    args: (Batch<DryRunPersonaInput> & { readonly dryRun: true }) | (Batch<BulkImportPersonaInput> & { readonly dryRun: false }),
  ): Promise<readonly ImportAnswer[] | BulkImportPersonasResult> {
    const { db } = ctx;
    const { ownerId, collisions } = args;
    const owned = await loadOwnedPersonaCandidates(db, ownerId);
    if (args.dryRun) {
      const judged = judgeBatch({ owned, inputs: args.personas, identityOf: (pi) => identityFrom(pi, pi.artHash), collisions, newPersonaId: ctx.newPersonaId });
      return judged.map(({ identity, reused }): ImportAnswer => {
        const keys = [personaContentKey(identity)];
        if (reused === null) {
          return { reuse: null, keys };
        }
        return { reuse: owned.includes(reused.persona) ? "library" : "upload", keys };
      });
    }

    const avatarIds = args.personas.map((pi) => pi.avatarAssetId).filter((id): id is AssetId => id !== null);
    await ensureAvatarAssets(db, ownerId, avatarIds);
    const artHashes = await loadOwnedAssetHashes(db, ownerId, avatarIds);
    const artHashOf = (pi: BulkImportPersonaInput): string | null =>
      pi.avatarAssetId === null ? null : (artHashes.find((row) => row.id === pi.avatarAssetId)?.hash ?? null);
    const judged = judgeBatch({
      owned,
      inputs: args.personas,
      identityOf: (pi) => identityFrom(pi, artHashOf(pi)),
      collisions,
      newPersonaId: ctx.newPersonaId,
    });
    await insertMinted(ownerId, judged);
    return resultOf(judged);
  }
  return bulkImportPersonas;
}

function resultOf(judged: readonly Judged<BulkImportPersonaInput>[]): BulkImportPersonasResult {
  // `idByName` keys the INPUT's folded name (what a transcript's `user_name` says) to the row it resolved
  // to; the first input under a name wins, as the chat attribution map it feeds keeps one id per name.
  const idByName: Record<string, PersonaId> = {};
  // call-local record of the merged names for this run's result. Ends if it outlives the call.
  const mergedKeys = new Set<string>();
  let defaultPersonaId: PersonaId | null = null;
  for (const { input, key, reused, personaId } of judged) {
    if (reused?.kind === "merged") {
      mergedKeys.add(key);
    }
    idByName[key] ??= personaId;
    if (input.isDefault) {
      defaultPersonaId = personaId;
    }
  }
  return {
    personasCreated: judged.filter(({ minted }) => minted !== null).length,
    personasSkipped: judged.filter(({ reused }) => reused?.kind === "skipped").length,
    mergedKeys: [...mergedKeys],
    defaultPersonaId,
    idByName,
  };
}
