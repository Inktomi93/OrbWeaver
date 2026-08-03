// domain/workloads — DI BUNDLE builder. The verb-facing `WorkloadServiceContext` is what start/cancel/
// retry/get/list close over (db + injected clock + id minter). The explicit interface lives in
// `contract/service.ts` (no `ReturnType<>` — `no-context-returntype`; an exported interface in this file
// would also trip `no-inline-types`); this is the BUILDER. The bundle is IDENTICAL to the deps the entry
// root supplies (no deps→context transform — like connection/stats), so the builder is the conventional
// pass-through seam. The per-dispatch `WorkloadRunnerContext` is NOT built here — the engine assembles it per
// claimed row from the `WorkloadRunnerDeps` (db + env hub + roleClients binder + settings reader).

import type { WorkloadServiceContext, WorkloadServiceDeps } from "./contract/service.ts";

export function createWorkloadServiceContext(deps: WorkloadServiceDeps): WorkloadServiceContext {
  return deps;
}
