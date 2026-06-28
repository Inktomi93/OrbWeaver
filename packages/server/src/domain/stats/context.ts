// domain/stats — DI BUNDLE builder. Stats is READ-only, so the context the verbs close over is just the
// libSQL handle (all reads route through persistence/; the cross-read composition lives there). The bundle
// TYPE is the explicit `StatsContext` interface in `contract/service.ts` (no `ReturnType<>` —
// no-context-returntype). The WRITE substrate (apply-delta / reconcile in write/) is NOT in this context —
// it's injected into chat / the workload runner at THOSE composition roots, not the stats read service.

import type { Db } from "@orb/db";
import type { StatsContext } from "./contract/service";

export function createStatsContext(db: Db): StatsContext {
  return { db };
}
