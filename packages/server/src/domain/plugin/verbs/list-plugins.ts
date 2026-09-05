// verb: listPlugins — the caller's OWN installed plugins, newest-installed first (fetchOwned). No
// authority beyond ownership: the owner-scoped read is the gate (a foreign plugin is simply not in the result).
// It takes NO id at all, so the scope is not a predicate a caller could influence — `listOwned` filters
// `WHERE owner_id = caller.userId` and there is no second read path. Under D147 (anyone installs for
// themselves) this is now every user's pane, not an admin screen: an EMPTY result is a fact about WHICH
// principal asked, never about whether the deployment has plugins.

import type { ListPluginsParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { listOwned, toPluginView } from "../persistence/plugins.ts";

export function createListPlugins(ctx: PluginContext): PluginService["list"] {
  return async ({ caller }: ListPluginsParams) => {
    const rows = await listOwned(ctx.db, caller.userId);
    return rows.map((row) => toPluginView(row, ctx.showcase.slugs));
  };
}
