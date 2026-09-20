// All db access for `connection_bindings` (queries only). The actor is spelled ONCE here as the
// `(actorKind, actorId)` pair the runtime's `BindingStore.lookup` uses; each arm's partial unique makes the
// upsert's conflict target — the tree's NULL-distinctness idiom, never a coalesce expression.

import type { ConnectionBinding, RoutableTask } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { connectionBindings } from "@orb/db";
import type { AutomationRuleId, ConnectionBindingId, PluginId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { StoredActor } from "../contract/params.ts";

type BindingRow = typeof connectionBindings.$inferSelect;

function toBinding(row: BindingRow): ConnectionBinding {
  return {
    id: row.id,
    actorKind: row.actorKind,
    userId: row.userId,
    ruleId: row.ruleId,
    pluginId: row.pluginId,
    task: row.task,
    connectionId: row.connectionId,
  };
}

/** The WHERE for one actor — its kind + the one id column that kind sets. */
function actorWhere(actor: StoredActor): ReturnType<typeof and> {
  if (actor.actorKind === "user") {
    return and(eq(connectionBindings.actorKind, "user"), eq(connectionBindings.userId, castId<UserId>(actor.actorId)));
  }
  if (actor.actorKind === "automation-rule") {
    return and(eq(connectionBindings.actorKind, "automation-rule"), eq(connectionBindings.ruleId, castId<AutomationRuleId>(actor.actorId)));
  }
  return and(eq(connectionBindings.actorKind, "plugin-grant"), eq(connectionBindings.pluginId, castId<PluginId>(actor.actorId)));
}

/** The id columns one actor's row carries (the kind-shape CHECK's shape). */
function actorColumns(actor: StoredActor): Pick<BindingRow, "actorKind" | "userId" | "ruleId" | "pluginId"> {
  if (actor.actorKind === "user") {
    return { actorKind: "user", userId: castId<UserId>(actor.actorId), ruleId: null, pluginId: null };
  }
  if (actor.actorKind === "automation-rule") {
    return { actorKind: "automation-rule", userId: null, ruleId: castId<AutomationRuleId>(actor.actorId), pluginId: null };
  }
  return { actorKind: "plugin-grant", userId: null, ruleId: null, pluginId: castId<PluginId>(actor.actorId) };
}

/** The runtime's `BindingStore.lookup`: ONE indexed read per fold hop. */
export async function lookupBinding(db: Db, actor: StoredActor, task: RoutableTask): Promise<ConnectionBinding | null> {
  const rows = await db
    .select()
    .from(connectionBindings)
    .where(and(actorWhere(actor), eq(connectionBindings.task, task)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toBinding(row);
}

export async function listBindingsForActor(db: Db, actor: StoredActor): Promise<readonly ConnectionBinding[]> {
  const rows = await db.select().from(connectionBindings).where(actorWhere(actor));
  return rows.map(toBinding);
}

/** Upsert one actor's binding for a task — the per-arm partial unique is the conflict target, so an existing
 *  row is re-pointed in place (never a second row). Returns the row as written. */
export async function upsertBinding(
  db: Db,
  args: { readonly id: ConnectionBindingId; readonly actor: StoredActor; readonly task: RoutableTask; readonly connectionId: UserConnectionId | null },
): Promise<ConnectionBinding> {
  const existing = await lookupBinding(db, args.actor, args.task);
  if (existing !== null) {
    await db.update(connectionBindings).set({ connectionId: args.connectionId }).where(eq(connectionBindings.id, existing.id));
    return { ...existing, connectionId: args.connectionId };
  }
  const columns = actorColumns(args.actor);
  await db.insert(connectionBindings).values({ id: args.id, ...columns, task: args.task, connectionId: args.connectionId });
  return { id: args.id, ...columns, task: args.task, connectionId: args.connectionId };
}
