// entry/import/run-profile-import — the bulk-import COMPOSITION DRIVER (core/Tier-5-Entry.md §layout "import/";
// DECISIONS-LEDGER §7 D3). It is the one place that constructs the PER-OWNER `ImportService` (import is
// `ImportContext.ownerId`-scoped, built per request — services.ts §"import — its service is PER-OWNER")
// and wires the SIX cross-feature injected ops the import verbs declared type-only (boundaries-are-
// physics: `domain/import` sideways-imports neither character, assets, nor tag — the runtime is supplied HERE):
//   • createCharacter  → `character.create` + the import-provenance stamp (PD-43, now landed) → map `.id`
//   • findByImportHash → `character.findByImportHash` → `ref?.characterId ?? null` (the byte-identical oracle)
//   • findByHandle     → `character.findByHandle` → `ref?.characterId ?? null` (PD-108 — the ALREADY-BUILT
//     seeder partial-rerun read, reused verbatim for the (ownerId, handle) re-import match)
//   • updateCharacter  → `character.update` (D28 edit-in-place) — the PD-108 handle-match write path
//   • storeAsset       → `assets.store` (kind `avatar`; trusted import → `enforceMagic:false`) → `.assetId`
//   • attachCardTag    → `tag.attachCardTagByName` (source:'card', status:'pending') — the `card.tags` carry
// The HTTP multipart upload route DELEGATES here (D3); a future `import-st` job runner is the second caller.
//
// The acting `Principal` is threaded through (the upload route resolved it) and used directly for the
// character/assets verbs (which owner-scope off `principal.userId`); `ImportContext.ownerId` is its id.
// Per-card `failures[] isolation`: one unreadable card is recorded and skipped, never aborting the batch
// (re-running is safe + resumable).
//
// SCOPE (4c W3 — the SillyTavern character-card path): this drives `importService.importCharacter` over a
// set of card files (the LIVE `POST /api/import` multipart path). It composes a CARD-ONLY `ImportContext`
// (no `profile` — RULING A): the chats/personas write ops + the PD-78 backfill/reconcile ops are wired only
// where they are needed — the portability `chat` descriptor's per-owner context (`entry/compose/portability`
// `buildOwnerImport`) and the bundle driver. `importChats`/`importPersonas` + `createBulkImportChats`/
// `createBulkImportPersonas` ARE built (the chat/persona Option-B write ops) and are wired there; the
// `collectBundlesFromDir` profile-DIR loader remains unbuilt (a ZIP bundle is the delivery path now, via
// `run-bundle-import` + the registry). Callers here pass already-extracted card files.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";
import { createImportService } from "#domain/import";
import type {
  ImportAssetPort,
  ImportCharacterPort,
  ImportTagPort,
  ImportWorldInfoPort,
} from "./build-import-context";
import { buildImportContext } from "./build-import-context";

/** One card file to import: the raw bytes + an optional source filename (provenance + name fallback). */
export interface ImportFile {
  readonly bytes: Uint8Array;
  readonly filename?: string;
}

export interface ProfileImportDeps {
  /** The acting caller (the upload route resolved it); owner-scopes the character/assets/tag verbs. */
  readonly principal: Principal;
  readonly character: ImportCharacterPort;
  readonly assets: ImportAssetPort;
  readonly tag: ImportTagPort;
  /** OPTIONAL (W1): when composed, embedded card lorebooks import to `world_books`/`character_books`. */
  readonly worldInfo?: ImportWorldInfoPort;
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
  const { principal, character, assets, tag, worldInfo, files } = deps;

  // The card-only wiring: no `profile` block (RULING A); `importLorebook` only when a world-info importer was
  // composed. Shared with the delivery/bundle path via `buildImportContext` (task #115 — one wiring seam).
  const ctx = buildImportContext({
    principal,
    character,
    storeAvatar: assets.store,
    attachCardTag: tag.attachCardTagByName,
    ...(worldInfo !== undefined ? { importLorebook: worldInfo.importLorebook } : {}),
  });

  const service = createImportService(ctx);
  const imported: ImportedCard[] = [];
  const failed: FailedCard[] = [];

  for (const file of files) {
    const filename = file.filename ?? null;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: bulk import is intentionally sequential — each card is one atomic write, with resumable per-card failures[] isolation.
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
