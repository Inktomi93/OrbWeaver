// A member's roster reads in a disabled host's room show the host's characters exactly as a room with no host shows
// them, a held pin keeps its persona, a stranger still learns nothing, and re-enabling the host restores the names
// and art.
// @subject packages/server/src/domain/chat/verbs/load-participant-views.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { ParticipantView } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makeAssetBytes } from "@orb/testkit/node/composed";

const CHARACTER_NAME = "Lamplighter";
const PIN_NAME = "Wick";
const PNG = "image/png";
const ROOM = "<room>";

// The room's character seat with the fields that name the room and the seat row lifted out, so two rooms compare.
function characterSeatOf(participants: readonly ParticipantView[]): Omit<ParticipantView, "id" | "chatId" | "joinedAt" | "joinSeq"> {
  const seat = participants.find((participant) => participant.kind === "character");
  if (seat === undefined) {
    throw new Error("the room seats no character");
  }
  const { id: _id, chatId: _chatId, joinedAt: _joinedAt, joinSeq: _joinSeq, ...display } = seat;
  return display;
}

// The wire answer with the asked chat id lifted out, so two rooms' refusals compare byte for byte.
async function answerOf(read: Promise<unknown>, chatId: ChatId): Promise<unknown> {
  return await read.then(
    () => "served",
    (error: unknown) =>
      error instanceof Error && "code" in error ? { code: error.code, message: error.message.replaceAll(chatId, ROOM), name: error.name } : error,
  );
}

test("a member's roster in a disabled host's room shows the host's characters as a hostless room does, until the host is enabled again", async () => {
  await using root = await createServerHarness({ env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" } });
  // The box owner is the admin and cannot be disabled, so a second account hosts.
  const admin = await root.principalFor(root.ownerId);
  const host = await root.principalFor((await root.actor()).id);
  const member = await root.principalFor((await root.actor()).id);
  const joiner = await root.principalFor((await root.actor()).id);
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const joinerCaller = await root.internalCallerFor(joiner.userId);
  const stranger = await root.internalCallerFor((await root.actor()).id);
  const avatar = await root.services.assets.store({ principal: host, bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), kind: "avatar", mime: PNG });
  const card = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({
      handle: "disabled-host-roster",
      name: CHARACTER_NAME,
      description: "A keeper of the room's lamps.",
      avatarAssetId: avatar.assetId,
    }),
  });
  const pin = await root.services.persona.create({
    principal: host,
    input: createPersonaSchema.parse({ name: PIN_NAME, description: "The host's pinned player." }),
  });
  const seatMember = async (): Promise<ChatId> => {
    const chatId = (await hostCaller.chat.startChat({ characterIds: [card.id], opening: "none", anchorPersonaId: pin.id })).chat.id;
    const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
    await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
    return chatId;
  };
  const chatId = await seatMember();
  // The joiner's invite is issued while the host is enabled and accepted after the disable.
  const joinerInvite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: joiner.handle } });
  // The room with no host: its host left, which archives it, and the member still holds a seat.
  const hostless = await seatMember();
  await hostCaller.invites.selfLeave({ chatId: hostless });
  const unknown = root.idSource.typeId(ID_PREFIX.chat);
  const portraitsOf = async (room: ChatId): Promise<unknown> =>
    (await memberCaller.chat.listChats({ includeArchived: true })).items.find((item) => item.id === room)?.participantPortraits;
  const setHostEnabled = (enabled: boolean): Promise<unknown> => root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled });

  // Positive controls: an enabled host's character carries its card name and art for the member and the host alike.
  const named = characterSeatOf((await memberCaller.chat.getChat({ chatId })).participants);
  expect(named).toMatchObject({ characterId: card.id, displayName: CHARACTER_NAME, avatarAssetId: avatar.assetId });
  expect(named.avatarHash).not.toBeNull();
  expect(characterSeatOf((await hostCaller.chat.getChat({ chatId })).participants)).toEqual(named);
  const hostlessSeat = characterSeatOf((await memberCaller.chat.getChat({ chatId: hostless })).participants);
  expect(hostlessSeat).not.toEqual(named);
  const hostlessPortraits = await portraitsOf(hostless);
  expect(hostlessPortraits).toMatchObject([{ characterId: card.id }]);
  const namedPortraits = await portraitsOf(chatId);
  expect(namedPortraits).toMatchObject([{ characterId: card.id, name: CHARACTER_NAME, avatarHash: named.avatarHash }]);
  const strangerAnswer = await answerOf(stranger.chat.getChat({ chatId }), chatId);
  expect(strangerAnswer).toEqual(await answerOf(stranger.chat.getChat({ chatId: unknown }), unknown));

  await setHostEnabled(false);
  const withheld = await memberCaller.chat.getChat({ chatId });
  expect(characterSeatOf(withheld.participants)).toEqual(hostlessSeat);
  expect(await portraitsOf(chatId)).toEqual(hostlessPortraits);
  const joined = await joinerCaller.invites.acceptInvite({ inviteId: joinerInvite.invite.id });
  expect(characterSeatOf(joined.chat.participants)).toEqual(hostlessSeat);
  // The pin holds (D315): the room still reads the disabled host's persona by name.
  expect(withheld).toMatchObject({ anchorPersonaId: pin.id, anchorState: "held" });
  expect(withheld.identities).toContainEqual(expect.objectContaining({ kind: "persona", id: pin.id, name: PIN_NAME }));
  // A disabled host's room tells a stranger nothing new: the answer an unknown id gets, as before the disable.
  expect(await answerOf(stranger.chat.getChat({ chatId }), chatId)).toEqual(strangerAnswer);
  expect(await answerOf(stranger.chat.getChat({ chatId: unknown }), unknown)).toEqual(strangerAnswer);

  await setHostEnabled(true);
  expect(characterSeatOf((await memberCaller.chat.getChat({ chatId })).participants)).toEqual(named);
  expect(characterSeatOf((await joinerCaller.chat.getChat({ chatId })).participants)).toEqual(named);
  expect(characterSeatOf((await hostCaller.chat.getChat({ chatId })).participants)).toEqual(named);
  expect(await portraitsOf(chatId)).toEqual(namedPortraits);
});
