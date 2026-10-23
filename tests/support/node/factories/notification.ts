import type { ServerProducerRoot, ServerTestHarness } from "../server.ts";

type NotificationCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["notifications"];

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
