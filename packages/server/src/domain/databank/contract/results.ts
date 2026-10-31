// domain/databank/contract/results — the verb result shapes. `UploadResult` is the producer verbs' return
// (upload/createFromText/scrape all share it). `IngestRunResult` (the reindex accounting) is the cross-boundary
// shape owned by `@orb/contracts/databank`; consumers (the workload runner, the ingest subsystem) import it
// from there directly — one home, no re-export.

import type { IngestOutcome } from "@orb/contracts/databank";
import type { WorkloadId } from "@orb/kit/ids";

/** The enqueue's two arms as `substrate/queue-ingest` reports them, plus the audit metadata each producer
 *  stamps on its own row. `workloadId` is null exactly when `ingest` is `not-queued`. */
export interface QueuedIngest {
  readonly ingest: IngestOutcome;
  readonly workloadId: WorkloadId | null;
}

/** The `{{databank}}` gather op's return. Never empty — an empty retrieval /
 *  bankless scope / budget-drops-everything all return `null` (the no-op contract, so the assembled turn is
 *  byte-identical to a non-databank deploy). `text` is the reading-order-restored chunks joined per §3. */
export interface DatabankGatherResult {
  readonly text: string;
}

export type { ListDocumentsResult, UploadResult } from "@orb/contracts/databank";
