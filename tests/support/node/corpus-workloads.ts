// Native waiting yields only to I/O; the real worker schedule advances through the graph timer.
import { setTimeout as waitForIo } from "node:timers/promises";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

const RECALL_WORKER_ADVANCE_MS = 2000;
const RECALL_WAIT_INTERVAL_MS = 25;
const RECALL_WAIT_TIMEOUT_MS = 5000;

/** Settle the actual admitted IDs; failed or cancelled jobs never become successful corpus data. */
export async function settleCorpusWorkloads(
  root: Pick<ServerTestHarness, "timers">,
  caller: Pick<CorpusCaller, "workloads">,
  started: readonly Awaited<ReturnType<CorpusCaller["workloads"]["start"]>>[],
): Promise<Awaited<ReturnType<CorpusCaller["workloads"]["list"]>>> {
  const deadline = AbortSignal.timeout(RECALL_WAIT_TIMEOUT_MS);
  for (;;) {
    root.timers.advance(RECALL_WORKER_ADVANCE_MS);
    const jobs = (await caller.workloads.list()).filter((job) => started.some((ref) => ref.id === job.id));
    if (jobs.some((job) => job.status === "failed" || job.status === "cancelled")) {
      throw new Error("synthetic recall corpus workload failed", { cause: jobs });
    }
    if (jobs.length === started.length && jobs.every((job) => job.status === "succeeded")) {
      return jobs;
    }
    await waitForIo(RECALL_WAIT_INTERVAL_MS, undefined, { signal: deadline });
  }
}
