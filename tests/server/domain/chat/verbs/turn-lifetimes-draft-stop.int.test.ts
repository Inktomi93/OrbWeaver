// @subject packages/server/src/domain/chat/verbs/turn.ts

import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { textRoom } from "../scenario-physical.ts";
import { withCancellationPeer } from "./turn-cancellation-physical.ts";

test("an empty room streams its opening user draft without creating a message or variant", async () => {
  await using h = await textRoom(["Hi there"], { group: { output: "per-speaker", policy: "list" } });
  const deltas: string[] = [];
  for await (const { delta } of h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId })) {
    deltas.push(delta);
  }
  expect(deltas.length).toBeGreaterThan(0);
  expect(deltas.join("")).toBe("Hi there");
  expect(h.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual([]);
});

test("the public Stop operation reaches an active user draft and closes its actual provider stream", async () => {
  await withCancellationPeer("stream", async ({ h, peer, events }) => {
    const params = { principal: h.owner, chatId: h.chatId };
    const iter = h.root.services.chat.impersonateStream(params)[Symbol.asyncIterator]();
    const finish = iter.return?.bind(iter);
    if (finish === undefined) {
      throw new Error("the actual draft subscription has no consumer finalizer");
    }
    try {
      const first = await iter.next();
      expect(first.done).toBe(false);
      expect(first.value?.delta).toBe("first");
      expect(peer.stopped()).toBe(false);
      await h.root.services.chat.abort(params);
      expect((await iter.next()).done).toBe(true);
      await expect.poll(peer.stopped).toBe(true);
      await peer.disconnected;
      expect(peer.destroyed()).toBe(true);
      expect(peer.writeLate()).toBe(false);
      await expect(h.root.services.chat.abort(params)).resolves.toBeUndefined();
      expect(peer.requests).toHaveLength(1);
      expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual([]);
      expect(events.filter(({ type }) => type === "messageCommitted" || type === "turnCompleted")).toEqual([]);
    } finally {
      await finish(undefined);
      await h.root.services.chat.abort(params);
      peer.closeConnections();
      if (peer.requests.length > 0) {
        await peer.disconnected;
      }
    }
  });
});
