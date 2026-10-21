import type { CardImportResult, FailedCard, ImportedCard } from "@orb/contracts/import";
import type { ImportCardBatchDeps } from "../contract/cards.ts";
/** A refused card is recorded individually; later cards still reach their owner-gated writes. */
export async function importCardBatch({ files, service }: ImportCardBatchDeps): Promise<CardImportResult> {
  const imported: ImportedCard[] = [];
  const failed: FailedCard[] = [];

  for (const file of files) {
    const filename = file.filename ?? null;
    // the catch pushes `{ filename, error }` onto `failed`, which
    // `importCardBatch` returns in `CardImportResult.failed`. Ends if `failed` stops being returned.
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
