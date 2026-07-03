// domain/notifications — DI BUNDLE: the ctx the verbs close over (db + the injected clock + the one D60
// recipient belt). The bundle TYPE is the explicit `NotificationsContext` interface in `contract/service.ts`
// (no `ReturnType<>` — `no-context-returntype`); this file is the BUILDER. notifications is a thin durable
// surface — the `emit` op flows the OTHER way (this domain PROVIDES `record`, the entry root composes it into
// `emit` for producers). The lone injected read is `isAgentRecipient` (agent-principal-design/06 §3): an
// inline `users.kind` check the entry root — the sanctioned `users` reader — supplies so `record` can refuse
// an agent recipient without notifications reaching into `users` (`no-direct-users-read`).

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { NotificationsContext } from "./contract/service";

export function createNotificationsContext(
  db: Db,
  now: () => number,
  isAgentRecipient: (userId: UserId) => Promise<boolean>,
): NotificationsContext {
  return { db, now, isAgentRecipient };
}
