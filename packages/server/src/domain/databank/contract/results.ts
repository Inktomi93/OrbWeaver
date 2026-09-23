// domain/databank/contract/results — the verb result shapes. `UploadResult` is the producer verbs' return
// (upload/createFromText/scrape all share it). `IngestRunResult` (the reindex accounting) is the cross-boundary
// shape owned by `@orb/contracts/databank`; consumers (the workload runner, the ingest subsystem) import it
// from there directly — one home, no re-export.

import type { DocumentListCursor, DocumentView, IngestOutcome } from "@orb/contracts/databank";
import type { DocumentId, WorkloadId } from "@orb/kit/ids";

/** The enqueue's two arms as `substrate/queue-ingest` reports them, plus the audit metadata each producer
 *  stamps on its own row. `workloadId` is null exactly when `ingest` is `not-queued`. */
export interface QueuedIngest {
  readonly ingest: IngestOutcome;
  readonly workloadId: WorkloadId | null;
}

/** The producer verbs' return. `outcome:'duplicate'` = the `(ownerId, importHash)` unique hit (the existing
 *  document is returned, ingest skipped — its chunks already exist / are healing anyway). `warning` surfaces a
 *  succeeded-but-empty extraction (a scanned image-only PDF; `charCount ≈ 0`) — DATA, not a throw. */
export interface UploadResult {
  readonly document: DocumentView;
  readonly outcome: "created" | "duplicate";
  readonly ingest: IngestOutcome;
  readonly warning?: "empty-extraction";
}

/** One page of `list`. `nextCursor` is the last row's `(updatedAt, id)` when a FULL page came back (more may
 *  remain below it), else `null` — the bank is exhausted, which is what the library pane's "Load more"
 *  disappears on. The `ListCharactersResult` / `ListInboxResult` page shape, so the client's paged-collection
 *  machine consumes all three identically. */
export interface ListDocumentsResult {
  readonly items: readonly DocumentView[];
  readonly nextCursor: DocumentListCursor | null;
  /** How many documents match the SAME lens this page is a window into — a real `COUNT`, never `items.length`.
   *  It is what retired the surfaces' `100+` reading: the band header and the home tile used to print a full
   *  first PAGE as the bank's size-floor because a page was the only number they had (side-eye 2026-08-08
   *  P2-d). A census is a different question from "how many rows this page happened to carry", and both
   *  surfaces print the census. */
  readonly totalCount: number;
}

/** The `{{databank}}` gather op's return. Never empty — an empty retrieval /
 *  bankless scope / budget-drops-everything all return `null` (the no-op contract, so the assembled turn is
 *  byte-identical to a non-databank deploy). `text` is the reading-order-restored chunks joined per §3;
 *  `hits` are id-only provenance refs (never re-rendered into the prompt); `tokensEstimated` uses the same
 *  `@orb/kit/tokens` estimator chat's budget pass uses, so accounting can't drift. */
export interface DatabankGatherResult {
  readonly text: string;
  readonly hits: readonly { readonly documentId: DocumentId; readonly chunkIdx: number; readonly score: number }[];
  readonly tokensEstimated: number;
}
