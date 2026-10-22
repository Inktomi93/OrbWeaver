// The real record operation owns event stripping, recipient sequencing and atomic supersession.
import { notifications } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot, ServerTestHarness } from "../server.ts";

type NotificationsService = ServicesResult["services"]["notifications"];
type NotificationCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["notifications"];

export type NotificationRow = typeof notifications.$inferSelect;

export interface CapturedNotificationViews {
  readonly inbox: Awaited<ReturnType<NotificationCaller["list"]>>;
  readonly presence: Awaited<ReturnType<NotificationCaller["presence"]>>;
}

/** Native disclosure may refuse while an empty personal inbox remains readable; do not heal that refusal into offline. */
export async function captureNotificationViews(
  root: ServerProducerRoot,
  userId: Parameters<ServerTestHarness["internalCallerFor"]>[0],
  userIds: Parameters<NotificationCaller["presence"]>[0]["userIds"],
): Promise<CapturedNotificationViews> {
  const caller = (await root.internalCallerFor(userId)).notifications;
  return { inbox: await caller.list(), presence: await caller.presence({ userIds }) };
}

export async function seedNotification(root: ServerProducerRoot, params: Parameters<NotificationsService["record"]>[0]): Promise<NotificationRow> {
  const db = root.db;
  const record = root.services.notifications.record;
  const view = await record(params);
  const row = await db.select().from(notifications).where(eq(notifications.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production notification record left no canonical notification row");
  }
  return row;
}
