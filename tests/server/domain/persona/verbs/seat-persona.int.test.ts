// A seat's persona: switching it fans personaSwitched onto the room's live channel with a durable seq, and leaving
// the room drops it, so removing the persona re-seats only the seats still in a room.
// @subject packages/server/src/domain/persona/verbs/set-active.ts
// @subject packages/server/src/domain/persona/verbs/remove.ts

import { createPersonaSchema } from "@orb/contracts/persona";
import type { ChatId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test("switching the seat's persona reaches the room's live channel as personaSwitched with a durable seq, and flips the seat", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const persona = await root.services.persona.create({ principal, input: createPersonaSchema.parse({ name: "Alex", description: "Alex description." }) });
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });

  // The subscription buffers from the call, so it is opened before the switch.
  const stop = new AbortController();
  const live = root.app.liveBuses.chat.subscribeChatEvents(chat.id, stop.signal)[Symbol.asyncIterator]();
  const next = live.next();
  try {
    await root.services.persona.setActivePersona({ principal, chatId: chat.id, targetUserId: root.ownerId, personaId: persona.id });
    const heard = await next;
    expect(heard.done).toBe(false);
    expect(heard.value?.event).toEqual({ type: "personaSwitched", chatId: chat.id, from: null, to: persona.id });
    expect(heard.value?.seq).toBeGreaterThan(0);
    expect((await caller.chat.getChat({ chatId: chat.id })).viewerActivePersonaId).toBe(persona.id);
  } finally {
    const closed = live.next().catch(() => undefined);
    stop.abort();
    await closed;
  }
});

test("a member who left a room is no longer a seat there, and removing their persona re-seats the room they are still in", async () => {
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "forward-header", ["AUTH_FALLBACK"]: "deny" } });
  const host = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const seated = (
    await root.services.persona.create({ principal: member, input: createPersonaSchema.parse({ name: "Seated", description: "Seated description." }) })
  ).id;
  const fallback = (
    await root.services.persona.create({ principal: member, input: createPersonaSchema.parse({ name: "Fallback", description: "Fallback description." }) })
  ).id;
  await root.services.settings.updateUserSettingsSection({
    principal: member,
    input: { section: "seeds", patch: { currentPersonaId: seated, defaultPersonaId: fallback } },
  });

  const roomOf = async (): Promise<ChatId> => {
    const chatId = (await hostCaller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
    const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
    await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
    await root.services.persona.setActivePersona({ principal: member, chatId, targetUserId: member.userId, personaId: seated });
    return chatId;
  };
  const present = await roomOf();
  const left = await roomOf();
  await root.services.chat.selfLeave({ principal: member, chatId: left });
  const seatOf = async (chatId: ChatId): Promise<{ readonly persona: unknown; readonly left: boolean } | undefined> => {
    const seat = (await hostCaller.chat.getChat({ chatId })).participants.find((participant) => participant.userId === member.userId);
    return seat === undefined ? undefined : { persona: seat.activePersonaId, left: seat.leftSeq !== null };
  };
  expect(await seatOf(present)).toEqual({ persona: seated, left: false });
  // A left seat is not served by the participants view, so there is no persona left on it to re-point.
  expect(await seatOf(left)).toBeUndefined();

  await root.services.persona.remove({ principal: member, personaId: seated });

  expect(await seatOf(present)).toEqual({ persona: fallback, left: false });
  expect(await seatOf(left)).toBeUndefined();
});
