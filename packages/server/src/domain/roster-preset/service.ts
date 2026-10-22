// domain/roster-preset — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). Saved
// parties (D61 B6) — owner-scoped library CRUD + the additive/idempotent `applyToChat` that drives
// chat's existing roster verbs by injection. `RosterPresetContext` is assembled at
// `entry/compose/roster-preset.ts`; this domain injects NO guard (CRUD is ownership-scoped; apply's
// host gate is chat's own injected `requireHost`).

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { RosterPresetContext, RosterPresetService } from "./contract/service.ts";
import { createApplyToChat } from "./verbs/apply-to-chat.ts";
import { createCount } from "./verbs/count.ts";
import { createCreate } from "./verbs/create.ts";
import { createGet } from "./verbs/get.ts";
import { createList } from "./verbs/list.ts";
import { createRemove } from "./verbs/remove.ts";
import { createUpdate } from "./verbs/update.ts";

export function createRosterPresetService(input: DbAssemblyInput<RosterPresetContext>): RosterPresetService {
  const ctx: RosterPresetContext = { ...input, db: databaseForOwner(input.db) };
  return {
    create: createCreate(ctx),
    update: createUpdate(ctx),
    remove: createRemove(ctx),
    count: createCount(ctx),
    list: createList(ctx),
    get: createGet(ctx),
    applyToChat: createApplyToChat(ctx),
  };
}
