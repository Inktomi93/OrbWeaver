// The SPACE TAG read for one owner: the model their `embed` / `imageEmbed` binding resolves to right now
// (`RoleClients.resolved(task)`, inference program §7.5-1b — the six per-role getters' one replacement).
// `null` when the owner has no binding for the task (`no-connection`): a store/sweep SKIPS that owner and
// says so, never a throw into a bus handler.

import type { RoleClientTask } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";
import type { RoleClientsFor } from "../contract/service.ts";

export async function requireTaskModel(ctx: { readonly roleClientsFor: RoleClientsFor }, ownerId: UserId, task: RoleClientTask): Promise<string | null> {
  const resolved = await (await ctx.roleClientsFor(ownerId)).resolved(task);
  return resolved === null ? null : resolved.model;
}
