import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { loadWindowAnchor, loadWindowRange } from "../../../../../packages/server/src/domain/chat/persistence/message-window.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedMessage } from "../_support.ts";

test("secondary identities and every range endpoint stay within the resolved room and floor", async () => {
  const db = await freshDb();
  const room = await seedChat(db, "window", { id: mintTypeId(ID_PREFIX.chat) });
  const foreignRoom = await seedChat(db, "foreign", { id: mintTypeId(ID_PREFIX.chat) });
  const before = await seedMessage(db, room, 19);
  const visible = await seedMessage(db, room, 20);
  const last = await seedMessage(db, room, 22);
  const foreign = await seedMessage(db, foreignRoom, 20);
  expect(await loadWindowAnchor(db, room, foreign.messageId, 20)).toBeNull();
  expect(await loadWindowAnchor(db, room, before.messageId, 20)).toBeNull();
  expect(await loadWindowAnchor(db, room, visible.messageId, 20)).toEqual({ id: visible.messageId, seq: 20 });
  expect(await loadWindowRange(db, room, { seqStart: 1, seqEnd: 22, floorSeq: 20 })).toEqual({
    first: { id: visible.messageId, seq: 20 },
    last: { id: last.messageId, seq: 22 },
  });
});
