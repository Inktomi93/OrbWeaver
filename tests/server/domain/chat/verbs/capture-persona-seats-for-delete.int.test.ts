// The reseat after a persona delete writes only the seats that are still present and still empty at reseat time:
// a seat the owner switched between capture and reseat keeps their choice, and an owner who left in that gap is
// skipped instead of failing the whole delete.
// @subject packages/server/src/domain/chat/verbs/capture-persona-seats-for-delete.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { createPersonaSchema } from "@orb/contracts/persona";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { ChatId, PersonaId } from "@orb/kit/ids";
import { createCapturePersonaSeatsForDelete, setParticipantActivePersona } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test("a reseat keeps a seat switched after capture and skips an owner who left, reseating the seats still empty", async () => {
  await using root = await createServerHarness({ env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" } });
  const host = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const mint = async (name: string): Promise<PersonaId> =>
    (await root.services.persona.create({ principal: member, input: createPersonaSchema.parse({ name, description: `${name} description.` }) })).id;
  const doomed = await mint("Doomed");
  const switched = await mint("Switched");
  const fallback = await mint("Fallback");

  const roomWearing = async (): Promise<ChatId> => {
    const chatId = (await hostCaller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
    const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
    await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
    await root.services.persona.setActivePersona({ principal: member, chatId, targetUserId: member.userId, personaId: doomed });
    return chatId;
  };
  const stillEmpty = await roomWearing();
  const switchedAway = await roomWearing();
  const leaves = await roomWearing();

  const handle = databaseHandle(root.db);
  const reseated: ChatId[] = [];
  const capture = createCapturePersonaSeatsForDelete({
    db: handle,
    setActivePersona: async (chatId, targetUserId, personaId) => {
      reseated.push(chatId);
      await setParticipantActivePersona(handle, async () => true, { chatId, targetUserId, personaId });
    },
  });
  const reseat = await capture(member.userId, doomed);

  // The two writers between capture and reseat: the owner switches one seat and leaves another room.
  await root.services.persona.setActivePersona({ principal: member, chatId: switchedAway, targetUserId: member.userId, personaId: switched });
  await root.services.chat.selfLeave({ principal: member, chatId: leaves });
  // The delete's own effect on the seat still wearing the persona: the FK empties it.
  await root.services.persona.setActivePersona({ principal: member, chatId: stillEmpty, targetUserId: member.userId, personaId: null });

  await reseat(fallback);

  const seatOf = async (chatId: ChatId): Promise<unknown> =>
    (await hostCaller.chat.getChat({ chatId })).participants.find((p) => p.userId === member.userId)?.activePersonaId;
  expect(reseated).toEqual([stillEmpty]);
  expect(await seatOf(stillEmpty)).toBe(fallback);
  expect(await seatOf(switchedAway)).toBe(switched);
});
