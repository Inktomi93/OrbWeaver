// A cross-site page in the box's own browser can send a header-less GET, and the loopback owner fallback admits it as the
// owner. A subscription over GET therefore needs the CSRF header, so such a GET reaches no subscription resolver: the
// socket's presence write and the deferred-turn drain do not run.
// @subject packages/server/src/entry/app.ts
// @subject packages/server/src/transport/trpc/routers/stream.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, isOnline } from "@orb/testkit/node/composed";
import { vi } from "vitest";

async function fallbackRoot(): Promise<{ readonly root: ServerTestHarness; readonly asker: UserId } & AsyncDisposable> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({ physicalPeer: () => "127.0.0.1", env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" } }),
  );
  await root.services.settings.updateAppSettings({ principal: await root.principalFor(root.ownerId), partial: { localMultiUser: true } });
  const { id } = await root.actor();
  const lifetime = construction.move();
  return { root, asker: id, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** GET `stream.connect` over a real TCP connection, the request an EventSource or a subresource tag sends. tRPC
 *  answers a refused subscription over SSE as well, so the state the request changed is the verdict, not its status. */
async function connectOverGet(root: ServerTestHarness, headers: Readonly<Record<string, string>>): Promise<void> {
  const { address: host, port } = await root.listen();
  const address = new URL(`http://${host}:${port}/api/trpc/stream.connect`);
  address.searchParams.set("input", JSON.stringify({ socketId: streamConnectInputSchema.parse({ socketId: root.ids.uuid() }).socketId }));
  const stop = new AbortController();
  const response = await fetch(address, { headers: { accept: "text/event-stream", ...headers }, signal: stop.signal });
  // The resolver runs before the response head, so one read settles every write it would make.
  await response.body?.getReader().read();
  stop.abort();
}

test("a header-less GET to stream.connect under the owner fallback is refused before presence or the drain runs", async () => {
  await using world = await fallbackRoot();
  const { root, asker } = world;
  const drain = vi.spyOn(root.services.chat, "drainDeferredTurns");

  await connectOverGet(root, {});
  expect(drain).not.toHaveBeenCalled();
  expect(await isOnline(root, asker, root.ownerId)).toBe(false);

  // Control: the same GET with the header a cross-site page cannot send opens the socket, marks the owner online and drains.
  await connectOverGet(root, { [CSRF_HEADER]: "1" });
  expect(drain).toHaveBeenCalledWith({ hostUserId: root.ownerId });
  expect(await isOnline(root, asker, root.ownerId)).toBe(true);
});
