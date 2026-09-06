// domain/notifications — COMPOSITION ROOT: wires the verbs (record/refreshStanding/retract/markAllRead/dismiss/list/replaySince) over one
// shared `NotificationsContext` (zero logic of its own — see contract/service.ts for the domain's D16
// durable-inbox contract, the `emit` composition, and the one-directional edge from chat).

import type { Db } from "@orb/db";
import { createNotificationsContext } from "./context.ts";
import type { ResolveStandingAsks } from "./contract/ops.ts";
import type { NotificationsService } from "./contract/service.ts";
import { createList } from "./verbs/list.ts";
import { createRead } from "./verbs/read.ts";
import { createRecord } from "./verbs/record.ts";
import { createReplaySince } from "./verbs/replay-since.ts";
import { createStanding } from "./verbs/standing.ts";

/** What the composition root needs: the db handle + the injected clock (epoch-ms) + the D60 recipient belt
 *  (`isAgentRecipient` — the sanctioned `users.kind` read the entry root supplies; contract/service.ts). */
interface NotificationsServiceDeps {
  db: Db;
  now: () => number;
  /** The #1799 cross-feature read behind `InboxView.actionable` (contract/ops.ts). Required: see the field's
   *  note on `NotificationsContext` for why a defaulted no-op would be a silently wrong indicator. */
  resolveStandingAsks: ResolveStandingAsks;
}

export function createNotificationsService(deps: NotificationsServiceDeps): NotificationsService {
  const ctx = createNotificationsContext(deps.db, deps.now, deps.resolveStandingAsks);
  return {
    ...createRecord(ctx),
    ...createRead(ctx),
    ...createList(ctx),
    ...createReplaySince(ctx),
    ...createStanding(ctx),
  };
}
