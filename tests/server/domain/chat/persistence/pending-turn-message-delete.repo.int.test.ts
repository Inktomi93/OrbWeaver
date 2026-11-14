// A queued turn names the send it answers. Deleting that send keeps the owed turn, its message id cleared, and the
// drained reply is told about no roll, never a later send's. The database is built by the shipped migration chain,
// so the case reads the delete rule the migration SQL declares, not the one the schema file states.
// @subject packages/db/src/migrations/0014_pending-turn-message-id.sql
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { PROSE_SLOTS } from "@orb/contracts/prose";
import { createDb, pendingTurns, runMigrations } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { asc, eq } from "drizzle-orm";
import { wireOf, wireText } from "../scenario-physical.ts";
import { turnRpgReply, turnRpgRoom } from "../verbs/turn-rpg-physical.ts";

const ROLL_NOTE = PROSE_SLOTS["rpg.reminder.playerRolledDice"].text;
const STAMP = "[dice: d20 → 7]";
const QUEUE_STEP_MS = 1000;

test("deleting a queued send keeps its owed turn, which drains told about no roll", async () => {
  using migrated = ownDb(await createDb(":memory:"));
  await runMigrations(migrated.db, SHIPPED_MIGRATIONS);
  await using h = await turnRpgRoom(
    Array.from({ length: 2 }, () => (): Response => turnRpgReply("The keeper nods.")),
    { server: { db: migrated.db } },
  );
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const queue = async (content: string): Promise<void> => {
    h.root.clock.advance(QUEUE_STEP_MS);
    await h.root.services.chat.send({ principal: member, chatId: h.chatId, content });
  };
  await queue("I walk on.");
  await queue(`I leap. ${STAMP}`);
  const [plain, stamped] = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.filter(({ role }) => role === "user");
  if (plain === undefined || stamped === undefined) {
    throw new Error("the two queued sends wrote no user rows");
  }
  const queuedTurns = (): Promise<{ readonly messageId: unknown }[]> =>
    h.root.db.select({ messageId: pendingTurns.messageId }).from(pendingTurns).where(eq(pendingTurns.chatId, h.chatId)).orderBy(asc(pendingTurns.createdAt));
  expect(await queuedTurns()).toEqual([{ messageId: plain.id }, { messageId: stamped.id }]);

  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: h.chatId, messageIds: [plain.id] });

  expect(await queuedTurns()).toEqual([{ messageId: null }, { messageId: stamped.id }]);
  const drained = await wireOf(h, async () => {
    expect(await h.root.services.chat.drainDeferredTurns({ hostUserId: h.owner.userId })).toEqual({ ran: 2, dropped: 0 });
    await h.root.settleBackground();
  });
  // The orphaned turn's own send is gone, so it is told about no roll; it never borrows the stamped send's.
  expect(drained.bodies.map((body) => wireText(body).includes(ROLL_NOTE))).toEqual([false, true]);
});
