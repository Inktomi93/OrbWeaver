// @subject packages/server/src/domain/notifications/verbs/record.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts
import { chatParticipants, notifications, users } from "@orb/db";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../_fixtures.ts";

describe("record — durable-first", () => {
  test("persists the event and returns it deliverable from the table alone", async ({ harness, notificationActors: actors, clock }) => {
    const svc = harness.services.notifications;
    const view = await svc.record({ event: actors.aliceInvite });
    expect(view.type).toBe("invite");
    expect(view.seq).toBe(actors.aliceRaised.seq + 1);
    expect(view.createdAt).toBe(clock.frozenAt);
    expect(view.readAt).toBeNull();
    expect(view.dismissedAt).toBeNull();
    const page = await svc.list({ principal: actors.alice });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(view.id);
  });

  test("seq is db-driven monotonic per recipient", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const a1 = await svc.record({ event: actors.aliceInvite });
    const a2 = await svc.record({ event: actors.aliceInvite });
    const b1 = await svc.record({ event: actors.bobInvite });
    expect([a1.seq, a2.seq]).toEqual([actors.aliceRaised.seq + 1, actors.aliceRaised.seq + 2]);
    expect(b1.seq).toBe(actors.bobRaised.seq + 1);
  });
});

describe("record — coStatements ride the SAME batch (tx-atomicity)", () => {
  test("the producer's transition statement + the INSERT commit together; the view carries the db seq", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const transition = harness.db
      .update(users)
      .set({ handle: castId("alice2") })
      .where(eq(users.id, actors.alice.userId));
    const view = await svc.record({ event: actors.aliceInvite, coStatements: [transition] });

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

    await expect(svc.record({ event: actors.aliceInvite, coStatements: [good, bad] })).rejects.toThrow();
    const [row] = await harness.db.select().from(users).where(eq(users.id, actors.alice.userId));
    expect(row?.handle).toBe(actors.alice.handle);
    expect((await svc.list({ principal: actors.alice })).items).toHaveLength(0);
  });
});

describe("record — the closed union is the secret-free belt", () => {
  test("an unknown secret field smuggled onto the event does NOT survive the parse", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const dirty = {
      ...actors.aliceInvite,
      apiKey: "sk-leak-me",
      baseUrl: "https://evil.example",
    };
    const view = await svc.record({ event: dirty });
    expect(view.payload).toEqual(actors.aliceInvite);
    const [stored] = await harness.db
      .select({ payload: sql<string>`${notifications.payload}` })
      .from(notifications)
      .where(eq(notifications.id, view.id));
    expect(stored?.payload).toBe(JSON.stringify(actors.aliceInvite));
    expect(stored?.payload).not.toContain(dirty.apiKey);
    expect(stored?.payload).not.toContain(dirty.baseUrl);
  });
});
