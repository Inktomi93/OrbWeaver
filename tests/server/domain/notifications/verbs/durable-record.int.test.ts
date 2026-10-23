// @subject packages/server/src/domain/notifications/verbs/record.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts
import { notifications } from "@orb/db";
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
