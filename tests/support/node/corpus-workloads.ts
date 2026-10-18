// Advance logical scheduling phases only after the native graph has joined its active work.
import { addAbortListener } from "node:events";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

const RECALL_WORKER_ADVANCE_MS = 2000;
const RECALL_WAIT_TIMEOUT_MS = 5000;

/** Settle the actual admitted IDs; failed or cancelled jobs never become successful corpus data. */
export async function settleCorpusWorkloads(
  root: Pick<ServerTestHarness, "timers" | "settleBackground" | "runAdmittedWorkload">,
  caller: Pick<CorpusCaller, "workloads">,
  started: readonly Awaited<ReturnType<CorpusCaller["workloads"]["start"]>>[],
): Promise<Awaited<ReturnType<CorpusCaller["workloads"]["list"]>>> {
  const deadline = AbortSignal.timeout(RECALL_WAIT_TIMEOUT_MS);
  const timeout = Promise.withResolvers<never>();
  using _cancellation = addAbortListener(deadline, () => timeout.reject(deadline.reason));
  await Promise.race([root.settleBackground(), timeout.promise]);
  if (root.runAdmittedWorkload !== undefined) {
    for (const workload of started) {
      await Promise.race([root.runAdmittedWorkload(workload.id, deadline), timeout.promise]);
    }
    const jobs = (await caller.workloads.list()).filter((job) => started.some((ref) => ref.id === job.id));
    if (jobs.length !== started.length || jobs.some((job) => job.status !== "succeeded")) {
      throw new Error("The selected native corpus workloads did not complete successfully", { cause: jobs });
    }
    return jobs;
  }
  for (;;) {
    root.timers.advance(RECALL_WORKER_ADVANCE_MS);
    // Fired native sleeps register their finite worker steps before this continuation joins them.
    await Promise.resolve();
    await Promise.race([root.settleBackground(), timeout.promise]);
    const jobs = (await caller.workloads.list()).filter((job) => started.some((ref) => ref.id === job.id));
    if (jobs.some((job) => job.status === "failed" || job.status === "cancelled")) {
      throw new Error("synthetic recall corpus workload failed", { cause: jobs });
    }
    if (jobs.length === started.length && jobs.every((job) => job.status === "succeeded")) {
      return jobs;
    }
  }
}
