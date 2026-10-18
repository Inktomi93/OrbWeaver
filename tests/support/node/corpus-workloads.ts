// Advance logical scheduling phases only after the native graph has joined its active work.
import { addAbortListener } from "node:events";
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

function workloadSettlementFailure(
  message: string,
  requested: number,
  jobs: CorpusWorkloadRows | undefined,
  diagnostic?: {
    readonly timeout: unknown;
    readonly phase: (typeof WORKLOAD_SETTLEMENT_PHASES)[number];
    readonly index: number | null;
    readonly admitted: Parameters<typeof settleCorpusWorkloads>[2];
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
      ...(diagnostic === undefined ? {} : { phase: diagnostic.phase, index: diagnostic.index }),
    })}`,
    { cause: diagnostic === undefined ? jobs : { ...diagnostic, lastObserved: jobs } },
  );
}

/** Settle the actual admitted IDs; failed or cancelled jobs never become successful corpus data. */
export async function settleCorpusWorkloads(
  root: Pick<ServerTestHarness, "timers" | "settleBackground" | "runAdmittedWorkload">,
  caller: Pick<CorpusCaller, "workloads">,
  started: readonly Awaited<ReturnType<CorpusCaller["workloads"]["start"]>>[],
): Promise<CorpusWorkloadRows> {
  const deadline = AbortSignal.timeout(RECALL_WAIT_TIMEOUT_MS);
  const timeout = Promise.withResolvers<never>();
  using _cancellation = addAbortListener(deadline, () => timeout.reject(deadline.reason));
  let phase: (typeof WORKLOAD_SETTLEMENT_PHASES)[number] = WORKLOAD_SETTLEMENT_PHASES[0];
  let index: number | null = null;
  let lastObserved: CorpusWorkloadRows | undefined;
  try {
    getLog().info({ phase, requested: started.length, index, deadlineAborted: deadline.aborted }, "corpus workloads initial background entry");
    await Promise.race([root.settleBackground(), timeout.promise]);
    if (root.runAdmittedWorkload !== undefined) {
      for (const [selectedIndex, workload] of started.entries()) {
        phase = WORKLOAD_SETTLEMENT_PHASES[1];
        index = selectedIndex;
        getLog().info({ phase, requested: started.length, index, deadlineAborted: deadline.aborted }, "corpus workloads admitted entry");
        await Promise.race([root.runAdmittedWorkload(workload.id, deadline), timeout.promise]);
      }
      const jobs = await Promise.all(started.map(({ id }) => caller.workloads.get({ id })));
      lastObserved = jobs;
      if (jobs.length !== started.length || jobs.some((job) => job.status !== "succeeded")) {
        throw workloadSettlementFailure("The selected native corpus workloads did not complete successfully", started.length, jobs);
      }
      return jobs;
    }
    phase = WORKLOAD_SETTLEMENT_PHASES[2];
    for (;;) {
      root.timers.advance(RECALL_WORKER_ADVANCE_MS);
      // Fired native sleeps register their finite worker steps before this continuation joins them.
      await Promise.resolve();
      await Promise.race([root.settleBackground(), timeout.promise]);
      const jobs = await Promise.all(started.map(({ id }) => caller.workloads.get({ id })));
      lastObserved = jobs;
      if (jobs.some((job) => job.status === "failed" || job.status === "cancelled")) {
        throw workloadSettlementFailure("synthetic recall corpus workload failed", started.length, jobs);
      }
      if (jobs.length === started.length && jobs.every((job) => job.status === "succeeded")) {
        return jobs;
      }
    }
  } catch (error) {
    if (!ownsDeadlineFailure(deadline, error)) {
      throw error;
    }
    throw workloadSettlementFailure("The selected native corpus workloads timed out", started.length, lastObserved, {
      timeout: error,
      phase,
      index,
      admitted: started,
    });
  }
}
