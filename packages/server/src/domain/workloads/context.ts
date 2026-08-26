// domain/workloads — DI BUNDLE builder. The verb-facing `WorkloadServiceContext` is what start/cancel/
// retry/get/list close over (db + injected clock + id minter). The explicit interface lives in
// `contract/service.ts` (no `ReturnType<>` — `no-context-returntype`; an exported interface in this file
// would also trip `no-inline-types`); this is the BUILDER. The per-dispatch `WorkloadRunnerContext` is NOT built here — the engine assembles it per
// claimed row from the `WorkloadRunnerDeps` (db + env hub + roleClients binder + settings reader). The
// service root adds the domain-owned event publisher before this builder receives the completed context.

import type { WorkloadServiceContext } from "./contract/service.ts";

export function createWorkloadServiceContext(deps: WorkloadServiceContext): WorkloadServiceContext {
  return deps;
}
