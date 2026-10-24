// @subject tests/support/node/factories/rows/chat.ts

import { closeDb } from "@orb/db";
import { CHAT_OP_CODES } from "../../../../packages/server/src/domain/chat/contract/errors.ts";
import { seedRecallRoom } from "../corpus-actors.ts";
import { freshHeldDb } from "../db.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { captureChatHandoffResumption } from "./rows/chat.ts";
import { seedChatInviteRows, seedInvitedChatParticipantRows } from "./rows.ts";

test("real accepted host handoff exposes its durable resumption only until accepted-host completion and preserves actual copied actor IDs", async () => {
  const held = await freshHeldDb();
  await using dbLifetime = new AsyncDisposableStack();
  dbLifetime.defer(() => closeDb(held.db));
  await using root = await createServerHarness({ db: held.db });
  const owner = await root.principalFor(root.ownerId);
  const memberRow = await root.actor();
  const member = await root.principalFor(memberRow.id);
  const memberCaller = await root.internalCallerFor(member.userId);
  const chatId = await seedRecallRoom(await root.internalCallerFor(root.ownerId));
  const before = await root.services.chat.getChat({ principal: owner, chatId });
  const sourceSeat = before.participants.find((participant) => participant.kind === "character");
  if (sourceSeat === undefined || sourceSeat.characterId === null) {
    throw new Error("the actual founding room has no character seat to hand off");
  }
  const invite = await seedChatInviteRows(root, { principal: owner, chatId, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipantRows(root, { principal: member, inviteId: invite.id });
  await root.services.chat.nominateHostHandoff({ principal: owner, chatId, userId: member.userId, offer: { copyCharacters: true, copyGmPreset: false } });
  const completion = held.hold(/^delete from "chat_handoff_resumptions"/u);
  const accepting = root.services.chat.acceptHostHandoff({ principal: member, chatId });
  try {
    await Promise.race([
      completion.reached,
      accepting.then(() => {
        throw new Error("the real handoff completed before its held completion claim");
      }),
    ]);
    const marker = await captureChatHandoffResumption(root.db, chatId);
    const accepted = await memberCaller.chat.getChat({ chatId });
    const copiedSeat = accepted.participants.find((participant) => participant.id === sourceSeat.id);
    if (copiedSeat === undefined || copiedSeat.characterId === null) {
      throw new Error("the real handoff swap did not retain and rekey the character seat");
    }
    expect(copiedSeat.characterId).not.toBe(sourceSeat.characterId);
    expect(marker).toMatchObject({
      chatId,
      acceptedByUserId: member.userId,
      actorRekeys: [{ sourceCharacterId: sourceSeat.characterId, characterId: copiedSeat.characterId }],
    });
    expect(accepted.participants.filter((participant) => participant.role === "host").map((participant) => participant.userId)).toEqual([member.userId]);
    await expect(root.services.chat.acceptHostHandoff({ principal: owner, chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.notTurnOwner });
    expect(await captureChatHandoffResumption(root.db, chatId)).toEqual(marker);
  } finally {
    completion.release();
    await accepting;
  }
  expect(await captureChatHandoffResumption(root.db, chatId)).toBeUndefined();
  const completed = await memberCaller.chat.getChat({ chatId });
  expect(completed.pendingHostUserId).toBeNull();
  expect(completed.participants.filter((participant) => participant.role === "host").map((participant) => participant.userId)).toEqual([member.userId]);
});
