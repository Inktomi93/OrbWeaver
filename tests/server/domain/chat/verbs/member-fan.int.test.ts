// A host's chat-row write fans chatsChanged to every present member's channel, never only to the actor.
// @subject packages/server/src/domain/chat/verbs/emit-chat-changed.ts
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { UserId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

// A publish after the write marks the end of what the write delivered, so a missing event cannot hang the read.
const END: UserBusEvent = { type: "charactersChanged" };

test("a host title change reaches the co-member's live channel and no outsider's", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "forward-header", fallback: "deny" } });
  const host = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const outsider = (await root.actor()).id;
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const chatId = (await hostCaller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
  await root.settleBackground();

  const stop = new AbortController();
  const channels = [host.userId, member.userId, outsider].map((userId) => ({
    userId,
    events: root.app.liveBuses.user.subscribeUserEvents(userId, stop.signal)[Symbol.asyncIterator](),
  }));
  const delivered = async ({ userId, events }: (typeof channels)[number]): Promise<readonly UserBusEvent[]> => {
    root.app.liveBuses.user.publishUserEvent(userId, END);
    const seen: UserBusEvent[] = [];
    for (let next = await events.next(); !next.done && next.value !== END; next = await events.next()) {
      seen.push(next.value);
    }
    return seen;
  };
  try {
    await hostCaller.chat.updateTitle({ chatId, title: "fanned to the room" });
    const received = new Map<UserId, readonly UserBusEvent[]>();
    for (const channel of channels) {
      received.set(channel.userId, await delivered(channel));
    }
    expect(received.get(host.userId)).toContainEqual({ type: "chatsChanged", chatId });
    expect(received.get(member.userId)).toContainEqual({ type: "chatsChanged", chatId });
    expect(received.get(outsider)).toEqual([]);
  } finally {
    stop.abort();
  }
});
