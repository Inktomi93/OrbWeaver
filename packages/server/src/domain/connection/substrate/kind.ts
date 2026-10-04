// The model KIND of a row as the connection domain needs it, read through the runtime so the bindings writer, the
// list view, the diagnostics and the embedder-change preview agree with the resolver: the row's own `declared.kind`,
// else the kind its server or catalog states, else the curated row, else `generation`.

import type { RoutableTask, UserConnection } from "@orb/contracts/inference";
import { connectionTasks, isRoutableTask, taskDef } from "@orb/contracts/inference";
import type { ConnectionContext } from "../contract/service.ts";

// How fresh a kind read must be. A write (a binding) warms the catalog first; a read that lists rows or previews a
// change reads only what the mirrors hold, so a host that does not answer cannot hold it.
type KindRead = Parameters<ConnectionContext["runtime"]["modelKind"]>[1];

/** The tasks this row may be bound to — provider × the model's kind. */
export async function servableTasks(ctx: Pick<ConnectionContext, "runtime">, row: UserConnection, read: KindRead = {}): Promise<readonly RoutableTask[]> {
  const provider = ctx.runtime.providers.registry.get(row.providerId, row.ownerId);
  if (provider === undefined) {
    return [];
  }
  return connectionTasks(provider, await ctx.runtime.modelKind(row, read)).filter(isRoutableTask);
}

/** The tasks "use for everything" binds: every task the row can serve AND fund. A background task on a row with
 *  the flag off is skipped, not refused — the user asked for everything it can serve, and it cannot serve that. */
export async function everywhereTasks(ctx: Pick<ConnectionContext, "runtime">, row: UserConnection, read: KindRead = {}): Promise<readonly RoutableTask[]> {
  return (await servableTasks(ctx, row, read)).filter((task) => taskDef(task).spend === "foreground" || row.allowBackground);
}
