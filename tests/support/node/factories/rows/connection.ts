// Connection rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import { userConnections } from "@orb/db";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { ConnectionService, UserConnectionRow } from "../connection.ts";

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
