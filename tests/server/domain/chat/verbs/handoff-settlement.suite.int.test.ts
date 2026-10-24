// @subject packages/server/src/domain/chat/verbs/admission.ts
// @subject packages/server/src/domain/chat/substrate/handoff-barrier.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
import { setImmediate as physicalTurn } from "node:timers/promises";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { CHAT_OP_CODES, ChatNotFoundError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import { ARIA, LIST, nominee, stillOutgoing, transferred } from "./handoff-settlement.fixtures.ts";
import { B_CHAT_MODEL, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";

test("locked and lock-free turns stay concurrent while handoff closes only their room and Stop remains owner-only", async () => {
  await using room = await speakerRoom({ chat: ["The locked work ends.", "The lock-free work ends."], holdChat: true }, { characters: [ARIA], group: LIST });
  const { h } = room;
  const recipient = await nominee(room);
  const member = await invitePerson(h);
  const outsider = await h.root.principalFor((await h.root.actor()).id);
  const first = h.characters[0];
  if (first === undefined) {
    throw new Error("the actual concurrent room has no character");
  }
  const locked = h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: first.id });
  const lockedDone = Promise.allSettled([locked]);
  let generated: ReturnType<typeof h.root.services.chat.generate> | undefined;
  let generatedDone = Promise.resolve<PromiseSettledResult<Awaited<ReturnType<typeof h.root.services.chat.generate>>>[]>([]);
  let accepted: Promise<void> | undefined;
  let joined = Promise.resolve<PromiseSettledResult<void>[]>([]);
  try {
    await room.peer.reached;
    generated = h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, timeZone: UTC_TIME_ZONE });
    generatedDone = Promise.allSettled([generated]);
    await expect.poll(async () => (await speakerInputs(room.peer.requests, B_CHAT_MODEL)).length).toBe(2);
    accepted = h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId });
    joined = Promise.allSettled([accepted]);
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    await stillOutgoing(room, recipient);
    await expect(
      h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "blocked", timeZone: UTC_TIME_ZONE }),
    ).rejects.toMatchObject({ code: CHAT_OP_CODES.locked });
    await expect(h.root.services.chat.acceptHostHandoff({ principal: member, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.notTurnOwner });
    await expect(h.root.services.chat.acceptHostHandoff({ principal: outsider, chatId: h.chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(
      h.root.services.chat.send({ principal: outsider, chatId: h.chatId, content: "no foreign busy oracle", timeZone: UTC_TIME_ZONE }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(h.root.services.chat.abort({ principal: recipient, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.notTurnOwner });
    const other = await h.root.services.chat.startChat({ principal: h.owner, characterIds: [first.id], opening: "none" });
    expect(
      (await h.root.services.chat.commitMessage({ principal: h.owner, chatId: other.chat.id, content: "another room is open", timeZone: UTC_TIME_ZONE }))
        .messages,
    ).toHaveLength(1);
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    expect((await locked).aborted).toBe(true);
    expect((await generated).aborted).toBe(true);
    await accepted;
    expect(await readRoomCanon(room.h.root, room.h.owner, room.h.chatId)).toEqual([]);
    await transferred(room, recipient);
  } finally {
    room.peer.release();
    await lockedDone;
    await generatedDone;
    await joined;
  }
});
