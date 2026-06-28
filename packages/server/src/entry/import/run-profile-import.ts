// entry/import/run-profile-import — the bulk-import COMPOSITION DRIVER (tiers/entry.md §layout "import/";
// DECISIONS-LEDGER §7 D3). It is the one place that constructs the PER-OWNER `ImportService` (import is
// `ImportContext.ownerId`-scoped, built per request — services.ts §"import — its service is PER-OWNER")
// and wires the THREE cross-feature injected ops the import verbs declared type-only (boundaries-are-
// physics: `domain/import` sideways-imports neither character nor assets — the runtime is supplied HERE):
//   • createCharacter  → `character.create` + the import-provenance stamp (PD-43, now landed) → map `.id`
//   • findByImportHash → `character.findByImportHash` → `ref?.characterId ?? null` (the re-import oracle)
//   • storeAsset       → `assets.store` (kind `avatar`; trusted import → `enforceMagic:false`) → `.assetId`
// The HTTP multipart upload route DELEGATES here (D3); a future `import-st` job runner is the second caller.
//
// The acting `Principal` is threaded through (the upload route resolved it) and used directly for the
// character/assets verbs (which owner-scope off `principal.userId`); `ImportContext.ownerId` is its id.
// Per-card `failures[] isolation`: one unreadable card is recorded and skipped, never aborting the batch
// (import.md §"The bulk driver" / §Idempotency — re-running is safe + resumable).
//
// SCOPE (4c W3 — the SillyTavern character-card path): this drives `importService.importCharacter` over a
// set of card files. The FULL profile driver (import.md §"bulk-loop unification": personas-first →
// collect-from-dir → per-character store→import → reconcileStats → emit) is NOT buildable in this slice and
// is deliberately NOT faked here:
//   • DEFER(promotion): `collectBundlesFromDir` (the loader subsystem) + `importChats`/`importPersonas`
//     are the chats/personas/loader waves (import.md §8-slot "loader/", §Verbs) — not built, so a profile
//     ZIP/dir is not collected here; callers pass already-extracted card files.
//   • DEFER(promotion): `reconcileStats` (stats rollup) + the `emit`/`enqueueBackfill` ops are wired into
//     the import CONTEXT only when the chats wave lands (import.md §"Injected into the import context");
//     this card slice's `ImportContext` carries none, so no post-import reconcile/emit runs here yet.

import type { CreateCharacterInput } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { ImportContext } from "#domain/import";
import { createImportService } from "#domain/import";

/** The `character` front-door slice the driver wires the import create/dedup ops to. */
export interface ImportCharacterPort {
  readonly create: (params: {
    readonly principal: Principal;
    readonly input: CreateCharacterInput;
    readonly provenance?: { readonly importedFrom: string | null; readonly importHash: string };
  }) => Promise<{ readonly id: CharacterId }>;
  readonly findByImportHash: (params: {
    readonly ownerId: UserId;
    readonly importHash: string;
  }) => Promise<{ readonly characterId: CharacterId } | null>;
}

/** The `assets` front-door slice the driver wires the import avatar-store op to. */
export interface ImportAssetPort {
  readonly store: (params: {
    readonly principal: Principal;
    readonly bytes: Uint8Array;
    readonly kind: "avatar";
    readonly mime: string;
    readonly enforceMagic?: boolean;
  }) => Promise<{ readonly assetId: AssetId }>;
}

/** One card file to import: the raw bytes + an optional source filename (provenance + name fallback). */
export interface ImportFile {
  readonly bytes: Uint8Array;
  readonly filename?: string;
}

export interface ProfileImportDeps {
  /** The acting caller (the upload route resolved it); owner-scopes the character/assets verbs. */
  readonly principal: Principal;
  readonly character: ImportCharacterPort;
  readonly assets: ImportAssetPort;
  readonly files: readonly ImportFile[];
}

/** One successfully imported (or deduped) card. `created:false` = a byte-identical re-import (no write). */
export interface ImportedCard {
  readonly filename: string | null;
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly importHash: string;
}

/** One card that failed to import (unreadable/invalid bytes) — recorded, not thrown (failures isolation). */
export interface FailedCard {
  readonly filename: string | null;
  readonly error: string;
}

export interface ProfileImportResult {
  readonly imported: readonly ImportedCard[];
  readonly failed: readonly FailedCard[];
}

/**
 * Build the per-owner `ImportService` (with the entry-supplied character/assets ops) and import each card
 * file, isolating per-card failures. Returns the per-card outcome (imported/deduped vs failed).
 */
export async function runProfileImport(deps: ProfileImportDeps): Promise<ProfileImportResult> {
  const { principal, character, assets, files } = deps;

  const ctx: ImportContext = {
    ownerId: principal.userId,
    createCharacter: async ({ input, importedFrom, importHash }) => {
      const detail = await character.create({
        principal,
        input,
        provenance: { importedFrom, importHash },
      });
      return { characterId: detail.id };
    },
    findByImportHash: async ({ importHash }) => {
      const ref = await character.findByImportHash({ ownerId: principal.userId, importHash });
      return ref?.characterId ?? null;
    },
    storeAsset: async ({ bytes, mime }) => {
      const stored = await assets.store({
        principal,
        bytes,
        kind: "avatar",
        mime,
        enforceMagic: false,
      });
      return stored.assetId;
    },
  };

  const service = createImportService(ctx);
  const imported: ImportedCard[] = [];
  const failed: FailedCard[] = [];

  for (const file of files) {
    const filename = file.filename ?? null;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: bulk import is intentionally sequential — each card is one atomic db.batch, with resumable per-card failures[] isolation (import.md §"bulk driver" / inv 8).
      const result = await service.importCharacter({
        card: {
          bytes: file.bytes,
          ...(file.filename !== undefined && { filename: file.filename }),
        },
      });
      imported.push({
        filename,
        characterId: result.characterId,
        created: result.created,
        importHash: result.importHash,
      });
    } catch (err) {
      failed.push({ filename, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { imported, failed };
}
