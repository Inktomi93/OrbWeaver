// @subject packages/server/src/domain/chat/verbs/turn.ts
// Actual saved bindings and credentials cross the physical wire; neither funder nor role resolution is replaced.

import type { MessageView, TurnOutcome } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { NoConnectionError } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import { B_CHAT_MODEL, B_HOST_KEY, saveSpeakerConnection, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";
import { AUTO_BEATS, memberAutoBeats, NEXT_HOST_KEY, twoPartyHandoff } from "./turn-funding.fixtures.ts";

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

// The committed assistant views of one outcome, as the room's canon reads them back.
async function funding(h: ChatRoot, reader: Principal, outcome: TurnOutcome): Promise<Pick<MessageView, "connectionId" | "tokensIn" | "tokensOut">[]> {
  const ids = new Set(outcome.messages.filter(({ role }) => role === "assistant").map(({ id }) => id));
  return (await readRoomCanon(h.root, reader, h.chatId))
    .filter(({ id }) => ids.has(id))
    .map(({ connectionId, tokensIn, tokensOut }) => ({ connectionId, tokensIn, tokensOut }));
}

test("member-started automatic beats retain the actual initiator while the host funds each native call", async () => {
  await using beats = await memberAutoBeats();
  const { room, member, outcome } = beats;
  const { h } = room;
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.find((m) => m.role === "user")?.authorUserId).toBe(member.userId);
  expect(outcome.messages.filter((m) => m.role === "assistant")).toHaveLength(AUTO_BEATS);
  expect(beats.triggeredBy).toEqual(Array.from({ length: AUTO_BEATS }, () => member.userId));
  const physical = room.peer.requests.filter((r) => r.method === "POST" && new URL(r.url).pathname === "/v1/chat/completions");
  expect(await speakerInputs(physical, B_CHAT_MODEL)).toHaveLength(AUTO_BEATS);
  expect(physical.map((r) => r.headers.get("authorization"))).toEqual(Array.from({ length: AUTO_BEATS }, () => `Bearer ${B_HOST_KEY}`));
  expect(await funding(h, h.owner, outcome)).toEqual(
    Array.from({ length: AUTO_BEATS }, () => ({ connectionId: room.connection.id, tokensIn: 4, tokensOut: 2 })),
  );
  expect(await h.root.services.stats.overview(h.owner.userId)).toMatchObject({ userTurns: 1, assistantTurns: AUTO_BEATS, tokensIn: 16, tokensOut: 8 });
  expect(await h.root.services.stats.overview(member.userId)).toEqual(beats.memberBefore);
});

test("real two-party host handoff transfers subsequent native route and liability", async () => {
  await using handoff = await twoPartyHandoff();
  const { room, nextHost, nextConnection, before, after } = handoff;
  const { h } = room;
  expect(before.aborted).toBe(false);
  expect(after.aborted).toBe(false);
  expect(before.messages.find((m) => m.role === "user")?.authorUserId).toBe(nextHost.userId);
  expect(after.messages.find((m) => m.role === "user")?.authorUserId).toBe(h.owner.userId);
  const physical = room.peer.requests.filter((r) => r.method === "POST" && new URL(r.url).pathname === "/v1/chat/completions");
  expect(await speakerInputs(physical, B_CHAT_MODEL)).toHaveLength(2);
  expect(physical.map((r) => r.headers.get("authorization"))).toEqual([`Bearer ${B_HOST_KEY}`, `Bearer ${NEXT_HOST_KEY}`]);
  expect(await funding(h, nextHost, before)).toEqual([{ connectionId: room.connection.id, tokensIn: 4, tokensOut: 2 }]);
  expect(await funding(h, nextHost, after)).toEqual([{ connectionId: nextConnection.id, tokensIn: 4, tokensOut: 2 }]);
  const actualSeats = await h.root.services.chat.listParticipants({ principal: nextHost, chatId: h.chatId });
  expect(actualSeats.some((s) => s.characterId === after.messages.find((m) => m.role === "assistant")?.characterId && s.leftSeq === null)).toBe(true);
});
