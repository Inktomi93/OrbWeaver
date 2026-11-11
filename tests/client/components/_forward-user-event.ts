// A composed root's own user-bus event, handed to the page over the scripted socket: the way a deleted row leaves a list in a CT, because
// the event the real server emits for the write is what the client invalidates its reads on. The page's `stream.attach` for the user room
// must succeed for the socket to serve, so a caller routes it beside its reads.
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { routeOrbSocket } from "@orb/testkit/ct";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

/** Serve the first `type` event the root emits for its owner to the page, and stop listening when `cleanup` is disposed. */
export async function forwardUserEvent(page: Page, root: ServerTestHarness, type: UserBusEvent["type"], cleanup: AsyncDisposableStack): Promise<void> {
  const stop = new AbortController();
  const joined = Promise.withResolvers<void>();
  let started = false;
  cleanup.defer(async () => {
    stop.abort();
    if (started) {
      await joined.promise;
    }
  });
  await routeOrbSocket(page, {
    awaitRooms: [{ channel: "user" }],
    frames: async (signal) => {
      started = true;
      const events = root.app.liveBuses.user.subscribeUserEvents(root.ownerId, AbortSignal.any([signal, stop.signal]));
      try {
        for await (const event of events) {
          if (event.type === type) {
            return [{ channel: "user", event }];
          }
        }
        return [];
      } catch (error) {
        if (!stop.signal.aborted) {
          throw error;
        }
        return [];
      } finally {
        joined.resolve();
      }
    },
  });
}
