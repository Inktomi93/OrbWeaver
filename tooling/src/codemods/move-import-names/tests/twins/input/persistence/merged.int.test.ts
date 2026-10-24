import { seedPeerLease } from "@orb/testkit/node/composed";
import { captureChatLock } from "@orb/testkit/node/rows";

test("lease row", async () => {
  await using peer = await seedPeerLease(h.root, { chatId: h.chatId });
  expect(await captureChatLock(h.root.db, h.chatId)).toEqual(peer.row);
});
