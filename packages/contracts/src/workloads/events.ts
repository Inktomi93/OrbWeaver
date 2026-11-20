// `@orb/contracts/workloads` — the workload LIFECYCLE EVENT union + the failure shape it carries.
//
// IT HOMES HERE BECAUSE IT IS A WIRE SHAPE (AGENTS.md "Type homes and unions"). The events ride
// the multiplexed socket verbatim under `frame.event` (`@orb/contracts/stream`, the `workloads` room), which
// makes them a server↔client contract — a client must not hand-roll a narrow structural VIEW of a
// domain-internal type and cast the rest away.
//
// The DOM-free half of the workloads seam lives in this package (D117 (1)); `WorkloadContribution` itself
// cannot, because its `run` takes an `AbortSignal`. These are plain
// data shapes, and every producer stays inside the domain (`emitWorkloadEvent`).
//
// NO `*_EVENT_TYPES` BELT, deliberately. That suffix is the bus registry's marker for a bus
// with a producer-coverage gate + a client mapped-type total map (the chat/user/rpg invalidation seams). This
// union has neither shape of consumer: its client handler is a two-way split (a `progress` snapshot into a
// row-local buffer, everything else into ONE `workloads.list` invalidation), so a per-member map would be a
// table of identical rows. A future member is handled by that split with no site to update.

import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadKind, WorkloadStatus } from "./axes.ts";
import type { WorkloadProgress } from "./execution.ts";
import type { WorkloadResultByKind } from "./result.ts";

export interface WorkloadError {
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
 * `result` IS REQUIRED. An optional `unknown` property is inhabited by `undefined`, which makes tRPC's output
 * inference emit it as optional and a required declaration unsatisfiable by the client's own frame type. The
 * concrete per-kind types admit no `undefined`, so the wire says what the code does.
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
