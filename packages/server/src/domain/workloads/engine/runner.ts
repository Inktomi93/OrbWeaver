// domain/workloads/engine/runner — `runWorkload`: drive ONE claimed row end-to-end (claim → build the
// per-dispatch runner context → dispatch inside a detached trace span → stamp the terminal → emit the bus
// event). Every terminal stamp is status-guarded — a zombie whose row was already reaped writes nothing.

import type { WorkloadKind } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog, withRequestSpan } from "#foundation/observability";
import type { Runner } from "../contract/runner";
import type { WorkloadRunnerContext, WorkloadRunnerDeps } from "../contract/service";
import type { WorkloadError } from "../contract/workload-error";
import type { ParamsByKind } from "../contract/workload-params";
import type { WorkloadRowAnyKind } from "../contract/workload-row";
import type { ReportProgress } from "../contract/workload-state";
import { heartbeat, loadWorkloadStatus, markStarted, markTerminal } from "../persistence/queries";
import { RUNNERS } from "../substrate/dispatch";
import { emitWorkloadEvent } from "./progress-bus";

// Synthetic acting user for a scheduler/system-triggered row (`ownerId === null`); not a real `users` row.
const SYSTEM_OWNER_ID = castId<UserId>("system");

const DEFAULT_HEARTBEAT_MS = 5000;
const DEFAULT_CANCEL_POLL_MS = 5000;

const WORKLOAD_FAILED = "WORKLOAD_FAILED";

/**
 * The two-cast bridge — the ONE sanctioned escape where the static `{ [K]: Runner<K> }` guarantee meets the
 * runtime row. Indexing `RUNNERS` by the row's union-typed `kind` yields a union of runners TS can't call,
 * and the per-kind params correlation is lost across the union; both casts are contained HERE (do not spread).
 */
function dispatchAndRun(ctx: WorkloadRunnerContext, row: WorkloadRowAnyKind, report: ReportProgress, signal: AbortSignal): Promise<unknown> {
  const runner = RUNNERS[row.kind] as Runner<WorkloadKind>;
  return runner(ctx, row.params as ParamsByKind[WorkloadKind], report, signal);
}

/** Build the per-dispatch runner context — roleClients PRE-BOUND for the row's acting user (or the synthetic system id). */
async function buildRunnerContext(deps: WorkloadRunnerDeps, row: WorkloadRowAnyKind): Promise<WorkloadRunnerContext> {
  const userId: UserId = row.ownerId ?? SYSTEM_OWNER_ID;
  return {
    userId,
    ownerId: row.ownerId,
    roleClients: await deps.bindRoleClients(userId),
    loadUserSettings: () => deps.loadUserSettings(userId),
    env: deps.env,
    now: deps.now,
  };
}

/** Start the single-replica lease timers (heartbeat + DB cancel-poll); `<= 0` cadence DISABLES a timer (the
 *  deterministic test seam). Returns the handles for the `finally` cleanup. */
function startLeaseTimers(deps: WorkloadRunnerDeps, row: WorkloadRowAnyKind, controller: AbortController): ReturnType<typeof setInterval>[] {
  const timers: ReturnType<typeof setInterval>[] = [];
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const cancelPollMs = deps.cancelPollMs ?? DEFAULT_CANCEL_POLL_MS;
  if (heartbeatMs > 0) {
    timers.push(
      setInterval(() => {
        void heartbeat(deps.db, row.id, deps.now());
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
async function finishCancelled(deps: WorkloadRunnerDeps, row: WorkloadRowAnyKind, at: number): Promise<boolean> {
  const moved = await markTerminal(deps.db, { id: row.id, status: "cancelled", now: at });
  if (moved) {
    emitWorkloadEvent({ type: "cancelled", workloadId: row.id, kind: row.kind, at });
  }
  return moved;
}

/** Stamp the SUCCESS outcome: cancelled if aborted mid-run (the pin); else succeeded; else cancelling-pin;
 *  else a zombie (row already reaped) → nothing. */
async function finalizeSuccess(deps: WorkloadRunnerDeps, row: WorkloadRowAnyKind, args: { aborted: boolean; result: unknown }): Promise<void> {
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
async function finalizeFailure(deps: WorkloadRunnerDeps, row: WorkloadRowAnyKind, args: { aborted: boolean; err: unknown }): Promise<void> {
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
export async function runWorkload(deps: WorkloadRunnerDeps, row: WorkloadRowAnyKind, signal: AbortSignal): Promise<void> {
  // Idempotent claim: the loser of a two-worker race updates 0 rows → bail.
  if (!(await markStarted(deps.db, row.id, deps.now()))) {
    return;
  }
  emitWorkloadEvent({ type: "started", workloadId: row.id, kind: row.kind, at: deps.now() });

  const ctx = await buildRunnerContext(deps, row);

  const controller = new AbortController();
  const onIncomingAbort = (): void => controller.abort();
  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener("abort", onIncomingAbort, { once: true });
  }

  const report: ReportProgress = (progress): void => {
    void heartbeat(deps.db, row.id, deps.now());
    emitWorkloadEvent({
      type: "progress",
      workloadId: row.id,
      kind: row.kind,
      at: deps.now(),
      progress,
    });
  };

  const timers = startLeaseTimers(deps, row, controller);
  try {
    const result = await withRequestSpan(`workload:${row.id}`, "workload.run", { kind: row.kind }, () => dispatchAndRun(ctx, row, report, controller.signal));
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
