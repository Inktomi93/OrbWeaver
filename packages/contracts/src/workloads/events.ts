// `@orb/contracts/workloads` — the workload LIFECYCLE EVENT union + the failure shape it carries.
//
// IT HOMES HERE BECAUSE IT IS A WIRE SHAPE (constitution §0.2, and the precondition SSE-1 §14 decision 3 named
// for stage S5). It started at `domain/workloads/contract/workload-events.ts`, which was honest while the only
// reader was the server's own `workloads.subscribe` generator: the client hook could not import it, so it
// hand-rolled a narrow structural VIEW of the two fields it read and cast the rest away. Now the events ride
// the multiplexed socket verbatim under `frame.event` (`@orb/contracts/stream`, the `workloads` room), which
// makes them a server↔client contract — and the client's local shadow copy is deleted with the move.
//
// The DOM-free half of the workloads seam lives in this package (D117 (1)); `WorkloadContribution` itself
// still cannot, because its `run` takes an `AbortSignal`. Nothing about that changed here: these are plain
// data shapes, and every producer stays inside the domain (`emitWorkloadEvent`).
//
// NO `*_EVENT_TYPES` BELT, deliberately. That suffix is the `bus-definition-belts` gate's marker for a bus
// with a producer-coverage gate + a client mapped-type total map (the chat/user/rpg invalidation seams). This
// union has neither shape of consumer: its client handler is a two-way split (a `progress` snapshot into a
// row-local buffer, everything else into ONE `workloads.list` invalidation), so a per-member map would be a
// table of identical rows. A future member is handled by that split with no site to update.

import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadKind, WorkloadStatus } from "./axes";
import type { WorkloadProgress } from "./execution";

/** Each arm has exactly ONE producing site: `runtime` (the engine dispatch catch), `cancelled` (an abort
 *  observed), `worker_died` (the reaper only), `dependency_failed` (the DAG scheduler predicate, which fails
 *  the dependent in place with no bus event — persistence is pure data access). */
const WORKLOAD_ERROR_KINDS = ["runtime", "cancelled", "worker_died", "dependency_failed"] as const;
type WorkloadErrorKind = (typeof WORKLOAD_ERROR_KINDS)[number];

export interface WorkloadError {
  readonly kind: WorkloadErrorKind;
  readonly message: string;
}

/** Every event carries the row it belongs to (`emitWorkloadEvent` throws on an empty id — the room filters on
 *  it), its kind, and `at` = the INJECTED-clock epoch-ms. The replay ring's TTL is measured in that same
 *  event-time domain, never `Date.now()`. */
interface WorkloadEventBase {
  readonly workloadId: WorkloadId;
  readonly kind: WorkloadKind;
  readonly at: number;
}

export type WorkloadEvent =
  | (WorkloadEventBase & { readonly type: "started" })
  | (WorkloadEventBase & { readonly type: "progress"; readonly progress: WorkloadProgress })
  | (WorkloadEventBase & { readonly type: "status"; readonly status: WorkloadStatus })
  // `result` is OPTIONAL because that is what the wire actually says: an `unknown`-typed property serializes
  // to `unknown | undefined` (tRPC's output inference makes it optional), so a REQUIRED declaration here would
  // be a shape the client's own frame type could never satisfy. Every producer emits it; only the type is
  // open — the per-kind result shapes are `WorkloadResultByKind`, resolved by the reader that knows the kind.
  | (WorkloadEventBase & { readonly type: "succeeded"; readonly result?: unknown })
  | (WorkloadEventBase & { readonly type: "failed"; readonly error: WorkloadError })
  | (WorkloadEventBase & { readonly type: "cancelled" });
