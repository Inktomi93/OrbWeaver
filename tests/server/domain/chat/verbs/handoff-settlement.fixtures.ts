// Owed member turns, a nominee and the host-authority checks a handoff passes through, read via the public verbs.

import { createCharacterSchema } from "@orb/contracts/character";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect } from "@orb/testkit/node";
import { invitePerson } from "../persona-cache-physical.ts";
import type { SpeakerRoom } from "./speaker-funding-physical.ts";
import { saveSpeakerConnection } from "./speaker-funding-physical.ts";

export const ARIA = createCharacterSchema.parse({ handle: "owed-aria", name: "Aria", description: "Only the outgoing owner knows this travelling knight." });
export const LIST = { output: "per-speaker", policy: "list", allowSelfResponses: true } as const;
const NEXT_KEY = "owned-settlement-recipient-key";

export function providerRefusal(): Response {
  return Response.json({ error: { message: "Controlled owed response refusal", type: "invalid_request_error" } }, { status: 400 });
}

export async function queued(room: SpeakerRoom, member: SpeakerRoom["h"]["owner"], content = "The member is owed a reply."): Promise<void> {
  const result = await room.h.root.services.chat.send({ principal: member, chatId: room.h.chatId, content, timeZone: UTC_TIME_ZONE });
  expect(result.aborted).toBe(false);
  expect(result.messages.map((m) => m.role)).toEqual(["user"]);
}

export async function nominee(room: SpeakerRoom): Promise<SpeakerRoom["h"]["owner"]> {
  const { h } = room;
  const recipient = await invitePerson(h);
  await saveSpeakerConnection(h, room.peer.baseUrl, "chat", { principal: recipient, key: NEXT_KEY });
  await h.root.services.chat.nominateHostHandoff({
    principal: h.owner,
    chatId: h.chatId,
    userId: recipient.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  return recipient;
}

export async function stillOutgoing(room: SpeakerRoom, recipient: SpeakerRoom["h"]["owner"]): Promise<void> {
  const { h } = room;
  expect((await h.root.services.character.list({ principal: recipient })).items).toEqual([]);
  expect((await h.caller.chat.getChat({ chatId: h.chatId })).participants.filter(({ role }) => role === "host")).toMatchObject([
    { userId: h.owner.userId, leftSeq: null },
  ]);
  expect(await h.root.services.chat.getChat({ principal: h.owner, chatId: h.chatId })).toMatchObject({ pendingHostUserId: recipient.userId });
}

export async function transferred(room: SpeakerRoom, recipient: SpeakerRoom["h"]["owner"]): Promise<void> {
  const { h } = room;
  // The wire roster: the service hands back captured role data, the router its public role code.
  const { participants: seats } = await (await h.root.internalCallerFor(recipient.userId)).chat.getChat({ chatId: h.chatId });
  expect(seats.filter(({ role }) => role === "host")).toMatchObject([{ userId: recipient.userId, leftSeq: null }]);
  const copies = (await h.root.services.character.list({ principal: recipient })).items;
  expect(copies).toHaveLength(1);
  expect(copies[0]?.id).not.toBe(h.characters[0]?.id);
  expect(seats).toEqual(expect.arrayContaining([expect.objectContaining({ characterId: copies[0]?.id, leftSeq: null })]));
}
