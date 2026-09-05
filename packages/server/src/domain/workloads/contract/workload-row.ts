// domain/workloads/contract/workload-row — the typed DB-row projection WorkloadRowAnyKind: per-kind
// narrowing of the Drizzle unknown JSON columns (params/result) against the kind discriminator. One place
// does the narrowing (persistence/toView), so no consumer casts the JSON blobs.
//
// The `poison` discriminant is the read path's HONESTY seam: a row whose stored params blob no longer parses
// against its kind's contribution schema (a renamed field, an invalid branded TypeID) used to VANISH from
// `list`/`get`. It now surfaces with `params: null, poison: true` — visibly broken and actionable — while
// the DISPATCH path takes the narrower `WorkloadRunnableRow`, so a poison row can never reach a run body.

import type {
  WorkloadError,
  WorkloadKind,
  WorkloadLane,
  WorkloadMode,
  WorkloadParamsByKind,
  WorkloadProgress,
  WorkloadResultByKind,
  WorkloadStatus,
} from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";

interface WorkloadRowBase {
  readonly id: WorkloadId;
  readonly status: WorkloadStatus;
  readonly mode: WorkloadMode;
  /** The EXECUTION lane (which worker loop runs it), stamped at enqueue from the owning contribution. */
  readonly lane: WorkloadLane;
  /** null for a scheduler/system row; SET NULL on user delete so the never-deleted audit row outlives the user. */
  readonly ownerId: UserId | null;
  /** Enforced by the scheduler: a non-empty dependsOn dispatches only once every dep succeeded; a dep hitting
   *  a non-success terminal fails the dependent with dependency_failed instead of running. */
  readonly dependsOn: readonly WorkloadId[] | null;
  readonly error: string | null;
  /** The last DURABLE progress snapshot (the reconnect truth — no subscription needed); null until reported. */
  readonly progress: WorkloadProgress | null;
  readonly scheduledAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

type WorkloadRow<K extends WorkloadKind> = WorkloadRowBase & {
  readonly kind: K;
  readonly params: WorkloadParamsByKind[K];
  readonly result: WorkloadResultByKind[K] | null;
  readonly poison: false;
};

/** A row whose stored params no longer parse against its kind's contribution schema — readable + cancel/
 *  retry-able, never dispatchable (the params it would run on are exactly what is broken). */
interface WorkloadPoisonRow extends WorkloadRowBase {
  readonly kind: WorkloadKind;
  readonly params: null;
  readonly result: unknown;
  readonly poison: true;
}

/** A row the engine may DISPATCH: known kind, params parsed against its contribution schema. */
export type WorkloadRunnableRow = { [K in WorkloadKind]: WorkloadRow<K> }[WorkloadKind];

/** Any row a READ surface may return. A row whose kind isn't in this build narrows to nothing at all (it
 *  cannot even be spelled) and stays filtered; a known kind with unparseable params surfaces as poison. */
export type WorkloadRowAnyKind = WorkloadRunnableRow | WorkloadPoisonRow;

/** A queued row terminalized while the persistence scan searched for runnable work. The engine emits the
 * canonical event only after the scan's guarded UPDATE has settled, keeping persistence bus-free. */
interface WorkloadQueueFailure {
  readonly workloadId: WorkloadId;
  readonly kind: WorkloadKind;
  readonly error: WorkloadError;
}

/** Called synchronously after a queued-row failure UPDATE settles; the engine supplies the bus publisher. */
export type WorkloadQueueFailureSink = (failure: WorkloadQueueFailure) => void;

/** What a DISPOSITION path needs about one in-flight row, and nothing else — read by BOTH the boot reclaim
 *  (#529) and the steady-state stale sweep (#1413). Deliberately NOT a `WorkloadRowAnyKind`: a disposition
 *  decides from the kind's declared resume policy + the row's respawn count + its lease, never from params,
 *  so it must also dispose of rows whose params no longer parse (poison) — which the view path surfaces with
 *  `params: null` — and rows of a kind this build no longer ships, which the view path narrows away
 *  ENTIRELY. That last case is why this shape is shared rather than boot-only: the sweep used to project
 *  through `toView`, so an unknown-kind row could never be terminalized and held its kind's single-active
 *  slot until a process restart. The column's declared type is the tuple, so a deploy-skew kind is a RUNTIME
 *  possibility only (the DDL's `workloads_kind_check` constrains writes, not rows already on disk); each
 *  disposition resolves it against the registry and treats an absent one as non-resumable. */
export interface WorkloadInFlightRow {
  readonly id: WorkloadId;
  readonly kind: WorkloadKind;
  /** How many times boot has already re-queued this row without the run reporting progress since. */
  readonly respawns: number;
  /** The lease column as it stands BEFORE any disposition — the reap sentence's observed lease age (#560).
   *  `markTerminal` overwrites it with the reap instant, so read here or lose it. */
  readonly updatedAt: number;
}
