// Actual connection writers own endpoint/credential admission, actor binding and vector-space settlement.
import type { Db } from "@orb/db";
import { connectionBindings, sessionEntries, userConnections } from "@orb/db";
import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";

type ConnectionService = ServicesResult["services"]["connection"];

export type UserConnectionRow = typeof userConnections.$inferSelect;
export type ConnectionBindingRow = typeof connectionBindings.$inferSelect;
export type SdkSessionEntryRow = typeof sessionEntries.$inferSelect;

/** Capture only the real SDK's canon-derived lineage; no fixture computes session IDs, seed ordinals or hashes. */
export async function captureSdkSessionRows(db: Db, chatId: ChatId, connectionId: UserConnectionId): Promise<readonly SdkSessionEntryRow[]> {
  return await db
    .select()
    .from(sessionEntries)
    .where(and(eq(sessionEntries.chatId, chatId), eq(sessionEntries.connectionId, connectionId)))
    .orderBy(sessionEntries.seq);
}

/** Captures a real saved connection without inventing its model, provider, credential or capability facts. */
export async function seedUserConnection(
  db: Db,
  create: ConnectionService["create"],
  params: Parameters<ConnectionService["create"]>[0],
): Promise<UserConnectionRow> {
  const view = await create(params);
  const row = await db.select().from(userConnections).where(eq(userConnections.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production connection creation left no canonical user-connection row");
  }
  return row;
}

/** Captures the persisted binding only after the real actor gates and any probe/undo have settled. */
export async function seedConnectionBinding(
  db: Db,
  setBinding: ConnectionService["setBinding"],
  params: Parameters<ConnectionService["setBinding"]>[0],
): Promise<ConnectionBindingRow> {
  const result = await setBinding(params);
  const row = await db.select().from(connectionBindings).where(eq(connectionBindings.id, result.id)).get();
  if (row === undefined) {
    throw new Error("production binding write left no canonical connection-binding row");
  }
  return row;
}
