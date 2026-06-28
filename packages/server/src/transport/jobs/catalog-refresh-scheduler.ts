// transport/jobs/catalog-refresh-scheduler — the when-to-enqueue recurring DRIVER for the OpenRouter
// model-catalog snapshot. The snapshot WRITE is the `refresh-model-catalog` WORKLOAD (its runner calls
// `connection.refreshCatalog`); this scheduler only DECIDES WHEN to enqueue one. That indirection is the
// doctrine fit (transport.md movement table): bulk/recurring work is a workload, so the run is observable +
// retryable in Settings → Workloads, AND the single-active-per-kind partial-unique index makes a
// double-enqueue race impossible — the loser's insert throws `DomainConflictError` and we swallow it (the
// conflict IS the desired end state).
//
// BOUNDARIES: the scheduler enters ONLY the `workloads` front door (the injected `WorkloadService`:
// `list` + `start`) — ONE feature, zero cross-feature composition (it never imports `connection`; the
// workload runner does). The service, the owner id, the clock, and the interval timer are ALL injected at
// entry/ — the driver constructs nothing.
//
// DETERMINISM: `now` + `scheduleInterval` are injected (no ambient `Date.now`/`setInterval`). The testable
// core `runCatalogCheck` takes one decision and returns; the loop fires it at boot + on the injected timer.

import type { WorkloadStatus } from "@orb/contracts/workloads";
import { ACTIVE_WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import { DomainConflictError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { StartWorkloadInput, WorkloadService } from "#domain/workloads";
import { getLog } from "#foundation/observability";

const LOG_COMPONENT = "catalog-refresh-scheduler";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Hourly decision tick. */
const DEFAULT_CHECK_INTERVAL_MS = MS_PER_HOUR;
/** Refresh cadence after a success — once a day. */
const REFRESH_EVERY_MS = MS_PER_DAY;
/** Retry cadence after a failure/cancel — within the hour, so a transient OR outage recovers fast. */
const RETRY_AFTER_MS = MS_PER_HOUR;

/** Does this status hold the single-active slot? The named mirror of the partial-unique-index `WHERE` —
 *  the tuple is cast wider so `.includes` accepts the full `WorkloadStatus` union (no module-scope `Set`,
 *  which the `assumes-single-replica` gate flags). */
function isActiveStatus(status: WorkloadStatus): boolean {
  return (ACTIVE_WORKLOAD_STATUSES as readonly WorkloadStatus[]).includes(status);
}

/** The enqueue payload — `refresh-model-catalog` takes no params (the runner reads no per-user tunables). */
const REFRESH_INPUT: StartWorkloadInput = { kind: "refresh-model-catalog", params: {} };

/** A timer seam (entry wires `setInterval`; tests pass a synchronous fake). Returns a `clear` closure so the
 *  handle type never leaks. */
type ScheduleOp = (fn: () => void, ms: number) => () => void;

/** The DI bundle the scheduler closes over — the workloads service + owner + clock + timer, injected at
 *  entry/. */
export interface CatalogRefreshSchedulerDeps {
  /** The workloads front door (entry builds it via `createWorkloadService`). `list` reads the latest row;
   *  `start` enqueues. */
  readonly service: WorkloadService;
  /** Workload rows are enqueued with this owner (provenance; `null` = a pure system trigger). */
  readonly ownerId: UserId | null;
  /** The injected clock — the staleness comparison reads it (no ambient `Date.now`). */
  readonly now: () => number;
  /** The injected interval timer. */
  readonly scheduleInterval: ScheduleOp;
  readonly checkIntervalMs?: number;
}

/**
 * ONE decision step: is a fresh catalog refresh DUE, and if so, enqueue it. The testable core — a test
 * stubs `service.list`/`service.start` and a frozen clock and asserts `start` fires (or is skipped) per the
 * latest row's status + age. Skips when an active row holds the slot or the newest terminal row is still
 * within its cadence; swallows the single-active `DomainConflictError` (someone beat us — the goal).
 */
export async function runCatalogCheck(deps: CatalogRefreshSchedulerDeps): Promise<void> {
  const log = getLog().child({ component: LOG_COMPONENT });

  const rows = await deps.service.list({ kind: "refresh-model-catalog", limit: 1 });
  const latest = rows[0];
  if (latest !== undefined) {
    if (isActiveStatus(latest.status)) {
      // A queued/running/cancelling row already holds the slot — nothing to do.
      return;
    }
    const age = deps.now() - latest.updatedAt;
    const due = latest.status === "succeeded" ? REFRESH_EVERY_MS : RETRY_AFTER_MS;
    if (age < due) {
      return;
    }
  }

  try {
    const { id } = await deps.service.start({ input: REFRESH_INPUT, ownerId: deps.ownerId });
    log.info({ workloadId: id }, "catalog-refresh: enqueued refresh-model-catalog");
  } catch (err) {
    // Single-active-per-kind conflict = another replica's tick (or an admin clicking Run) beat us. That IS
    // the desired end state — swallow. Anything else propagates to the loop's error guard.
    if (err instanceof DomainConflictError) {
      return;
    }
    throw err;
  }
}

/**
 * Start the scheduler: one immediate boot check (a fresh install gets a snapshot as soon as the worker
 * polls) + the recurring decision tick on the injected timer. Returns the `clear` closure so entry's
 * lifecycle layer can tear the timer down on shutdown. A check error never takes the process down — it is
 * logged and the next tick retries.
 */
export function startCatalogRefreshScheduler(deps: CatalogRefreshSchedulerDeps): () => void {
  const log = getLog().child({ component: LOG_COMPONENT });
  const checkMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

  const safeCheck = (): void => {
    runCatalogCheck(deps).catch((err: unknown) => {
      log.error({ err }, "catalog-refresh: check failed (next tick retries)");
    });
  };

  safeCheck(); // boot check
  return deps.scheduleInterval(safeCheck, checkMs);
}
