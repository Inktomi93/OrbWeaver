// Actual connection writers own endpoint/credential admission, actor binding and vector-space settlement.
import { connectionBindings, userConnections } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type ConnectionService = ServicesResult["services"]["connection"];

export type UserConnectionRow = typeof userConnections.$inferSelect;
export type ConnectionBindingRow = typeof connectionBindings.$inferSelect;

/** Captures a real saved connection without inventing its model, provider, credential or capability facts. */
export async function seedUserConnection(root: ServerProducerRoot, params: Parameters<ConnectionService["create"]>[0]): Promise<UserConnectionRow> {
  const db = root.db;
  const create = root.services.connection.create;
  const view = await create(params);
  const row = await db.select().from(userConnections).where(eq(userConnections.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production connection creation left no canonical user-connection row");
  }
  return row;
}

/** Captures the persisted binding only after the real actor gates and any probe/undo have settled. */
export async function seedConnectionBinding(root: ServerProducerRoot, params: Parameters<ConnectionService["setBinding"]>[0]): Promise<ConnectionBindingRow> {
  const db = root.db;
  const setBinding = root.services.connection.setBinding;
  const result = await setBinding(params);
  const row = await db.select().from(connectionBindings).where(eq(connectionBindings.id, result.id)).get();
  if (row === undefined) {
    throw new Error("production binding write left no canonical connection-binding row");
  }
  return row;
}
