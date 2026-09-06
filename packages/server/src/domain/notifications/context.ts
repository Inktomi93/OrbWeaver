// domain/notifications — the ctx BUILDER: assembles `NotificationsContext` (db + injected clock + the
// D60 `isAgentRecipient` belt) for the verbs to close over. Excludes `emit` — that op flows the OTHER
// way (this domain PROVIDES `record`; the entry root composes `emit` for producers). The bundle's TYPE
// is the explicit interface in `contract/service.ts` (no `ReturnType<>` — `no-context-returntype`; see
// that file for the full D60 belt rationale and the `no-direct-users-read` gate this builder satisfies).

import type { Db } from "@orb/db";
import type { ResolveStandingAsks } from "./contract/ops.ts";
import type { NotificationsContext } from "./contract/service.ts";

export function createNotificationsContext(db: Db, now: () => number, resolveStandingAsks: ResolveStandingAsks): NotificationsContext {
  return { db, now, resolveStandingAsks };
}
