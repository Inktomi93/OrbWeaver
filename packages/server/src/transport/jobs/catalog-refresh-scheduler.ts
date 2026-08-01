// The when-to-enqueue recurring driver for the OpenRouter model-catalog snapshot. The snapshot write is
// the refresh-model-catalog workload; this scheduler only decides when to enqueue one, so the run is
// observable + retryable in Settings → Workloads, and the single-active-per-kind partial-unique index
// makes a double-enqueue race impossible — the loser's insert throws DomainConflictError and we swallow it.
//
// Boundaries: the scheduler enters only the workloads front door — one feature, zero cross-feature
// composition. Everything is injected at entry/ — the driver constructs nothing.

import type { StartWorkloadInput, WorkloadStatus } from "@orb/contracts/workloads";
import { ACTIVE_WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import { DomainConflictError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { WorkloadService } from "#domain/workloads";
import { getLog } from "#foundation/observability";

const LOG_COMPONENT = "catalog-refresh-scheduler";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const DEFAULT_CHECK_INTERVAL_MS = MS_PER_HOUR;
/** Refresh cadence FLOOR after a success — once a day (item 5: now the born-in-DB admin floor
 *  AppSettings.catalogRefreshIntervalMs; entry injects a live getter, this is the fallback). */
const DEFAULT_REFRESH_EVERY_MS = MS_PER_DAY;
/** Retry cadence after a failure/cancel — within the hour, so a transient OR outage recovers fast. */
const RETRY_AFTER_MS = MS_PER_HOUR;

/** Does this status hold the single-active slot? Cast wider so .includes accepts the full WorkloadStatus
 *  union (no module-scope Set, which the assumes-single-replica gate flags). */
function isActiveStatus(status: WorkloadStatus): boolean {
  return (ACTIVE_WORKLOAD_STATUSES as readonly WorkloadStatus[]).includes(status);
}

const REFRESH_INPUT: StartWorkloadInput = { kind: "refresh-model-catalog", params: {} };

/** A timer seam (entry wires setInterval; tests pass a synchronous fake). */
type ScheduleOp = (fn: () => void, ms: number) => () => void;

export interface CatalogRefreshSchedulerDeps {
  readonly service: WorkloadService;
  /** Workload rows are enqueued with this owner (provenance; null = a pure system trigger). */
  readonly ownerId: UserId | null;
  readonly now: () => number;
  readonly scheduleInterval: ScheduleOp;
  readonly checkIntervalMs?: number;
  /** Live getter for the success-refresh cadence (item 5 — AppSettings.catalogRefreshIntervalMs). Read per
   *  check so an admin retune applies without a restart. Absent ⇒ the once-a-day floor. */
  readonly refreshEveryMs?: () => number;
}

/** One decision step: is a fresh catalog refresh due, and if so, enqueue it. Skips when an active row
 *  holds the slot or the newest terminal row is still within its cadence; swallows the single-active
 *  DomainConflictError (someone beat us — the goal). */
export async function runCatalogCheck(deps: CatalogRefreshSchedulerDeps): Promise<void> {
  const log = getLog().child({ component: LOG_COMPONENT });

  const rows = await deps.service.list({ caller: null, kind: "refresh-model-catalog", limit: 1 });
  const latest = rows[0];
  if (latest !== undefined) {
    if (isActiveStatus(latest.status)) {
      return;
    }
    const age = deps.now() - latest.updatedAt;
    const refreshEvery = deps.refreshEveryMs?.() ?? DEFAULT_REFRESH_EVERY_MS;
    const due = latest.status === "succeeded" ? refreshEvery : RETRY_AFTER_MS;
    if (age < due) {
      return;
    }
  }

  try {
    const { id } = await deps.service.start({
      input: REFRESH_INPUT,
      caller: null,
      mode: "bulk",
      ownerId: deps.ownerId,
    });
    log.info({ workloadId: id }, "catalog-refresh: enqueued refresh-model-catalog");
  } catch (err) {
    if (err instanceof DomainConflictError) {
      return;
    }
    throw err;
  }
}

/** Start the scheduler: one immediate boot check + the recurring decision tick on the injected timer.
 *  Returns the clear closure so entry's lifecycle layer can tear the timer down on shutdown. */
export function startCatalogRefreshScheduler(deps: CatalogRefreshSchedulerDeps): () => void {
  const log = getLog().child({ component: LOG_COMPONENT });
  const checkMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

  const safeCheck = (): void => {
    runCatalogCheck(deps).catch((err: unknown) => {
      log.error({ err }, "catalog-refresh: check failed (next tick retries)");
    });
  };

  safeCheck();
  return deps.scheduleInterval(safeCheck, checkMs);
}
