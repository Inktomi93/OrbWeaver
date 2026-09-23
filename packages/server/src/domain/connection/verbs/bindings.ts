// verbs: listBindings · setBinding · useForEverything — the `connection_bindings` WRITER. The rule a CHECK
// cannot express ("a binding may only point at a connection its derived owner holds") is enforced HERE: the
// row must be the caller's, and the actor (a rule, a plugin) must be the caller's too. Two more write-time
// refusals the pane surfaces INLINE (§5.3a): a `spend: "background"` task on a row whose `allowBackground` is
// off (`canFund`, F5 — resolve re-checks because the flag can flip after the binding is written), and a task
// the row's kind cannot serve (`connectionTasks`). (§10-4) re-pointing `embed`/`imageEmbed` re-raises
// the purge+reindex trigger.

import type { ConnectionBinding, RoutableTask, UserConnection } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES, canFund, connectionTasks, isRoutableTask, ROUTABLE_TASKS, taskDef } from "@orb/contracts/inference";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { BindingActorInput, SetBindingParams, StoredActor } from "../contract/params.ts";
import type { BindingView } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { listBindingsForActor, upsertBinding } from "../persistence/bindings.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { VECTOR_TASKS } from "../substrate/embed-space.ts";
import { curatedKindOf } from "../substrate/kind.ts";
import { toResolvedView } from "../substrate/resolved-view.ts";

/** The caller's actor, proven: absent ⇒ their own `user` arm; a rule/plugin arm must be theirs. */
async function storedActorFor(ctx: ConnectionContext, userId: UserId, actor: BindingActorInput | undefined): Promise<StoredActor> {
  if (actor === undefined) {
    return { actorKind: "user", actorId: userId };
  }
  if (actor.kind === "automation-rule") {
    if (!(await ctx.ruleOwnedBy(actor.ruleId, userId))) {
      throw new DomainOperationError(CONNECTION_OP_CODES.actorForeign, `rule ${actor.ruleId} is not yours.`);
    }
    return { actorKind: "automation-rule", actorId: actor.ruleId };
  }
  if (!(await ctx.pluginOwnedBy(actor.pluginId, userId))) {
    throw new DomainOperationError(CONNECTION_OP_CODES.actorForeign, `plugin ${actor.pluginId} is not yours.`);
  }
  return { actorKind: "plugin-grant", actorId: actor.pluginId };
}

/** The tasks this row may be bound to — provider × the model's kind. */
function servableTasks(ctx: ConnectionContext, row: UserConnection): readonly RoutableTask[] {
  const provider = ctx.runtime.providers.registry.get(row.providerId, row.ownerId);
  if (provider === undefined) {
    return [];
  }
  return connectionTasks(provider, curatedKindOf(row, provider) ?? "generation").filter(isRoutableTask);
}

function requireServable(ctx: ConnectionContext, row: UserConnection, task: RoutableTask): void {
  if (!servableTasks(ctx, row).includes(task)) {
    throw new DomainOperationError(CONNECTION_OP_CODES.taskUnservable, `"${row.label}" cannot serve ${task}.`);
  }
  if (!canFund(row, task)) {
    throw new DomainOperationError(CONNECTION_OP_CODES.backgroundRefused, `${task} runs unattended; allow background work on "${row.label}" first.`);
  }
}

function createListBindings(ctx: ConnectionContext): ConnectionService["listBindings"] {
  return async (params): Promise<readonly BindingView[]> => {
    const actor = await storedActorFor(ctx, params.principal.userId, params.actor);
    const rows = await listBindingsForActor(ctx.db, actor);
    const byTask = new Map<RoutableTask, ConnectionBinding>(rows.map((row): [RoutableTask, ConnectionBinding] => [row.task, row]));
    const views: BindingView[] = [];
    for (const task of ROUTABLE_TASKS) {
      views.push(await bindingReadout(ctx, params, task, byTask.get(task) ?? null));
    }
    return views;
  };
}

/** What a task resolves TO right now for this actor — the pane's persisted-resolve readout (§5.3a): the
 *  resolved view, or the availability cause when the fold refuses. */
async function bindingReadout(
  ctx: ConnectionContext,
  params: Parameters<ConnectionService["listBindings"]>[0],
  task: RoutableTask,
  binding: ConnectionBinding | null,
): Promise<BindingView> {
  const args = { task, principal: params.principal, ...(params.actor !== undefined ? { actor: params.actor } : {}) };
  // @orb-waive caught-failure-ownership(catch): a resolve REFUSAL is the readout's other arm — the availability
  // read names the cause the pane renders; nothing is swallowed. Ends if a non-refusal error class needs to surface.
  try {
    const outcome = await ctx.runtime.resolve(args);
    return { task, binding, resolved: toResolvedView(outcome.resolved), unavailableCause: null };
  } catch {
    const availability = await ctx.runtime.availability(args);
    return { task, binding, resolved: null, unavailableCause: availability.available ? null : availability.cause };
  }
}

function createSetBinding(ctx: ConnectionContext): ConnectionService["setBinding"] {
  return async (params: SetBindingParams): Promise<ConnectionBinding> => {
    const userId = params.principal.userId;
    const actor = await storedActorFor(ctx, userId, params.actor);
    if (params.connectionId !== null) {
      const row = await fetchOwnedConnection(ctx.db, userId, params.connectionId);
      if (row === null) {
        throw new ConnectionNotFoundError(params.connectionId);
      }
      requireServable(ctx, row, params.task);
    }
    const written = await upsertBinding(ctx.db, { id: ctx.newBindingId(), actor, task: params.task, connectionId: params.connectionId });
    await ctx.audit(
      {
        actorUserId: userId,
        action: "connection.bind",
        entityType: "connection",
        entityId: params.connectionId,
        metadata: { task: params.task, actorKind: actor.actorKind },
      },
      ctx.now(),
    );
    if (actor.actorKind === "user" && VECTOR_TASKS.includes(params.task)) {
      ctx.onEmbedSpaceChanged(userId);
    }
    return written;
  };
}

function createUseForEverything(ctx: ConnectionContext): ConnectionService["useForEverything"] {
  return async (params): Promise<readonly ConnectionBinding[]> => {
    const userId = params.principal.userId;
    const row = await fetchOwnedConnection(ctx.db, userId, params.connectionId);
    if (row === null) {
      throw new ConnectionNotFoundError(params.connectionId);
    }
    // Every routable task the row can serve AND fund: a background task on a row with the flag off is
    // skipped (not refused — the user asked for "everything it can serve", and it cannot serve that).
    const tasks = servableTasks(ctx, row).filter((task) => taskDef(task).spend === "foreground" || row.allowBackground);
    const actor: StoredActor = { actorKind: "user", actorId: userId };
    const written: ConnectionBinding[] = [];
    for (const task of tasks) {
      written.push(await upsertBinding(ctx.db, { id: ctx.newBindingId(), actor, task, connectionId: row.id }));
    }
    await ctx.audit({ actorUserId: userId, action: "connection.bindAll", entityType: "connection", entityId: row.id, metadata: { tasks } }, ctx.now());
    if (tasks.some((task) => VECTOR_TASKS.includes(task))) {
      ctx.onEmbedSpaceChanged(userId);
    }
    return written;
  };
}

/** The binding slice of `ConnectionService` this grouped file owns. */
type BindingVerbs = Pick<ConnectionService, "listBindings" | "setBinding" | "useForEverything">;

/** The `connection_bindings` verb bundle (`verb-naming`: one factory named for the file). */
export function createBindings(ctx: ConnectionContext): BindingVerbs {
  return {
    listBindings: createListBindings(ctx),
    setBinding: createSetBinding(ctx),
    useForEverything: createUseForEverything(ctx),
  };
}
