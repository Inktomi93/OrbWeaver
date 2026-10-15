// The real record operation owns event stripping, recipient sequencing and atomic supersession.
import type { Db } from "@orb/db";
import { notifications } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import type { ServerTestHarness } from "../server.ts";

type NotificationsService = ServicesResult["services"]["notifications"];
type NotificationCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["notifications"];

export type NotificationRow = typeof notifications.$inferSelect;

export interface CapturedNotificationViews {
  readonly inbox: Awaited<ReturnType<NotificationCaller["list"]>>;
  readonly presence: Awaited<ReturnType<NotificationCaller["presence"]>>;
}

/** Native disclosure may refuse while an empty personal inbox remains readable; do not heal that refusal into offline. */
export async function captureNotificationViews(
  caller: NotificationCaller,
  userIds: Parameters<NotificationCaller["presence"]>[0]["userIds"],
): Promise<CapturedNotificationViews> {
  return { inbox: await caller.list(), presence: await caller.presence({ userIds }) };
}

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
