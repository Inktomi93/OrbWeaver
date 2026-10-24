// @subject packages/server/src/domain/chat/verbs/turn.ts
// Actual saved bindings and credentials cross the physical wire; neither funder nor role resolution is replaced.

import { NoConnectionError } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import { B_CHAT_MODEL, saveSpeakerConnection, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";

test("a valid member binding cannot replace the absent host binding or commit a user row", async () => {
  await using room = await speakerRoom({ chat: ["Only the member's own room may use this key."] }, { group: { output: "per-speaker", policy: "list" } });
  const { h } = room;
  const member = await invitePerson(h);
  const memberKey = "owned-speaker-member-key";
  const ownConnection = await saveSpeakerConnection(h, room.peer.baseUrl, "chat", { principal: member, key: memberKey });
  expect(
    (await h.root.services.connection.listBindings({ principal: member })).some((b) => b.task === "chat" && b.binding?.connectionId === ownConnection.id),
  ).toBe(true);
  await h.root.services.connection.remove({ principal: h.owner, connectionId: room.connection.id });
  using presence = new DisposableStack();
  const hostOnline = new AbortController();
  presence.defer(() => hostOnline.abort());
  h.root.app.presence.connect(h.owner.userId, hostOnline.signal);
  await expect(h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "hi" })).rejects.toBeInstanceOf(NoConnectionError);
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual([]);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
  expect(room.peer.requests.some((r) => r.method === "POST" && r.headers.get("authorization") === `Bearer ${memberKey}`)).toBe(false);
});
