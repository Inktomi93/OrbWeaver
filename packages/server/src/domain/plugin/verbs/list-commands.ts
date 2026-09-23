// verb: listCommands — the caller's OWN enabled plugins' registered UI COMMANDS (U5,
// §4.5). The `listSurfaces` twin in every respect, deliberately: owner-scoped by construction (`listOwned`
// filters `WHERE owner_id = caller.userId`, so a command can only reach the result if the caller OWNS the
// plugin — "the read is the gate", no foreign id anywhere), a disabled/errored plugin has no resident instance
// and therefore contributes nothing, and each command is projected to its serializable view (the `onRun` handle
// stays server-side, re-entered only by `invokeUiCommand`).
//
// IT CARRIES THE SLUG, and that is the load-bearing projection: `/plugin <slug> <name> …` is the dispatch
// grammar the person types, only this side knows the install's slug, and a client that re-derived one would be
// a second spelling of a rule that silently unmatches every command the day either half moves (the
// `toolWireName` lesson, applied before it could be repeated).

import type { PluginCommandRegistration } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import type { ListCommandsParams } from "../contract/params.ts";
import type { PluginCommandView } from "../contract/results.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { listOwned } from "../persistence/plugins.ts";

function toView(pluginId: PluginId, slug: string, pluginName: string, command: PluginCommandRegistration): PluginCommandView {
  // `args` is projected verbatim (the #791 typed-arg grammar) — empty when the command declared none, so a
  // client can build its input strip / completion off exactly what the guest registered. The `onRun` handle
  // stays server-side (never projected), exactly as before.
  return { pluginId, slug, pluginName, name: command.name, describe: command.describe, args: command.args ?? [] };
}

export function createListCommands(ctx: PluginContext, registry: PluginRegistry): PluginService["listCommands"] {
  return async ({ caller }: ListCommandsParams) => {
    const rows = await listOwned(ctx.db, caller.userId);
    const views: PluginCommandView[] = [];
    for (const row of rows) {
      const resident = registry.get(row.id);
      if (resident === undefined) {
        continue;
      }
      for (const command of resident.instance.commands) {
        views.push(toView(row.id, row.slug, row.name, command));
      }
    }
    return views;
  };
}
