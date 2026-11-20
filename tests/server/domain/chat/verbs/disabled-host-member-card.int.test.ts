// A member's roster card read in a disabled host's room answers exactly as in a room with no host, and a stranger still
// learns nothing; re-enabling the host serves the card again.
// @subject packages/server/src/domain/chat/verbs/read.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const DESCRIPTION = "disabled-host-card-sheet-description";
const STEERING = "disabled-host-card-steering";
const ROOM = "<room>";

// The wire answer with the asked chat id lifted out, so two rooms' refusals compare byte for byte.
async function answerOf(read: Promise<unknown>, chatId: ChatId): Promise<unknown> {
  return await read.then(
    () => "served",
    (error: unknown) =>
      error instanceof Error && "code" in error ? { code: error.code, message: error.message.replaceAll(chatId, ROOM), name: error.name } : error,
  );
}

test("a member's card read in a disabled host's room answers as a hostless room does, and re-enabling the host serves it again", async () => {
  await using root = await createServerHarness({ env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" } });
  // The box owner is the admin and cannot be disabled, so a second account hosts.
  const admin = await root.principalFor(root.ownerId);
  const host = await root.principalFor((await root.actor()).id);
  const member = await root.principalFor((await root.actor()).id);
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const stranger = await root.internalCallerFor((await root.actor()).id);
  const card = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "disabled-host-card", name: "Lamplighter", description: DESCRIPTION, systemPrompt: STEERING }),
  });
  const seatMember = async (): Promise<ChatId> => {
    const chatId = (await hostCaller.chat.startChat({ characterIds: [card.id], opening: "none" })).chat.id;
    const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
    await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
    return chatId;
  };
  const chatId = await seatMember();
  // The room with no host: its host left, and the member still holds a seat.
  const hostless = await seatMember();
  await hostCaller.invites.selfLeave({ chatId: hostless });
  const unknown = root.idSource.typeId(ID_PREFIX.chat);
  const read = (caller: typeof memberCaller, room: ChatId): Promise<unknown> =>
    caller.chat.getMemberCard({ chatId: room, characterId: card.id, timeZone: UTC_TIME_ZONE });
  const setHostEnabled = (enabled: boolean): Promise<unknown> => root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled });

  // Positive controls: the member reads the sheet and the host the whole card while the host is enabled.
  expect(await read(memberCaller, chatId)).toMatchObject({ visibility: "sheet", description: DESCRIPTION, systemPrompt: null });
  expect(await read(hostCaller, chatId)).toMatchObject({ visibility: "full", description: DESCRIPTION, systemPrompt: STEERING });
  const hostlessAnswer = await answerOf(read(memberCaller, hostless), hostless);
  expect(hostlessAnswer).toMatchObject({ code: "NOT_FOUND" });
  const strangerAnswer = await answerOf(read(stranger, chatId), chatId);
  expect(strangerAnswer).toEqual(await answerOf(read(stranger, unknown), unknown));

  await setHostEnabled(false);
  expect(await answerOf(read(memberCaller, chatId), chatId)).toEqual(hostlessAnswer);
  // A disabled host's room tells a stranger nothing new: the answer an unknown id gets, as before the disable.
  expect(await answerOf(read(stranger, chatId), chatId)).toEqual(strangerAnswer);
  expect(await answerOf(read(stranger, unknown), unknown)).toEqual(strangerAnswer);

  await setHostEnabled(true);
  expect(await read(memberCaller, chatId)).toMatchObject({ visibility: "sheet", description: DESCRIPTION, systemPrompt: null });
  expect(await read(hostCaller, chatId)).toMatchObject({ visibility: "full", description: DESCRIPTION, systemPrompt: STEERING });
});
