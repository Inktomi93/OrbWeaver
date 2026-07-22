// domain/databank/contract/results — the verb result shapes. `UploadResult` is the producer verbs' return
// (upload/createFromText/scrape all share it). `IngestRunResult` (the reindex accounting) is the cross-boundary
// shape owned by `@orb/contracts/databank`; consumers (the workload runner, the ingest subsystem) import it
// from there directly — one home, no re-export.

import type { DocumentView } from "@orb/contracts/databank";
import type { DocumentId } from "@orb/kit/ids";

/** The producer verbs' return. `outcome:'duplicate'` = the `(ownerId, importHash)` unique hit (the existing
 *  document is returned, ingest skipped — its chunks already exist / are healing anyway). `warning` surfaces a
 *  succeeded-but-empty extraction (a scanned image-only PDF; `charCount ≈ 0`) — DATA, not a throw. */
export interface UploadResult {
  readonly document: DocumentView;
  readonly outcome: "created" | "duplicate";
  readonly ingest: "queued" | "skipped";
  readonly warning?: "empty-extraction";
}

/** The `{{databank}}` gather op's return (DB6, databank-design/07 §2). Never empty — an empty retrieval /
 *  bankless scope / budget-drops-everything all return `null` (the no-op contract, so the assembled turn is
 *  byte-identical to a non-databank deploy). `text` is the reading-order-restored chunks joined per §3;
 *  `hits` are id-only provenance refs (never re-rendered into the prompt); `tokensEstimated` uses the same
 *  `@orb/kit/tokens` estimator chat's budget pass uses, so accounting can't drift. */
export interface DatabankGatherResult {
  readonly text: string;
  readonly hits: readonly { readonly documentId: DocumentId; readonly chunkIdx: number; readonly score: number }[];
  readonly tokensEstimated: number;
}
