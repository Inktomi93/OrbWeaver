// The bulk-import composition driver: the one place that constructs the per-owner `ImportService` and
// wires the cross-feature injected ops the import verbs declared type-only (domain/import sideways-imports
// neither character, assets, nor tag — the runtime is supplied here). The HTTP multipart upload route
// delegates here; a future job runner is the second caller.
//
// The acting Principal is threaded through and used directly for the character/assets verbs (which
// owner-scope off principal.userId). Per-card failure isolation: one unreadable card is recorded and
// skipped, never aborting the batch.
//
// This composes a card-only ImportContext (no `profile`) — the chats/personas write ops are wired only
// where needed (the portability chat descriptor + the bundle driver). Callers here pass already-extracted
// card files; the on-disk ST profile-DIRECTORY delivery path (personas + chats included) is its sibling
// `run-profile-dir-import.ts` (driven by the `import-st` workload), and a zip bundle is the third path.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";
import { createImportService } from "#domain/import";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort, ImportWorldInfoPort } from "./build-import-context.ts";
import { buildImportContext } from "./build-import-context.ts";

/** One card file to import: the raw bytes + an optional source filename (provenance + name fallback). */
export interface ImportFile {
  readonly bytes: Uint8Array;
  readonly filename?: string;
}

export interface ProfileImportDeps {
  readonly principal: Principal;
  readonly character: ImportCharacterPort;
  readonly assets: ImportAssetPort;
  readonly tag: ImportTagPort;
  /** When composed, embedded card lorebooks import to world_books/character_books. */
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

  const ctx = buildImportContext({
    principal,
    character,
    storeAvatar: assets.store,
    attachCardTag: tag.attachCardTagByName,
    ...(worldInfo !== undefined ? { importLorebook: worldInfo.importLorebook, linkCarriedBooks: worldInfo.linkCarriedBooks } : {}),
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
