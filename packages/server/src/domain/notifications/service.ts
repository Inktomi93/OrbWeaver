// domain/notifications — COMPOSITION ROOT: wires the 4 verbs over the DI bundle (zero logic). The per-user
// DURABLE inbox (D16; notifications.md): record (durable-first producer write) · markRead · dismiss · list
// (the caller's own inbox). The clock is injected for determinism (no ambient `Date.now()` in a verb); the
// monotonic `seq` is db-driven (persistence). The producer-facing `emit` op is NOT minted here — it is
// composed at the entry root from this service's `record` + transport's per-user bus (see `EmitNotification`
// in contract/service.ts); this domain never imports a producer (chat) — the edge is one-directional.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { createNotificationsContext } from "./context";
import type { NotificationsService } from "./contract/service";
import { createList } from "./verbs/list";
import { createRead } from "./verbs/read";
import { createRecord } from "./verbs/record";

/** What the composition root needs: the db handle + the injected clock (epoch-ms) + the D60 recipient belt
 *  (`isAgentRecipient` — the sanctioned `users.kind` read the entry root supplies; contract/service.ts). */
interface NotificationsServiceDeps {
  db: Db;
  now: () => number;
  isAgentRecipient: (userId: UserId) => Promise<boolean>;
}

export function createNotificationsService(deps: NotificationsServiceDeps): NotificationsService {
  const ctx = createNotificationsContext(deps.db, deps.now, deps.isAgentRecipient);
  return {
    ...createRecord(ctx),
    ...createRead(ctx),
    ...createList(ctx),
  };
}
