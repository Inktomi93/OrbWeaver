// domain/workloads — COMPOSITION ROOT: wires the 5 verb factories over the verb-facing DI bundle. ZERO
// logic. The tRPC `workloads.*` router's delegation target for start/cancel/retry/get/list; the catalog
// scheduler also drives `list`/`start` through this. The ENGINE entry points (runWorkload/reaper/bus) are
// NOT verbs — they're separate front-door exports the worker driver calls; this service is the verb surface.

import { createWorkloadServiceContext } from "./context";
import type { WorkloadService, WorkloadServiceDeps } from "./contract/service";
import { createCancel } from "./verbs/cancel";
import { createCreateSchedule } from "./verbs/create-schedule";
import { createDeleteSchedule } from "./verbs/delete-schedule";
import { createGet } from "./verbs/get";
import { createList } from "./verbs/list";
import { createListSchedules } from "./verbs/list-schedules";
import { createRetry } from "./verbs/retry";
import { createSetScheduleEnabled } from "./verbs/set-schedule-enabled";
import { createStart } from "./verbs/start";
import { createUpdateSchedule } from "./verbs/update-schedule";

export function createWorkloadService(deps: WorkloadServiceDeps): WorkloadService {
  const ctx = createWorkloadServiceContext(deps);
  return {
    ...createStart(ctx),
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
