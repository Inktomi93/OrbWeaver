// @subject packages/server/src/domain/notifications/persistence/queries.ts
// @subject packages/server/src/domain/notifications/verbs/record.ts
// A producer's co-statements are raw unexecuted statements by contract, so the batch atomicity suite builds them here.
import { chatParticipants, users } from "@orb/db";
import { statementToken } from "@orb/db/wiring-owner";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../_fixtures.ts";

describe("record — coStatements ride the SAME batch (tx-atomicity)", () => {
  test("the producer's transition statement + the INSERT commit together; the view carries the db seq", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const transition = harness.db
      .update(users)
      .set({ handle: castId("alice2") })
      .where(eq(users.id, actors.alice.userId));
    const view = await svc.record({ event: actors.aliceInvite, coStatements: [statementToken(transition)] });

    expect(view.type).toBe("invite");
    expect(view.seq).toBe(actors.aliceRaised.seq + 1);
    const [row] = await harness.db.select().from(users).where(eq(users.id, actors.alice.userId));
    expect(row?.handle).toBe("alice2");
    const page = await svc.list({ principal: actors.alice });
    expect(page.items.map((i) => i.id)).toEqual([view.id]);
  });

  test("a failing co-statement aborts BOTH halves (no transition, no notification row)", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const [participant] = await harness.db.select().from(chatParticipants).where(eq(chatParticipants.chatId, actors.room.id));
    if (participant === undefined) {
      throw new Error("canonical room builder omitted the real participant row");
    }
    const bad = harness.db.insert(chatParticipants).values({
      ...participant,
      id: harness.idSource.typeId(ID_PREFIX.chatParticipant),
      chatId: harness.idSource.typeId(ID_PREFIX.chat),
    });
    const good = harness.db
      .update(users)
      .set({ handle: castId("alice3") })
      .where(eq(users.id, actors.alice.userId));

    await expect(svc.record({ event: actors.aliceInvite, coStatements: [statementToken(good), statementToken(bad)] })).rejects.toThrow();
    const [row] = await harness.db.select().from(users).where(eq(users.id, actors.alice.userId));
    expect(row?.handle).toBe(actors.alice.handle);
    expect((await svc.list({ principal: actors.alice })).items).toHaveLength(0);
  });
});
