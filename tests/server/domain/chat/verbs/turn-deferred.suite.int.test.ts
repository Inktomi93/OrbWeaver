// @subject packages/server/src/domain/chat/verbs/turn.ts
// Queued identity and physical generation are observed across the actual host-offline drain.
import { messages, pendingTurns } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

test("a member's host-offline send queues the frozen identity and the real host drain consumes it once", async () => {
  await using h = await textRoom(["The owed reply."], { group: { policy: "list", output: "per-speaker" } });
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  expect(h.root.app.presence.read(h.owner.userId).online).toBe(false);
  const outcome = await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "An owed reply.", timeZone: UTC_TIME_ZONE });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "user", authorUserId: member.userId, content: "An owed reply." });
  const queued = await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, h.chatId));
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ triggeredBy: member.userId, runAsUserId: h.owner.userId, timeZone: UTC_TIME_ZONE });
  expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toEqual([]);
  const online = new AbortController();
  h.root.app.presence.connect(h.owner.userId, online.signal);
  try {
    expect(await h.root.services.chat.drainDeferredTurns({ hostUserId: h.owner.userId })).toEqual({ ran: 1, dropped: 0 });
    await h.root.settleBackground();
    expect(await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, h.chatId))).toEqual([]);
    const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
    expect(canon.map(({ role }) => role)).toEqual(["user", "assistant"]);
    expect(canon[1]?.characterId).toBe(h.characters[0]?.id);
    expect(await h.root.services.chat.drainDeferredTurns({ hostUserId: h.owner.userId })).toEqual({ ran: 0, dropped: 0 });
    expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
  } finally {
    online.abort();
  }
});
