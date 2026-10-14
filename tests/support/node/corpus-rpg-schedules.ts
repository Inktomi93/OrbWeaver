// Schedule and queue variants are driven by the root's actual job timers, never a copied tick or worker.
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { MS_PER_MINUTE } from "@orb/kit/time";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { seedWorkload, seedWorkloadSchedule } from "./factories/workload.ts";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Schedule = Awaited<ReturnType<CorpusCaller["workloads"]["updateSchedule"]>>;
type Job = Awaited<ReturnType<CorpusCaller["workloads"]["get"]>>;
interface SeededCorpusRpgSchedules {
  readonly queued: Awaited<ReturnType<typeof seedWorkload>>;
  readonly beforeDue: Job;
  readonly cancellation: Awaited<ReturnType<CorpusCaller["workloads"]["cancel"]>>;
  readonly cancelled: Job;
  readonly schedule: Awaited<ReturnType<typeof seedWorkloadSchedule>>;
  readonly retuned: Schedule;
  readonly disabled: Schedule;
  readonly paused: readonly Schedule[];
  readonly pausedJobs: readonly Job[];
  readonly resumed: Schedule;
  readonly afterTick: readonly Schedule[];
  readonly admitted: readonly Job[];
  readonly completed: readonly Job[];
  readonly stopped: Schedule;
  readonly deletedSchedule: Awaited<ReturnType<typeof seedWorkloadSchedule>>;
  readonly finalSchedules: readonly Schedule[];
}

/** Preserve real future/cancelled and recurring lifecycle outputs without manufacturing queue states. */
export async function seedCorpusRpgSchedules(root: ServerTestHarness): Promise<SeededCorpusRpgSchedules> {
  await root.settleBackground();
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const scheduledAt = root.clock.now() + CADENCE_INTERVAL_MS.daily;
  const queued = await seedWorkload(root.db, root.services.workloads.start, {
    caller: principal,
    ownerId: root.ownerId,
    mode: "singular",
    input: { kind: "reconcile-stats", params: {} },
    scheduledAt,
  });
  const beforeDue = await caller.workloads.get({ id: queued.id });
  const cancellation = await caller.workloads.cancel({ id: queued.id });
  const cancelled = await caller.workloads.get({ id: queued.id });
  const schedule = await seedWorkloadSchedule(root.db, root.services.workloads.createSchedule, {
    caller: principal,
    ownerId: root.ownerId,
    mode: "singular",
    input: { kind: "reconcile-stats", params: {} },
    cadence: "daily",
  });
  const retuned = await caller.workloads.updateSchedule({ id: schedule.id, cadence: "hourly" });
  const disabled = await caller.workloads.setScheduleEnabled({ id: schedule.id, enabled: false });
  // Drain each graph tick before the next; one large jump would overlap a minute's decisions with later ticks.
  for (let elapsed = 0; elapsed < CADENCE_INTERVAL_MS.hourly; elapsed += MS_PER_MINUTE) {
    root.timers.advance(MS_PER_MINUTE);
    await root.settleBackground();
  }
  const paused = await caller.workloads.listSchedules({ kind: "reconcile-stats" });
  const pausedJobs = await caller.workloads.list({ kind: "reconcile-stats" });
  const resumed = await caller.workloads.setScheduleEnabled({ id: schedule.id, enabled: true });
  root.timers.advance(MS_PER_MINUTE);
  await root.settleBackground();
  const afterTick = await caller.workloads.listSchedules({ kind: "reconcile-stats" });
  const admitted = (await caller.workloads.list({ kind: "reconcile-stats" })).filter((job) => !pausedJobs.some((old) => old.id === job.id));
  if (admitted.length !== 1) {
    throw new Error("native recurring schedule did not admit exactly one new workload", { cause: admitted });
  }
  const completed = await settleCorpusWorkloads(root, caller, admitted);
  const stopped = await caller.workloads.setScheduleEnabled({ id: schedule.id, enabled: false });
  const deletedSchedule = await seedWorkloadSchedule(root.db, root.services.workloads.createSchedule, {
    caller: principal,
    ownerId: root.ownerId,
    mode: "singular",
    input: { kind: "reconcile-stats", params: {} },
    cadence: "daily",
    enabled: false,
  });
  await caller.workloads.deleteSchedule({ id: deletedSchedule.id });
  const finalSchedules = await caller.workloads.listSchedules({ kind: "reconcile-stats" });
  return {
    queued,
    beforeDue,
    cancellation,
    cancelled,
    schedule,
    retuned,
    disabled,
    paused,
    pausedJobs,
    resumed,
    afterTick,
    admitted,
    completed,
    stopped,
    deletedSchedule,
    finalSchedules,
  };
}
