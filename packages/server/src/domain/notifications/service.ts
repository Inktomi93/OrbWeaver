// domain/notifications — COMPOSITION ROOT: wires the verbs (record/markAllRead/dismiss/list) over one
// shared `NotificationsContext` (zero logic of its own — see contract/service.ts for the domain's D16
// durable-inbox contract, the `emit` composition, and the one-directional edge from chat).

import type { Db } from "@orb/db";
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
}

export function createNotificationsService(deps: NotificationsServiceDeps): NotificationsService {
  const ctx = createNotificationsContext(deps.db, deps.now);
  return {
    ...createRecord(ctx),
    ...createRead(ctx),
    ...createList(ctx),
  };
}
