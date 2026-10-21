// @subject packages/server/src/domain/chat/engine/engine.ts
// The real member author and frozen host connection remain distinct from retained canon accounting.
import "@orb/testkit/node/composed-real.ts";
import { characterStats, dailyStats, ownerStats } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq } from "drizzle-orm";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

test("a real member's send credits the retained host cohort and speaker, never the initiating member", async () => {
  await using h = await coreHttpRoom([
    (): Response =>
      coreSse([
        coreFrame({ choices: [{ delta: { content: "The host-funded reply." } }] }),
        terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
      ]),
  ]);
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const hostBinding = (await h.root.services.connection.listBindings({ principal: h.owner })).find((binding) => binding.task === "chat")?.binding;
  if (hostBinding === undefined || hostBinding === null || hostBinding.connectionId === null) {
    throw new Error("the actual funding room has no saved host connection");
  }
  await h.root.services.stats.reconcile(member.userId);
  const memberBefore = await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, member.userId));
  const online = new AbortController();
  using presence = new DisposableStack();
  presence.defer(() => online.abort());
  h.root.app.presence.connect(h.owner.userId, online.signal);
  const outcome = await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "The member asks the retained keeper." });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "user")).toMatchObject([{ authorUserId: member.userId }]);
  expect(outcome.messages.filter((message) => message.role === "assistant")).toMatchObject([
    { content: "The host-funded reply.", authorUserId: null, characterId: h.characters[0]?.id, connectionId: hostBinding.connectionId },
  ]);
  expect(await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId))).toMatchObject([
    { userTurns: 1, assistantTurns: 1, tokensIn: 4, tokensOut: 2 },
  ]);
  expect(await h.root.db.select().from(characterStats)).toMatchObject([{ characterId: h.characters[0]?.id, assistantTurns: 1, tokensIn: 4, tokensOut: 2 }]);
  expect(await h.root.db.select().from(dailyStats).where(eq(dailyStats.ownerId, h.owner.userId))).toMatchObject([
    { userTurns: 1, assistantTurns: 1, tokensIn: 4, tokensOut: 2 },
  ]);
  expect(await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, member.userId))).toEqual(memberBefore);
});
