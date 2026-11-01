// A user's device coming online, through the door production counts presence on: the multiplexed stream
// socket (`stream.connect`). Aborting `signal` closes the device the way a dropped connection does.

import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { UserId } from "@orb/kit/ids";
import type { ServerTestHarness } from "./server.ts";

export async function connectDevice(root: Pick<ServerTestHarness, "internalCallerFor" | "ids">, userId: UserId, signal: AbortSignal): Promise<void> {
  const { socketId } = streamConnectInputSchema.parse({ socketId: root.ids.uuid() });
  const caller = await root.internalCallerFor(userId, signal);
  await caller.stream.connect({ socketId });
}

/** Whether `userId` reads online through the disclosure query a client asks, asked as `asker`. */
export async function isOnline(root: Pick<ServerTestHarness, "internalCallerFor">, asker: UserId, userId: UserId): Promise<boolean> {
  const caller = await root.internalCallerFor(asker);
  return (await caller.notifications.presence({ userIds: [userId] })).onlineUserIds.includes(userId);
}
