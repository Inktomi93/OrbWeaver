// @subject packages/server/src/domain/notifications/verbs/read.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts
import { describe } from "vitest";
import { expect, test } from "../_fixtures.ts";

describe("markAllRead — bulk recipient-scope + idempotence", () => {
  test("marks every one of the caller's unread notifications read in one call", async ({ harness, notificationActors: actors, clock }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: actors.aliceInvite });
    await svc.record({ event: actors.aliceInvite });
    await svc.record({ event: actors.aliceInvite });
    const result = await svc.markAllRead({ principal: actors.alice });
    expect(result.markedCount).toBe(3);
    const page = await svc.list({ principal: actors.alice });
    expect(page.items.every((i) => i.readAt === clock.frozenAt)).toBe(true);
  });

  test("never touches another recipient's unread rows", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: actors.aliceInvite });
    await svc.record({ event: actors.bobInvite });
    await svc.markAllRead({ principal: actors.alice });
    const bobPage = await svc.list({ principal: actors.bob });
    expect(bobPage.items[0]?.readAt).toBeNull();
  });

  test("a re-call after all rows are read marks nothing new (idempotent count)", async ({ harness, notificationActors: actors, clock }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: actors.aliceInvite });
    await svc.markAllRead({ principal: actors.alice });
    clock.advance(5000);
    const second = await svc.markAllRead({ principal: actors.alice });
    expect(second.markedCount).toBe(0);
  });

  test("an already-read row keeps its original readAt instant (COALESCE idempotence)", async ({ harness, notificationActors: actors, clock }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: actors.aliceInvite });
    await svc.markAllRead({ principal: actors.alice });
    const firstReadAt = (await svc.list({ principal: actors.alice })).items[0]?.readAt;
    clock.advance(5000);
    await svc.markAllRead({ principal: actors.alice });
    const page = await svc.list({ principal: actors.alice });
    expect(page.items[0]?.readAt).toBe(firstReadAt);
  });

  test("an empty inbox marks zero rows", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const result = await svc.markAllRead({ principal: actors.alice });
    expect(result.markedCount).toBe(0);
  });
});

describe("dismiss — recipient-scope + idempotence", () => {
  test("dismisses the caller's own notification and removes it from list", async ({ harness, notificationActors: actors, clock }) => {
    const svc = harness.services.notifications;
    const view = await svc.record({ event: actors.aliceInvite });
    const dismissed = await svc.dismiss({ principal: actors.alice, notificationId: view.id });
    expect(dismissed.dismissedAt).toBe(clock.frozenAt);
    const page = await svc.list({ principal: actors.alice });
    expect(page.items).toHaveLength(0);
  });

  test("another user cannot dismiss it — throws not-found", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const view = await svc.record({ event: actors.aliceInvite });
    await expect(svc.dismiss({ principal: actors.bob, notificationId: view.id })).rejects.toThrow();
    const page = await svc.list({ principal: actors.alice });
    expect(page.items).toHaveLength(1);
  });
});
