// domain/workloads — COMPOSITION ROOT: wires the verb factories over the verb-facing DI bundle. ZERO
// logic. The tRPC `workloads.*` router's delegation target for start/estimate/cancel/retry/get/list; the catalog
// scheduler also drives `list`/`start` through this. The ENGINE entry points (runWorkload/reaper/bus) are
// NOT verbs — they're separate front-door exports the worker driver calls; this service is the verb surface.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { createWorkloadServiceContext } from "./context.ts";
import type { WorkloadService, WorkloadServiceDeps } from "./contract/service.ts";
import { createCancel } from "./verbs/cancel.ts";
import { createCreateSchedule } from "./verbs/create-schedule.ts";
import { createDeleteSchedule } from "./verbs/delete-schedule.ts";
import { createEstimateModelCalls } from "./verbs/estimate-model-calls.ts";
import { createGet } from "./verbs/get.ts";
import { createList } from "./verbs/list.ts";
import { createListSchedules } from "./verbs/list-schedules.ts";
import { createRetry } from "./verbs/retry.ts";
import { createSetScheduleEnabled } from "./verbs/set-schedule-enabled.ts";
import { createStart } from "./verbs/start.ts";
import { createUpdateSchedule } from "./verbs/update-schedule.ts";

export function createWorkloadService(input: DbAssemblyInput<WorkloadServiceDeps>): WorkloadService {
  const deps: WorkloadServiceDeps = { ...input, db: databaseForOwner(input.db) };
  const ctx = createWorkloadServiceContext(deps);
  return {
    ...createStart(ctx),
    ...createEstimateModelCalls(ctx),
    ...createCancel(ctx),
    ...createRetry(ctx),
    ...createGet(ctx),
    ...createList(ctx),
    // The schedule verbs (the TIME dimension) ride the same verb-facing context (owner-scoping + the id minter).
    ...createCreateSchedule(ctx),
    ...createUpdateSchedule(ctx),
    ...createDeleteSchedule(ctx),
    ...createSetScheduleEnabled(ctx),
    ...createListSchedules(ctx),
  };
}
