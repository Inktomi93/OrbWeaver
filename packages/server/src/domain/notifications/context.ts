// domain/notifications — DI BUNDLE: the ctx the verbs close over (db + the injected clock). The bundle TYPE
// is the explicit `NotificationsContext` interface in `contract/service.ts` (no `ReturnType<>` —
// `no-context-returntype`); this file is the BUILDER. notifications is a thin durable surface — no named
// subsystem, no bound adapter, no cross-feature op in the context (the `emit` op flows the OTHER way: this
// domain PROVIDES `record`, the entry root composes it into `emit` for producers).

import type { Db } from "@orb/db";
import type { NotificationsContext } from "./contract/service";

export function createNotificationsContext(db: Db, now: () => number): NotificationsContext {
  return { db, now };
}
