// Advance logical scheduling phases only after the native graph has joined its active work.
import { addAbortListener } from "node:events";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type CorpusWorkloadRows = readonly Awaited<ReturnType<CorpusCaller["workloads"]["get"]>>[];

const RECALL_WORKER_ADVANCE_MS = 2000;
const RECALL_WAIT_TIMEOUT_MS = 5000;

function workloadSettlementFailure(message: string, requested: number, jobs: CorpusWorkloadRows): Error {
  const outcomes = jobs.map(({ kind, status, poison, error }) => ({ kind, status, poison, errorPresent: error !== null }));
  return new Error(`${message}: ${JSON.stringify({ requested, matched: jobs.length, outcomes })}`, { cause: jobs });
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
  await Promise.race([root.settleBackground(), timeout.promise]);
  if (root.runAdmittedWorkload !== undefined) {
    for (const workload of started) {
      await Promise.race([root.runAdmittedWorkload(workload.id, deadline), timeout.promise]);
    }
    const jobs = await Promise.all(started.map(({ id }) => caller.workloads.get({ id })));
    if (jobs.length !== started.length || jobs.some((job) => job.status !== "succeeded")) {
      throw workloadSettlementFailure("The selected native corpus workloads did not complete successfully", started.length, jobs);
    }
    return jobs;
  }
  for (;;) {
    root.timers.advance(RECALL_WORKER_ADVANCE_MS);
    // Fired native sleeps register their finite worker steps before this continuation joins them.
    await Promise.resolve();
    await Promise.race([root.settleBackground(), timeout.promise]);
    const jobs = await Promise.all(started.map(({ id }) => caller.workloads.get({ id })));
    if (jobs.some((job) => job.status === "failed" || job.status === "cancelled")) {
      throw workloadSettlementFailure("synthetic recall corpus workload failed", started.length, jobs);
    }
    if (jobs.length === started.length && jobs.every((job) => job.status === "succeeded")) {
      return jobs;
    }
  }
}
