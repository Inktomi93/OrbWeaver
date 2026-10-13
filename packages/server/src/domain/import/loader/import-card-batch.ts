import type { CardImportResult, FailedCard, ImportedCard } from "@orb/contracts/import";
import type { ImportCardBatchDeps } from "../contract/cards.ts";
/** A refused card is recorded individually; later cards still reach their owner-gated writes. */
export async function importCardBatch({ files, service }: ImportCardBatchDeps): Promise<CardImportResult> {
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
