// Presence follows the stream's end, however the stream ended, read through the disclosure query a client asks.
// @subject packages/server/src/transport/trpc/routers/stream.ts
// @subject packages/server/src/transport/trpc/presence-registry.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { SocketId, UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, isOnline } from "@orb/testkit/node/composed";
import { vi } from "vitest";

// Past the registry's grace window: a read after this names the true state, not the debounce.
const PAST_GRACE_MS = 60_000;

interface Connection {
  /** Settles when the server ends the response, or the client closes it. */
  readonly ended: Promise<void>;
  readonly close: () => void;
}

function newSocketId(root: ServerTestHarness): SocketId {
  return streamConnectInputSchema.parse({ socketId: root.ids.uuid() }).socketId;
}

/** One `stream.connect` over a real TCP connection, read to its end the way a browser's EventSource reads it.
 *  The wire is the point: only a real server leaves the request signal unaborted after the stream ended. */
async function open(root: ServerTestHarness, socketId: SocketId): Promise<Connection> {
  const { address: host, port } = await root.listen();
  const address = new URL(`http://${host}:${port}/api/trpc/stream.connect`);
  address.searchParams.set("input", JSON.stringify({ socketId }));
  const stop = new AbortController();
  const response = await fetch(address, { headers: { accept: "text/event-stream" }, signal: stop.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("the socket omitted its stream");
  }
  // The generator goes live on its first pull, and this frame is that pull's proof.
  await reader.read();
  const drain = async (): Promise<void> => {
    while (!(await reader.read()).done) {
      // Frames carry nothing this suite reads.
    }
  };
  return { ended: drain().catch(() => undefined), close: (): void => stop.abort() };
}

async function presenceRoot(): Promise<{ readonly root: ServerTestHarness; readonly asker: UserId } & AsyncDisposable> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({ physicalPeer: () => "127.0.0.1", env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" } }),
  );
  await root.services.settings.updateAppSettings({ principal: await root.principalFor(root.ownerId), partial: { localMultiUser: true } });
  const { id } = await root.actor();
  const lifetime = construction.move();
  return { root, asker: id, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** Polled, because a client's close reaches the server a beat after its own read settles. */
async function readsOffline(root: ServerTestHarness, asker: UserId): Promise<void> {
  await expect
    .poll(async () => {
      root.clock.advance(PAST_GRACE_MS);
      const caller = await root.internalCallerFor(asker);
      return (await caller.notifications.presence({ userIds: [root.ownerId] })).lastSeen.map((entry) => entry.userId);
    })
    .toEqual([root.ownerId]);
}

test("a same-socket takeover stays online while its successor is open, and both closed reads offline with a last-seen time", async () => {
  await using world = await presenceRoot();
  const { root, asker } = world;
  const socketId = newSocketId(root);
  const first = await open(root, socketId);
  const second = await open(root, socketId);
  await first.ended;
  root.clock.advance(PAST_GRACE_MS);
  expect(await isOnline(root, asker, root.ownerId)).toBe(true);
  first.close();
  second.close();
  await second.ended;
  await readsOffline(root, asker);
});

test("a stream that ended and then closed releases once, so the owner's other device keeps them online", async () => {
  await using world = await presenceRoot();
  const { root, asker } = world;
  const otherDevice = await open(root, newSocketId(root));
  const socketId = newSocketId(root);
  const first = await open(root, socketId);
  const second = await open(root, socketId);
  await first.ended;
  first.close();
  second.close();
  await second.ended;
  await expect.poll(() => root.app.sockets.liveSocketCount(root.ownerId)).toBe(1);
  root.clock.advance(PAST_GRACE_MS);
  expect(await isOnline(root, asker, root.ownerId)).toBe(true);
  otherDevice.close();
  await otherDevice.ended;
  await readsOffline(root, asker);
});

test("a server eviction releases presence without the request ever aborting", async () => {
  await using world = await presenceRoot();
  const { root, asker } = world;
  const device = await open(root, newSocketId(root));
  expect(root.app.sockets.evictUser(root.ownerId)).toBe(1);
  await device.ended;
  await readsOffline(root, asker);
});

test("a host who left after a takeover reclaims deferred turns on return, and the takeover itself does not", async () => {
  await using world = await presenceRoot();
  const { root } = world;
  const drain = vi.spyOn(root.services.chat, "drainDeferredTurns");
  const socketId = newSocketId(root);
  const first = await open(root, socketId);
  expect(drain).toHaveBeenCalledTimes(1);
  const second = await open(root, socketId);
  await first.ended;
  expect(drain).toHaveBeenCalledTimes(1);
  second.close();
  await second.ended;
  await readsOffline(root, world.asker);
  const back = await open(root, socketId);
  expect(drain).toHaveBeenCalledTimes(2);
  expect(drain).toHaveBeenLastCalledWith({ hostUserId: root.ownerId });
  back.close();
  await back.ended;
});
