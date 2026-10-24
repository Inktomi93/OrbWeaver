// Advance logical scheduling phases only after the native graph has joined its active work.
import { addAbortListener } from "node:events";
import { setImmediate } from "node:timers/promises";
import type { WorkloadEvent } from "@orb/contracts/workloads";
import { getLog } from "@orb/server/foundation/observability";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type CorpusWorkloadRows = readonly Awaited<ReturnType<CorpusCaller["workloads"]["get"]>>[];

const RECALL_WORKER_ADVANCE_MS = 2000;
const RECALL_WAIT_TIMEOUT_MS = 5000;
const WORKLOAD_SETTLEMENT_PHASES = ["initial-background", "admitted-job", "scheduled-worker-loop"] as const;

function ownsDeadlineFailure(deadline: AbortSignal, error: unknown): boolean {
  return deadline.aborted && error === deadline.reason;
}

// The event-time replay window can expire; absence never establishes that a workload did not start.
function snapshotWorkloadReplay(
  root: Pick<ServerTestHarness, "app">,
  started: Parameters<typeof settleCorpusWorkloads>[2],
): readonly {
  readonly observation: "unobserved" | "graph-replay";
  readonly kind: WorkloadEvent["kind"] | null;
  readonly lastType: WorkloadEvent["type"] | null;
  readonly startedPresent: boolean;
  readonly progressCount: number;
  readonly eventCount: number;
}[] {
  return started.map(({ id }) => {
    const events = root.app.workloadEvents.getRecentWorkloadEvents(id);
    const last = events.at(-1);
    return {
      observation: events.length === 0 ? "unobserved" : "graph-replay",
      kind: last?.kind ?? null,
      lastType: last?.type ?? null,
      startedPresent: events.some((event) => event.type === "started"),
      progressCount: events.reduce((count, event) => (event.type === "progress" ? count + 1 : count), 0),
      eventCount: events.length,
    };
  });
}

function workloadSettlementFailure(
  message: string,
  requested: number,
  jobs: CorpusWorkloadRows | undefined,
  diagnostic?: {
    readonly timeout?: unknown;
    readonly cancellation?: unknown;
    readonly phase: (typeof WORKLOAD_SETTLEMENT_PHASES)[number];
    readonly index: number | null;
    readonly admitted: Parameters<typeof settleCorpusWorkloads>[2];
    readonly replay: ReturnType<typeof snapshotWorkloadReplay>;
  },
): Error {
  const observation =
    jobs === undefined
      ? { observation: "none" }
      : {
          matched: jobs.length,
          outcomes: jobs.map(({ kind, status, poison, error }) => ({ kind, status, poison, errorPresent: error !== null })),
          ...(diagnostic === undefined ? {} : { observation: "last-observed" }),
        };
  return new Error(
    `${message}: ${JSON.stringify({
      requested,
      ...observation,
      ...(diagnostic === undefined ? {} : { phase: diagnostic.phase, index: diagnostic.index, replay: diagnostic.replay }),
    })}`,
    { cause: diagnostic === undefined ? jobs : { ...diagnostic, lastObserved: jobs } },
  );
}

function describeCancellation(
  signal: ServerTestHarness["workloadExecutionSignal"],
  error: unknown,
): { readonly message: string; readonly reason: Pick<NonNullable<Parameters<typeof workloadSettlementFailure>[3]>, "timeout" | "cancellation"> } {
  const timedOut = signal === undefined || (error instanceof DOMException && error.name === "TimeoutError");
  return {
    message: `The selected native corpus workloads ${timedOut ? "timed out" : "were cancelled"}`,
    reason: timedOut ? { timeout: error } : { cancellation: error },
  };
}

function assertSelectedWorkloadsSucceeded(requested: number, jobs: CorpusWorkloadRows): void {
  if (jobs.length !== requested || jobs.some((job) => job.status !== "succeeded")) {
    throw workloadSettlementFailure("The selected native corpus workloads did not complete successfully", requested, jobs);
  }
}

/** Settle the actual admitted IDs; failed or cancelled jobs never become successful corpus data. */
export async function settleCorpusWorkloads(
  root: Pick<ServerTestHarness, "app" | "timers" | "settleBackground" | "runAdmittedWorkload" | "workloadExecutionSignal">,
  caller: Pick<CorpusCaller, "workloads">,
  started: readonly Awaited<ReturnType<CorpusCaller["workloads"]["start"]>>[],
): Promise<CorpusWorkloadRows> {
  const deadline = root.workloadExecutionSignal ?? AbortSignal.timeout(RECALL_WAIT_TIMEOUT_MS);
  let phase: (typeof WORKLOAD_SETTLEMENT_PHASES)[number] = WORKLOAD_SETTLEMENT_PHASES[0];
  let index: number | null = null;
  let lastObserved: CorpusWorkloadRows | undefined;
  try {
    deadline.throwIfAborted();
    const timeout = Promise.withResolvers<never>();
    using _cancellation = addAbortListener(deadline, () => timeout.reject(deadline.reason));
    getLog().info({ phase, requested: started.length, index, deadlineAborted: deadline.aborted }, "corpus workloads initial background entry");
    await Promise.race([Promise.resolve().then(root.settleBackground), timeout.promise]);
    deadline.throwIfAborted();
    const runAdmittedWorkload = root.runAdmittedWorkload;
    if (runAdmittedWorkload !== undefined) {
      for (const [selectedIndex, workload] of started.entries()) {
        deadline.throwIfAborted();
        phase = WORKLOAD_SETTLEMENT_PHASES[1];
        index = selectedIndex;
        getLog().info({ phase, requested: started.length, index, deadlineAborted: deadline.aborted }, "corpus workloads admitted entry");
        await Promise.race([Promise.resolve().then(() => runAdmittedWorkload(workload.id, deadline)), timeout.promise]);
        deadline.throwIfAborted();
      }
      deadline.throwIfAborted();
      const jobs = await Promise.all(started.map(({ id }) => caller.workloads.get({ id })));
      deadline.throwIfAborted();
      lastObserved = jobs;
      assertSelectedWorkloadsSucceeded(started.length, jobs);
      return jobs;
    }
    phase = WORKLOAD_SETTLEMENT_PHASES[2];
    for (;;) {
      deadline.throwIfAborted();
      root.timers.advance(RECALL_WORKER_ADVANCE_MS);
      // Fired native sleeps register their finite worker steps before this continuation joins them.
      await Promise.resolve();
      await Promise.race([Promise.resolve().then(root.settleBackground), timeout.promise]);
      deadline.throwIfAborted();
      const jobs = await Promise.all(started.map(({ id }) => caller.workloads.get({ id })));
      deadline.throwIfAborted();
      lastObserved = jobs;
      if (jobs.some((job) => job.status === "failed" || job.status === "cancelled")) {
        throw workloadSettlementFailure("synthetic recall corpus workload failed", started.length, jobs);
      }
      if (jobs.length === started.length && jobs.every((job) => job.status === "succeeded")) {
        return jobs;
      }
      // Every step above can settle on microtasks alone, so a row that never settles would starve the deadline's timer.
      await setImmediate();
    }
  } catch (error) {
    if (!ownsDeadlineFailure(deadline, error)) {
      throw error;
    }
    const { message, reason } = describeCancellation(root.workloadExecutionSignal, error);
    throw workloadSettlementFailure(message, started.length, lastObserved, {
      ...reason,
      phase,
      index,
      admitted: started,
      replay: snapshotWorkloadReplay(root, started),
    });
  }
}
