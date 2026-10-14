// The real record operation owns event stripping, recipient sequencing and atomic supersession.
import type { Db } from "@orb/db";
import { notifications } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";

type NotificationsService = ServicesResult["services"]["notifications"];

export type NotificationRow = typeof notifications.$inferSelect;

export async function seedNotification(
  db: Db,
  record: NotificationsService["record"],
  params: Parameters<NotificationsService["record"]>[0],
): Promise<NotificationRow> {
  const view = await record(params);
  const row = await db.select().from(notifications).where(eq(notifications.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production notification record left no canonical notification row");
  }
  return row;
}
