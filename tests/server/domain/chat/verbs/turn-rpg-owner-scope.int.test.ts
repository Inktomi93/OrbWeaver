// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/flush-barrier.ts
import { expect, test } from "@orb/testkit/node";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreHeldReply, coreSse } from "../engine/core-physical.ts";
import { turnRpgReply, turnRpgRoom } from "./turn-rpg-physical.ts";

test("a caller cancels only its own post-generation state round while another owner's native generation stays active", async () => {
  const foreign = coreHeldReply();
  const ownState = coreHeldReply();
  await using h = await turnRpgRoom(
    [
      foreign.respond,
      (): Response =>
        coreSse([
          coreFrame({ choices: [{ delta: { content: "The member's keeper finishes speaking." } }] }),
          terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
        ]),
      ownState.respond,
      (): Response => turnRpgReply(""),
    ],
    {},
    "cheap",
  );
  const member = await h.root.principalFor((await h.root.actor({ role: "user" })).id);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const pending: Promise<void>[] = [];
  try {
    // Both gathers enter before a flush exists; starting the foreign turn later would wait at the barrier.
    const foreignTurn = h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
    pending.push(foreignTurn.then(() => undefined));
    const foreignSignal = await foreign.reached;
    const memberTurn = h.root.services.chat.generate({ principal: member, chatId: h.chatId });
    pending.push(memberTurn.then(() => undefined));
    const ownSignal = await ownState.reached;
    expect((await memberTurn).aborted).toBe(false);
    expect(ownSignal.aborted).toBe(false);
    expect(foreignSignal.aborted).toBe(false);
    const params = { principal: member, chatId: h.chatId };
    await expect(h.root.services.chat.abort(params)).resolves.toBeUndefined();
    expect(ownSignal.aborted).toBe(true);
    expect(foreignSignal.aborted).toBe(false);
    await h.root.settleBackground();
    await expect(h.root.services.chat.abort(params)).rejects.toMatchObject({ code: "not_turn_owner" });
    expect(foreignSignal.aborted).toBe(false);
    expect((await h.root.services.rpg.getTrackerView(params)).ambient).toBeNull();
    foreign.release();
    const completed = await foreignTurn;
    expect(completed.aborted).toBe(false);
    await h.root.settleBackground();
    expect((await h.root.services.chat.listMessages(params)).messages).toMatchObject([
      { role: "assistant", content: "The member's keeper finishes speaking." },
      { role: "assistant", content: "The held reply finishes." },
    ]);
  } finally {
    ownState.release();
    foreign.release();
    await Promise.all(pending);
    await h.root.settleBackground();
  }
});
