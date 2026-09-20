// The SPACE TAG read for one owner: the `(model[@dtype])` space their `embed` / `imageEmbed` binding
// resolves to right now (`RoleClients.resolved(task)`, inference program §7.5-1b — the six per-role getters'
// one replacement). `null` when the owner has no binding for the task (`no-connection`): a store/sweep SKIPS
// that owner and says so, never a throw into a bus handler.
//
// THE TAG IS `embedSpaceOf`, NOT `resolved.model` (§10-2). The connection row's `model` column names the
// weights; the SPACE additionally carries the served precision, because a re-quantised encoder produces
// different vectors (#2417). The backend stamps that same tag on its `EmbedResult.model`, so deriving only
// the bare column here wrote every row into `<model>@<dtype>` while every read filtered on `<model>` —
// silently empty search, and an old-space purge that reclaimed the live corpus.

import { embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import type { RoleClientTask } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";
import type { RoleClientsFor } from "../contract/service.ts";

export async function requireTaskModel(ctx: { readonly roleClientsFor: RoleClientsFor }, ownerId: UserId, task: RoleClientTask): Promise<string | null> {
  const resolved = await (await ctx.roleClientsFor(ownerId)).resolved(task);
  return resolved === null ? null : embedSpaceOf(resolved.model, embedDtypeOf(resolved.capability));
}
