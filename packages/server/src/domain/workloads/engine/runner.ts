// domain/workloads/engine/runner — `runWorkload`: drive ONE claimed row end-to-end (claim → build the
// per-dispatch runner context → dispatch inside a detached trace span → stamp the terminal → emit the bus
// event). Every terminal stamp is status-guarded — a zombie whose row was already reaped writes nothing.
//
// PROGRESS has two destinations and ONE write path: every `report()` emits on the bus immediately (the live
// tail is cheap and in-process), while the DURABLE snapshot rides the heartbeat's own UPDATE, throttled to
// the lease cadence — so a run reporting per document costs the same db traffic as one that never reports,
// and a client that reconnects after the 60s replay ring expired still reads the last known progress.

import type { ReportProgress, WorkloadError, WorkloadKind, WorkloadParamsByKind, WorkloadProgress, WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog, withRequestSpan } from "#foundation/observability";
import type { WorkloadContribution } from "../contract/contribution";
import type { WorkloadRunnerDeps } from "../contract/service";
import type { WorkloadRunnableRow } from "../contract/workload-row";
import { heartbeat, loadWorkloadStatus, markStarted, markTerminal } from "../persistence/queries";
import { emitWorkloadEvent } from "./progress-bus";

// Synthetic acting user for a scheduler/system-triggered row (`ownerId === null`); not a real `users` row.
const SYSTEM_OWNER_ID = castId<UserId>("system");

const DEFAULT_HEARTBEAT_MS = 5000;
const DEFAULT_CANCEL_POLL_MS = 5000;

const WORKLOAD_FAILED = "WORKLOAD_FAILED";

/**
 * The two-cast bridge — the ONE sanctioned escape where the injected `{ [K]: WorkloadContribution<K> }`
 * guarantee meets the runtime row. Indexing the registry by the row's union-typed `kind` yields a union of
 * run bodies TS can't call, and the per-kind params correlation is lost across the union; both casts are
 * contained HERE (do not spread).
 */
function dispatchAndRun(
  deps: WorkloadRunnerDeps,
  args: { ctx: WorkloadRunContext; row: WorkloadRunnableRow; report: ReportProgress; signal: AbortSignal },
): Promise<unknown> {
  const contribution = deps.contributions[args.row.kind] as WorkloadContribution<WorkloadKind>;
  return contribution.run(args.ctx, args.row.params as WorkloadParamsByKind[WorkloadKind], args.report, args.signal);
}

/** Build the per-dispatch run context — identity + clock ONLY. Anything else a job needs is a dep of its
 *  owning domain's contribution factory, closed over at compose (never a shared per-dispatch bundle). */
function buildRunContext(deps: WorkloadRunnerDeps, row: WorkloadRunnableRow): WorkloadRunContext {
  const userId: UserId = row.ownerId ?? SYSTEM_OWNER_ID;
  return { userId, ownerId: row.ownerId, now: deps.now };
}

/**
 * The lease WRITE: one throttled UPDATE carrying both the heartbeat instant and the latest reported progress.
 * Every progress destination funnels through here — `report()` calls it at most once per heartbeat cadence,
 * and the heartbeat timer calls it on the same cadence with whatever the run last reported.
 */
interface LeaseWriter {
  /** Record a snapshot + write it if the cadence has elapsed (a cadence of `<= 0` writes every time — the
   *  deterministic test seam, matching the disabled-timer convention). */
  readonly report: (progress: WorkloadProgress, at: number) => void;
  /** The timer arm: write the lease unconditionally, carrying the latest snapshot (if any). */
  readonly tick: (at: number) => void;
}

function createLeaseWriter(deps: WorkloadRunnerDeps, row: WorkloadRunnableRow): LeaseWriter {
  const cadenceMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  let latest: WorkloadProgress | undefined;
  let lastWriteAt: number | null = null;
  const write = (at: number): void => {
    lastWriteAt = at;
    void heartbeat(deps.db, row.id, at, latest);
  };
  return {
    report: (progress, at): void => {
      latest = progress;
      if (lastWriteAt === null || at - lastWriteAt >= cadenceMs) {
        write(at);
      }
    },
    tick: write,
  };
}

/** Start the single-replica lease timers (heartbeat + DB cancel-poll); `<= 0` cadence DISABLES a timer (the
 *  deterministic test seam). Returns the handles for the `finally` cleanup. */
function startLeaseTimers(
  deps: WorkloadRunnerDeps,
  row: WorkloadRunnableRow,
  controller: AbortController,
  lease: LeaseWriter,
): ReturnType<typeof setInterval>[] {
  const timers: ReturnType<typeof setInterval>[] = [];
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const cancelPollMs = deps.cancelPollMs ?? DEFAULT_CANCEL_POLL_MS;
  if (heartbeatMs > 0) {
    timers.push(
      setInterval(() => {
        lease.tick(deps.now());
      }, heartbeatMs),
    );
  }
  if (cancelPollMs > 0) {
    timers.push(
      setInterval(() => {
        void (async (): Promise<void> => {
          const status = await loadWorkloadStatus(deps.db, row.id);
          if (status === "cancelling") {
            controller.abort();
          }
        })();
      }, cancelPollMs),
    );
  }
  return timers;
}

/** Pin a (running|cancelling) row to `cancelled` + emit. Returns whether it actually moved (false ⇒ already
 *  terminal — a zombie; the caller writes nothing more). */
async function finishCancelled(deps: WorkloadRunnerDeps, row: WorkloadRunnableRow, at: number): Promise<boolean> {
  const moved = await markTerminal(deps.db, { id: row.id, status: "cancelled", now: at });
  if (moved) {
    emitWorkloadEvent({ type: "cancelled", workloadId: row.id, kind: row.kind, at });
  }
  return moved;
}

/** Stamp the SUCCESS outcome: cancelled if aborted mid-run (the pin); else succeeded; else cancelling-pin;
 *  else a zombie (row already reaped) → nothing. */
async function finalizeSuccess(deps: WorkloadRunnerDeps, row: WorkloadRunnableRow, args: { aborted: boolean; result: unknown }): Promise<void> {
  if (args.aborted) {
    await finishCancelled(deps, row, deps.now());
    return;
  }
  const moved = await markTerminal(deps.db, {
    id: row.id,
    status: "succeeded",
    result: args.result,
    now: deps.now(),
  });
  if (moved) {
    emitWorkloadEvent({
      type: "succeeded",
      workloadId: row.id,
      kind: row.kind,
      at: deps.now(),
      result: args.result,
    });
    return;
  }
  // succeeded didn't move (row not `running`): pin cancelling→cancelled, or it was already reaped (zombie).
  if (!(await finishCancelled(deps, row, deps.now()))) {
    getLog().warn({ workloadId: row.id }, "workloads: run finished but row already terminal (reaped)");
  }
}

/** Stamp the FAILURE outcome: cancelled if the throw was the abort firing; else failed (runtime). */
async function finalizeFailure(deps: WorkloadRunnerDeps, row: WorkloadRunnableRow, args: { aborted: boolean; err: unknown }): Promise<void> {
  if (args.aborted) {
    await finishCancelled(deps, row, deps.now());
    return;
  }
  const message = args.err instanceof Error ? args.err.message : String(args.err);
  const error: WorkloadError = { kind: "runtime", message };
  const moved = await markTerminal(deps.db, {
    id: row.id,
    status: "failed",
    error: message,
    now: deps.now(),
  });
  if (moved) {
    emitWorkloadEvent({
      type: "failed",
      workloadId: row.id,
      kind: row.kind,
      at: deps.now(),
      error,
    });
    // PD-113: the D1 audit-surface condition — a terminal runtime failure leaves an audit row, not just
    // pino + the failed row. Best-effort (logAudit suppress-and-drop); `ownerId` null = system-triggered.
    // PD-113: a terminal runtime failure leaves an audit row, not just pino + the failed row.
    await deps.audit(
      {
        actorUserId: row.ownerId,
        action: WORKLOAD_FAILED,
        entityType: "workload",
        entityId: row.id,
        metadata: { kind: row.kind, error: message },
      },
      deps.now(),
    );
  }
}

/**
 * Claim + run one row to a terminal state. Returns when the row is terminal (or the claim was lost). The
 * worker calls this per dispatched row; it never throws (every outcome is recorded on the row + the bus).
 */
export async function runWorkload(deps: WorkloadRunnerDeps, row: WorkloadRunnableRow, signal: AbortSignal): Promise<void> {
  // Idempotent claim: the loser of a two-worker race updates 0 rows → bail.
  if (!(await markStarted(deps.db, row.id, deps.now()))) {
    return;
  }
  emitWorkloadEvent({ type: "started", workloadId: row.id, kind: row.kind, at: deps.now() });

  const ctx = buildRunContext(deps, row);

  const controller = new AbortController();
  const onIncomingAbort = (): void => controller.abort();
  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener("abort", onIncomingAbort, { once: true });
  }

  const lease = createLeaseWriter(deps, row);
  const report: ReportProgress = (progress): void => {
    const at = deps.now();
    // The durable half — throttled to the lease cadence, piggybacked on the heartbeat's own UPDATE.
    lease.report(progress, at);
    emitWorkloadEvent({
      type: "progress",
      workloadId: row.id,
      kind: row.kind,
      at,
      progress,
    });
  };

  const timers = startLeaseTimers(deps, row, controller, lease);
  try {
    const result = await withRequestSpan(`workload:${row.id}`, "workload.run", { kind: row.kind }, () =>
      dispatchAndRun(deps, { ctx, row, report, signal: controller.signal }),
    );
    await finalizeSuccess(deps, row, { aborted: controller.signal.aborted, result });
  } catch (err) {
    await finalizeFailure(deps, row, { aborted: controller.signal.aborted, err });
  } finally {
    for (const timer of timers) {
      clearInterval(timer);
    }
    signal.removeEventListener("abort", onIncomingAbort);
  }
}
