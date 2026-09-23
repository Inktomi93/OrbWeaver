// `@orb/contracts/workloads` — the workload LIFECYCLE EVENT union + the failure shape it carries.
//
// IT HOMES HERE BECAUSE IT IS A WIRE SHAPE (AGENTS.md "Type homes and unions", and the precondition SSE-1 §14 decision 3 named
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
import type { WorkloadKind, WorkloadStatus } from "./axes.ts";
import type { WorkloadProgress } from "./execution.ts";
import type { WorkloadResultByKind } from "./result.ts";

/** Each arm has one owning producer plane: `runtime` (the engine dispatch catch or the engine's durable
 *  poison-row bridge), `cancelled` (the queued cancel verb or an in-flight abort), `worker_died` (the reaper only), and
 *  `dependency_failed` (the engine bridge over the DAG scheduler's durable terminalization). Persistence
 *  stays pure data access: it reports a moved row through an injected sink and never imports the bus. */
const WORKLOAD_ERROR_KINDS = ["runtime", "cancelled", "worker_died", "dependency_failed"] as const;
type WorkloadErrorKind = (typeof WORKLOAD_ERROR_KINDS)[number];

export interface WorkloadError {
  readonly kind: WorkloadErrorKind;
  readonly message: string;
}

/** Every event carries the row it belongs to (`emitWorkloadEvent` throws on an empty id — the room filters on
 *  it), its kind, and `at` = the INJECTED-clock epoch-ms. The replay ring's TTL is measured in that same
 *  event-time domain, never `Date.now()`. */
interface WorkloadEventRow {
  readonly workloadId: WorkloadId;
  readonly at: number;
}

interface WorkloadEventBase extends WorkloadEventRow {
  readonly kind: WorkloadKind;
}

/**
 * The SUCCESS arm, per kind. `kind` is the SECOND discriminant (under `type`) and `result` is that kind's
 * own terminal projection — the same `WorkloadResultByKind` correlation the contribution's `run` return, the
 * row projection (`WorkloadRowAnyKind`) and the client's renderer map already speak, now carried on the wire
 * instead of stopping at the domain door.
 *
 * SPELLED AS A MAPPED TYPE INDEXED BY ITSELF (§5.5, the `AnyWorkloadContribution` precedent), never a
 * hand-restated arm per kind: the distribution IS the totality pin, so a new `WorkloadKind` needs no edit
 * here and lands as a tsc error at `WorkloadResultByKind` — the one home that owns the pairing.
 *
 * `result` IS REQUIRED. It was `result?: unknown` because an `unknown` property is inhabited by `undefined`,
 * which made tRPC's output inference emit it as optional and a required declaration unsatisfiable by the
 * client's own frame type. The concrete per-kind types retire that reason (none of them admits `undefined`),
 * and every producer already emitted the field — so the wire now says what the code always did.
 */
type WorkloadSucceededEvent = {
  [K in WorkloadKind]: WorkloadEventRow & {
    readonly type: "succeeded";
    readonly kind: K;
    readonly result: WorkloadResultByKind[K];
  };
}[WorkloadKind];

export type WorkloadEvent =
  | (WorkloadEventBase & { readonly type: "started" })
  | (WorkloadEventBase & { readonly type: "progress"; readonly progress: WorkloadProgress })
  | (WorkloadEventBase & { readonly type: "status"; readonly status: WorkloadStatus })
  | WorkloadSucceededEvent
  | (WorkloadEventBase & { readonly type: "failed"; readonly error: WorkloadError })
  | (WorkloadEventBase & { readonly type: "cancelled" });
