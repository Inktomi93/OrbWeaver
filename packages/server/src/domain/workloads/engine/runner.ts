// domain/workloads/engine/runner — `runWorkload`: drive ONE claimed row end-to-end (claim → build the
// per-dispatch runner context → dispatch inside a detached trace span → stamp the terminal → emit the bus
// event). Every terminal stamp is status-guarded — a zombie whose row was already reaped writes nothing.
//
// PROGRESS has two destinations and ONE write path: every `report()` emits on the bus immediately (the live
// tail is cheap and in-process), while the DURABLE snapshot rides the heartbeat's own UPDATE, throttled to
// the lease cadence — so a run reporting per document costs the same db traffic as one that never reports,
// and a client that reconnects after the 60s replay ring expired still reads the last known progress.

import type {
  ReportProgress,
  WorkloadError,
  WorkloadEvent,
  WorkloadKind,
  WorkloadParamsByKind,
  WorkloadProgress,
  WorkloadRunContext,
} from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog, withRequestSpan } from "#foundation/observability";
import type { WorkloadContribution } from "../contract/contribution.ts";
import type { WorkloadRunnerDeps } from "../contract/service.ts";
import type { WorkloadRunnableRow } from "../contract/workload-row.ts";
import { heartbeat, loadWorkloadStatus, markStarted, markTerminal } from "../persistence/queries.ts";
import { emitWorkloadEvent } from "./progress-bus.ts";

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
  /** Queue another DB-backed monitor read on the same owned chain (the cancellation poll). */
  readonly monitor: (operation: () => Promise<void>) => void;
  /** Rejects on the first monitor/write failure and aborts the contribution through the caller's race. */
  readonly failure: Promise<never>;
  /** Own every queued operation before the row receives a terminal state. */
  readonly drain: () => Promise<void>;
}

/** Distinguish a lease-monitor failure from a cooperative abort. The monitor aborts the contribution to
 * stop more work, but that must terminalize as `failed`, not masquerade as a user cancellation. */
class LeaseFailure extends Error {
  readonly reason: unknown;

  constructor(reason: unknown) {
    super(reason instanceof Error ? reason.message : String(reason));
    this.name = "LeaseFailure";
    this.reason = reason;
  }
}

function createLeaseWriter(deps: WorkloadRunnerDeps, row: WorkloadRunnableRow, controller: AbortController): LeaseWriter {
  const cadenceMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  let latest: WorkloadProgress | undefined;
  let lastWriteAt: number | null = null;
  let tail = Promise.resolve();
  let idle = true;
  let failed = false;
  const { promise: failure, reject } = Promise.withResolvers<never>();
  const monitor = (operation: () => Promise<void>): void => {
    if (failed) {
      return;
    }
    let next: Promise<void>;
    // @orb-waive caught-failure-ownership(err): converts a SYNCHRONOUS throw into a rejected
    // `next` so the promise-chain contract below (`.then` with a reject handler that fails the lease) still
    // sees it — not a swallow, the error flows on as `next`'s own rejection.
    try {
      // Preserve report()'s existing contract: the first durable write starts synchronously. Later monitor
      // work chains behind it so heartbeat/cancel reads cannot reorder or escape the runner lifecycle.
      next = idle ? operation() : tail.then(operation);
    } catch (err) {
      next = Promise.reject(err);
    }
    idle = false;
    tail = next;
    // @orb-waive caught-failure-ownership(next): the reject handler classifies + owns the
    // failure — flips `failed`, aborts the controller, and rejects the `failure` promise with a
    // `LeaseFailure` that `runWorkload`'s `Promise.race` below observes. Never dropped.
    next.then(
      () => {
        if (tail === next) {
          idle = true;
        }
      },
      (err: unknown) => {
        if (!failed) {
          failed = true;
          controller.abort();
          reject(new LeaseFailure(err));
        }
      },
    );
  };
  const write = (at: number): void => {
    lastWriteAt = at;
    monitor(() => heartbeat(deps.db, row.id, at, latest));
  };
  return {
    report: (progress, at): void => {
      latest = progress;
      if (lastWriteAt === null || at - lastWriteAt >= cadenceMs) {
        write(at);
      }
    },
    tick: write,
    monitor,
    failure,
    drain: () => tail,
  };
}

/** The real interval, and the default for `WorkloadRunnerDeps.scheduleInterval` — the ONE ambient timer this
 *  engine owns. Everything else takes the seam, so a test ticks the lease without a global fake clock. */
const realScheduleInterval = (fn: () => void, ms: number): (() => void) => {
  const handle = setInterval(fn, ms);
  return (): void => {
    clearInterval(handle);
  };
};

/** Start the single-replica lease timers (heartbeat + DB cancel-poll); `<= 0` cadence DISABLES a timer (the
 *  deterministic test seam). Returns each timer's CANCEL for the `finally` cleanup. */
function startLeaseTimers(deps: WorkloadRunnerDeps, row: WorkloadRunnableRow, controller: AbortController, lease: LeaseWriter): (() => void)[] {
  const cancels: (() => void)[] = [];
  const scheduleInterval = deps.scheduleInterval ?? realScheduleInterval;
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const cancelPollMs = deps.cancelPollMs ?? DEFAULT_CANCEL_POLL_MS;
  if (heartbeatMs > 0) {
    cancels.push(
      scheduleInterval(() => {
        lease.tick(deps.now());
      }, heartbeatMs),
    );
  }
  if (cancelPollMs > 0) {
    cancels.push(
      scheduleInterval(() => {
        lease.monitor(async () => {
          const status = await loadWorkloadStatus(deps.db, row.id);
          if (status === "cancelling") {
            controller.abort();
          }
        });
      }, cancelPollMs),
    );
  }
  return cancels;
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
    // THE THIRD CAST OF THE DISPATCH BRIDGE (see `dispatchAndRun` — contained here too, do not spread).
    // `row.kind` and the value its contribution returned ARE correlated at runtime: the registry dispatched
    // exactly that kind's `run`, whose declared return is `WorkloadResultByKind[kind]`. The correlation is
    // simply not expressible once `kind` is the union — the succeeded arm is per-kind, and a
    // (union kind × union result) cross product satisfies none of its arms. The event's own type is what
    // holds every READER to the pairing; this is the one writer that stands where the union was erased.
    emitWorkloadEvent({
      type: "succeeded",
      workloadId: row.id,
      kind: row.kind,
      at: deps.now(),
      result: args.result,
    } as WorkloadEvent);
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

  // NOT `AbortSignal.any([signal, …])` (Node-26 program §4.12, deliberate KEEP): `signal` is the WORKER's
  // long-lived shutdown signal and this function runs once per dispatched ROW, so the link's lifetime is the
  // point — the `finally` below removes the listener when the row settles. A composite signal cannot be
  // un-linked, which would accumulate per-row dependents on a process-lifetime signal.
  const controller = new AbortController();
  const onIncomingAbort = (): void => controller.abort();
  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener("abort", onIncomingAbort, { once: true });
  }

  const lease = createLeaseWriter(deps, row, controller);
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

  const cancelTimers = startLeaseTimers(deps, row, controller, lease);
  const contribution = withRequestSpan(`workload:${row.id}`, "workload.run", { kind: row.kind }, () =>
    dispatchAndRun(deps, { ctx, row, report, signal: controller.signal }),
  );
  let leaseFailed = false;
  let outcome: { readonly kind: "success"; readonly result: unknown } | { readonly kind: "failure"; readonly err: unknown; readonly aborted: boolean };
  // @orb-waive caught-failure-ownership(err): fully classified below into `outcome` (LeaseFailure
  // vs contribution failure vs abort), consumed by `finalizeFailure`/`finalizeSuccess` further down — the
  // function docstring: "it never throws (every outcome is recorded on the row + the bus)."
  try {
    const result = await Promise.race([contribution, lease.failure]);
    outcome = { kind: "success", result };
  } catch (err) {
    const leaseFailure = err instanceof LeaseFailure;
    leaseFailed = leaseFailure;
    outcome = {
      kind: "failure",
      err: leaseFailure ? err.reason : err,
      aborted: !leaseFailure && controller.signal.aborted,
    };
  } finally {
    for (const cancel of cancelTimers) {
      cancel();
    }
    signal.removeEventListener("abort", onIncomingAbort);
  }
  if (leaseFailed) {
    // A lease failure aborts the contribution, but abort is cooperative. Do not stamp a terminal row while
    // the contribution is still unwinding (or still able to write); the runner owns that Promise to settlement.
    // @orb-waive caught-failure-ownership(contribution): `outcome` already carries the
    // classified failure from the LeaseFailure catch above — this only waits out the contribution's own
    // unwind so a terminal row isn't stamped mid-write; the contribution's own error handling (its own
    // caller/span) already owns reporting it.
    await contribution.catch(() => undefined);
  }
  // @orb-waive caught-failure-ownership(err): reclassifies `outcome` to failure, consumed by the
  // `finalizeFailure` branch immediately below — never dropped.
  try {
    await lease.drain();
  } catch (err) {
    outcome = { kind: "failure", err, aborted: false };
  }
  if (outcome.kind === "failure") {
    await finalizeFailure(deps, row, { aborted: outcome.aborted, err: outcome.err });
    return;
  }
  // @orb-waive caught-failure-ownership(err): a finalize-success failure is reclassified and
  // re-finalized as a failure via `finalizeFailure` on the next line — never dropped.
  try {
    await finalizeSuccess(deps, row, { aborted: controller.signal.aborted, result: outcome.result });
  } catch (err) {
    await finalizeFailure(deps, row, { aborted: controller.signal.aborted, err });
  }
}
