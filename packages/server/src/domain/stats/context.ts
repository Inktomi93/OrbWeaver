// domain/stats — DI BUNDLE builder. The context the verbs close over is the libSQL handle + the injected
// clock (all reads route through persistence/; the cross-read composition lives there). The bundle TYPE is
// the explicit `StatsContext` interface in `contract/service.ts` (no `ReturnType<>` — no-context-returntype).
// `apply-delta` stays OUT of this context — it is injected into chat at THAT composition root; `reconcile`
// is in, because the caller-scoped rebuild is a verb of this service (the workload's bulk arm is not).

import type { Db } from "@orb/db";
import type { StatsContext } from "./contract/service";

export function createStatsContext(db: Db, now: () => number): StatsContext {
  return { db, now };
}
