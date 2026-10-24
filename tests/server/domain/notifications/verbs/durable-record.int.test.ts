// @subject packages/server/src/domain/notifications/verbs/record.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts

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
