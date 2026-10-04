// verbs: listBindings · setBinding · useForEverything — the `connection_bindings` WRITER. The rule a CHECK
// cannot express ("a binding may only point at a connection its derived owner holds") is enforced HERE: the
// row must be the caller's, and the actor (a rule, a plugin) must be the caller's too. Two more write-time
// refusals the pane surfaces INLINE (§5.3a): a `spend: "background"` task on a row whose `allowBackground` is
// off (`canFund`, F5 — resolve re-checks because the flag can flip after the binding is written), and a task
// the row's kind cannot serve (`connectionTasks`). (§10-4) re-pointing `embed`/`imageEmbed` re-raises
// the purge+reindex trigger. Any embedder width is admitted that the embedder makes; a stated width it does not make
// undoes the write and refuses it. A write that can move the owner's index runs in the owner's write queue.

import type { Principal } from "@orb/contracts/identity";
import type { ConnectionBinding, RoutableTask, UserConnection } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES, canFund, providerDisplayLabel, ROUTABLE_TASKS } from "@orb/contracts/inference";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { BindingActorInput, SetBindingParams, StoredActor } from "../contract/params.ts";
import type { BindingView } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { listBindingsForActor, lookupBinding, restoreBindingIf, upsertBinding } from "../persistence/bindings.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { settleEmbedSpace, VECTOR_TASKS, vectorSpacesOf } from "../substrate/embed-space.ts";
import { everywhereTasks, servableTasks } from "../substrate/kind.ts";
import type { createOwnerWriteQueue } from "../substrate/owner-queue.ts";
import { toResolvedView } from "../substrate/resolved-view.ts";

type OwnerWriteQueue = ReturnType<typeof createOwnerWriteQueue>;

/** The caller's actor, proven: absent ⇒ their own `user` arm; a rule/plugin arm must be theirs. A plugin grant
 *  that `binds` a connection must name a task the plugin routes: an inert grant on any other task would go live
 *  the day a capability starts routing it. Clearing one (`binds` absent) stays open so a stale row can go. */
async function storedActorFor(ctx: ConnectionContext, userId: UserId, actor: BindingActorInput | undefined, binds?: RoutableTask): Promise<StoredActor> {
  if (actor === undefined) {
    return { actorKind: "user", actorId: userId };
  }
  if (actor.kind === "automation-rule") {
    if (!(await ctx.ruleOwnedBy(actor.ruleId, userId))) {
      throw new DomainOperationError(CONNECTION_OP_CODES.actorForeign, `rule ${actor.ruleId} is not yours.`);
    }
    return { actorKind: "automation-rule", actorId: actor.ruleId };
  }
  const routed = await ctx.pluginGrantTasksOf(actor.pluginId, userId);
  if (routed === null) {
    throw new DomainOperationError(CONNECTION_OP_CODES.actorForeign, `plugin ${actor.pluginId} is not yours.`);
  }
  if (binds !== undefined && !routed.includes(binds)) {
    throw new DomainOperationError(CONNECTION_OP_CODES.actorTaskUnrouted, `this plugin routes nothing through ${binds}.`);
  }
  return { actorKind: "plugin-grant", actorId: actor.pluginId };
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

function createGetBoundConnection(ctx: ConnectionContext): ConnectionService["getBoundConnection"] {
  return async ({ principal, task }) => {
    const binding = await lookupBinding(ctx.db, { actorKind: "user", actorId: principal.userId }, task);
    if (binding?.connectionId === null || binding?.connectionId === undefined) {
      return null;
    }
    const row = await fetchOwnedConnection(ctx.db, principal.userId, binding.connectionId);
    if (row === null) {
      return null;
    }
    const provider = ctx.runtime.providers.registry.get(row.providerId, row.ownerId);
    return {
      label: row.label,
      providerId: row.providerId,
      providerLabel: provider === undefined ? row.providerId : providerDisplayLabel(provider),
      model: row.model,
    };
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
    // A resolved row can still be unable to serve: its in-process model failed its latest load.
    const loaded = ctx.runtime.loadVerdict(outcome.resolved);
    if (!loaded.available) {
      return { task, binding, resolved: null, unavailableCause: loaded.cause };
    }
    return { task, binding, resolved: toResolvedView(outcome.resolved), unavailableCause: null };
  } catch {
    const availability = await ctx.runtime.availability(args);
    return { task, binding, resolved: null, unavailableCause: availability.available ? null : availability.cause };
  }
}

function createSetBinding(ctx: ConnectionContext, ownerWrites: OwnerWriteQueue): ConnectionService["setBinding"] {
  return async (params: SetBindingParams): Promise<ConnectionBinding> => {
    const userId = params.principal.userId;
    const actor = await storedActorFor(ctx, userId, params.actor, params.connectionId === null ? undefined : params.task);
    if (params.connectionId !== null) {
      const row = await fetchOwnedConnection(ctx.db, userId, params.connectionId);
      if (row === null) {
        throw new ConnectionNotFoundError(params.connectionId);
      }
      requireServable(ctx, row, params.task);
    }
    // Only the user's own vector roles define their index; a rule's or a plugin's binding never moves it.
    if (actor.actorKind !== "user" || !VECTOR_TASKS.includes(params.task)) {
      return await writeBinding(ctx, params, actor);
    }
    return await ownerWrites(userId, () => writeVectorBinding(ctx, params, actor));
  };
}

/** A vector role's write: it may move the owner's embed space, so it settles before the next same-owner write runs. */
async function writeVectorBinding(ctx: ConnectionContext, params: SetBindingParams, actor: StoredActor): Promise<ConnectionBinding> {
  const before = await vectorSpacesOf(ctx, params.principal);
  const prior = (await lookupBinding(ctx.db, actor, params.task))?.connectionId ?? null;
  return await writeBinding(ctx, params, actor, async () => {
    await settleEmbedSpace(ctx, {
      ownerId: params.principal.userId,
      before,
      after: await vectorSpacesOf(ctx, params.principal),
      undo: async () => {
        await restoreBindingIf(ctx.db, { actor, task: params.task, from: params.connectionId, to: prior });
      },
    });
  });
}

async function writeBinding(
  ctx: ConnectionContext,
  params: SetBindingParams,
  actor: StoredActor,
  settle: () => Promise<void> = () => Promise.resolve(),
): Promise<ConnectionBinding> {
  const userId = params.principal.userId;
  const written = await upsertBinding(ctx.db, { id: ctx.newBindingId(), actor, task: params.task, connectionId: params.connectionId });
  await settle();
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
  ctx.emitUserEvent(userId, { type: "connectionsChanged" });
  return written;
}

function createUseForEverything(ctx: ConnectionContext, ownerWrites: OwnerWriteQueue): ConnectionService["useForEverything"] {
  return async (params): Promise<readonly ConnectionBinding[]> => {
    const userId = params.principal.userId;
    const row = await fetchOwnedConnection(ctx.db, userId, params.connectionId);
    if (row === null) {
      throw new ConnectionNotFoundError(params.connectionId);
    }
    return await ownerWrites(userId, () => bindEverywhere(ctx, params.principal, row));
  };
}

/** Bind every task the row can serve. It may move the owner's embed space, so it settles before the next write. */
async function bindEverywhere(ctx: ConnectionContext, principal: Principal, row: UserConnection): Promise<readonly ConnectionBinding[]> {
  const userId = principal.userId;
  const tasks = everywhereTasks(ctx, row);
  const actor: StoredActor = { actorKind: "user", actorId: userId };
  const before = tasks.some((task) => VECTOR_TASKS.includes(task)) ? await vectorSpacesOf(ctx, principal) : null;
  const priors = new Map<RoutableTask, ConnectionBinding["connectionId"]>();
  for (const task of tasks) {
    priors.set(task, (await lookupBinding(ctx.db, actor, task))?.connectionId ?? null);
  }
  const written: ConnectionBinding[] = [];
  for (const task of tasks) {
    written.push(await upsertBinding(ctx.db, { id: ctx.newBindingId(), actor, task, connectionId: row.id }));
  }
  if (before !== null) {
    await settleEmbedSpace(ctx, {
      ownerId: userId,
      before,
      after: await vectorSpacesOf(ctx, principal),
      undo: async () => {
        for (const [task, connectionId] of priors) {
          await restoreBindingIf(ctx.db, { actor, task, from: row.id, to: connectionId });
        }
      },
    });
  }
  await ctx.audit({ actorUserId: userId, action: "connection.bindAll", entityType: "connection", entityId: row.id, metadata: { tasks } }, ctx.now());
  ctx.emitUserEvent(userId, { type: "connectionsChanged" });
  return written;
}

/** The binding slice of `ConnectionService` this grouped file owns. */
type BindingVerbs = Pick<ConnectionService, "listBindings" | "getBoundConnection" | "setBinding" | "useForEverything">;

/** The `connection_bindings` verb bundle (`verb-naming`: one factory named for the file). */
export function createBindings(ctx: ConnectionContext, ownerWrites: OwnerWriteQueue): BindingVerbs {
  return {
    listBindings: createListBindings(ctx),
    getBoundConnection: createGetBoundConnection(ctx),
    setBinding: createSetBinding(ctx, ownerWrites),
    useForEverything: createUseForEverything(ctx, ownerWrites),
  };
}
