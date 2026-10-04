// The model KIND of a row as the PANE needs it (the runtime decides it again at resolve, with the catalog in
// hand): the row's own `declared.kind` wins, else the curated row by model id, else `generation`. Shared by
// the list view, the bindings writer and the embedder-change preview, so they cannot disagree about which slots
// a row may take.

import type { ModelKind, ProviderDef, RoutableTask, UserConnection } from "@orb/contracts/inference";
import { connectionTasks, isRoutableTask, taskDef } from "@orb/contracts/inference";
import { curatedKind } from "@orb/inference";
import type { ConnectionContext } from "../contract/service.ts";

export function curatedKindOf(row: UserConnection, provider: ProviderDef): ModelKind | undefined {
  return row.declared?.kind ?? curatedKind({ model: row.model, providerId: provider.id, wire: provider.wire });
}

/** The tasks this row may be bound to — provider × the model's kind. */
export function servableTasks(ctx: Pick<ConnectionContext, "runtime">, row: UserConnection): readonly RoutableTask[] {
  const provider = ctx.runtime.providers.registry.get(row.providerId, row.ownerId);
  if (provider === undefined) {
    return [];
  }
  return connectionTasks(provider, curatedKindOf(row, provider) ?? "generation").filter(isRoutableTask);
}

/** The tasks "use for everything" binds: every task the row can serve AND fund. A background task on a row with
 *  the flag off is skipped, not refused — the user asked for everything it can serve, and it cannot serve that. */
export function everywhereTasks(ctx: Pick<ConnectionContext, "runtime">, row: UserConnection): readonly RoutableTask[] {
  return servableTasks(ctx, row).filter((task) => taskDef(task).spend === "foreground" || row.allowBackground);
}
