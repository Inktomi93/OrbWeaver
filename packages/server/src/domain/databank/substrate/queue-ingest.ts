// domain/databank/substrate/queue-ingest — the ONE guarded call site of the `enqueueIngest` injected op.
//
// WHY IT IS GUARDED (the orphan defect). Every producer writes the `documents` row FIRST and enqueues the
// derived-layer build SECOND, and the two are not one transaction — the enqueue crosses a domain boundary
// (workloads' own db writes, through an injected op) so it CANNOT join the canon write's batch. A rejecting
// enqueue therefore used to reject the whole producer verb while LEAVING the row behind: a document with no
// chunks and no workload, rendering as `Queued` on the library forever, under a "Couldn't save the document."
// toast that claimed the opposite of what happened. Rolling the document back instead is the wrong trade —
// it destroys canon (a paste the user cannot recover) to hide a derived-layer hiccup.
//
// So the failure is DATA: the document lands, the caller reports `ingest:'not-queued'`, and the un-indexed
// state is visible on both databank surfaces with `Reindex` as its one-click repair. The AUDIT row records
// which arm ran, so an operator can find every document a queue outage left un-indexed.
//
// This is not a swallow (the banned reflex): nothing is silenced — the throw becomes a typed field on the
// verb's own result, and it is logged at WARN with the document it belongs to.

import type { DocumentId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { QueuedIngest } from "../contract/results";
import type { DatabankContext } from "../contract/service";

/** Enqueue the derived-layer build for a freshly-written document. NEVER throws: a queue refusal comes back
 *  as `ingest:'not-queued'` so the canon write that already landed is reported honestly (see the header).
 *  Typed on the ONE op it uses, so the Principal-less portability slice reaches it too. */
export async function queueIngest(
  ctx: Pick<DatabankContext, "enqueueIngest">,
  args: { readonly documentId: DocumentId; readonly ownerId: UserId },
): Promise<QueuedIngest> {
  try {
    const { workloadId } = await ctx.enqueueIngest(args);
    return { ingest: "queued", workloadId };
  } catch (err) {
    getLog().warn(
      { err, documentId: args.documentId, ownerId: args.ownerId },
      "databank: the document was written but its ingest could not be queued — it is un-indexed until a reindex",
    );
    return { ingest: "not-queued", workloadId: null };
  }
}
