import { captureChatLock, seedPeerLeaseRows } from "@orb/testkit/node/rows";

test("lease row", async () => {
  await using peer = await seedPeerLeaseRows(h.root, { chatId: h.chatId });
  expect(await captureChatLock(h.root.db, h.chatId)).toEqual(peer.row);
});
