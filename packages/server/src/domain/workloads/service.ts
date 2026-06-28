// domain/workloads — COMPOSITION ROOT: wires the 5 verb factories over the verb-facing DI bundle. ZERO
// logic. The tRPC `workloads.*` router's delegation target for start/cancel/retry/get/list; the catalog
// scheduler also drives `list`/`start` through this. The ENGINE entry points (runWorkload/reaper/bus) are
// NOT verbs — they're separate front-door exports the worker driver calls; this service is the verb surface.

import { createWorkloadServiceContext } from "./context";
import type { WorkloadService, WorkloadServiceDeps } from "./contract/service";
import { createCancel } from "./verbs/cancel";
import { createGet } from "./verbs/get";
import { createList } from "./verbs/list";
import { createRetry } from "./verbs/retry";
import { createStart } from "./verbs/start";

export function createWorkloadService(deps: WorkloadServiceDeps): WorkloadService {
  const ctx = createWorkloadServiceContext(deps);
  return {
    ...createStart(ctx),
    ...createCancel(ctx),
    ...createRetry(ctx),
    ...createGet(ctx),
    ...createList(ctx),
  };
}
