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
import type { RestoreCharacterBookResult } from "#domain/import";
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

/** One successfully imported (or deduped) card. `created:false` = a byte-identical re-import: no new
 *  CHARACTER row — the card's overlay planes are still reconciled against the existing one (#1470). */
export interface ImportedCard {
  readonly filename: string | null;
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly importHash: string;
  /** The card planes this import deliberately did NOT assert, one operator-facing line each (the verb's
   *  `skippedOverlays`, #1598). Present even when empty. Today's one member: a re-uploaded card whose
   *  embedded lorebook was KEPT because the character already holds a primary book the owner may have
   *  edited — the route's JSON is where a caller learns that, instead of silently getting the old behavior. */
  readonly notes: readonly string[];
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

/** The card-only per-owner `ImportContext`, in ONE place: both card doors (the batch import and the #1598
 *  lorebook restore) compose the identical wiring, so a port that lands on one arm can never be missing from
 *  the other. */
function cardImportService(deps: Omit<ProfileImportDeps, "files">): ReturnType<typeof createImportService> {
  const { principal, character, assets, tag, worldInfo } = deps;
  return createImportService(
    buildImportContext({
      principal,
      character,
      storeAvatar: assets.store,
      attachCardTag: tag.attachCardTagByName,
      ...(worldInfo !== undefined
        ? { importLorebook: worldInfo.importLorebook, hasPrimaryBook: worldInfo.hasPrimaryBook, linkCarriedBooks: worldInfo.linkCarriedBooks }
        : {}),
    }),
  );
}

/** What the #1598 RESTORE door needs: the same card-import wiring, plus the ONE card file whose embedded
 *  lorebook the owner is asking to re-assert. `worldInfo` is REQUIRED here (unlike the batch import, whose
 *  card-only arm legitimately skips embedded books) — a restore with no lorebook write op could only refuse. */
export interface CardLorebookRestoreDeps extends Omit<ProfileImportDeps, "files" | "worldInfo"> {
  readonly worldInfo: ImportWorldInfoPort;
  readonly file: ImportFile;
}

/**
 * Re-assert one uploaded card file's embedded lorebook over the character those bytes imported as (#1598 —
 * the explicit, owner-asked-for half of the non-destructive re-upload). Never throws for a bad/unmatched
 * card: the verb returns the refusal the route renders.
 */
export async function runCardLorebookRestore(deps: CardLorebookRestoreDeps): Promise<RestoreCharacterBookResult> {
  const { file, ...wiring } = deps;
  return await cardImportService(wiring).restoreCharacterBook({
    card: { bytes: file.bytes, ...(file.filename !== undefined && { filename: file.filename }) },
  });
}

/**
 * Build the per-owner `ImportService` (with the entry-supplied character/assets ops) and import each card
 * file, isolating per-card failures. Returns the per-card outcome (imported/deduped vs failed).
 */
export async function runProfileImport(deps: ProfileImportDeps): Promise<ProfileImportResult> {
  const { files, ...wiring } = deps;

  const service = cardImportService(wiring);
  const imported: ImportedCard[] = [];
  const failed: FailedCard[] = [];

  for (const file of files) {
    const filename = file.filename ?? null;
    // @orb-waive caught-failure-ownership(err): bookkeeping — the failure is recorded into
    // `failed` (with message), the function's own return value; one bad card never aborts the batch. Ends
    // if `failed` stops being read by the caller.
    try {
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
        notes: result.skippedOverlays,
      });
    } catch (err) {
      failed.push({ filename, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { imported, failed };
}
