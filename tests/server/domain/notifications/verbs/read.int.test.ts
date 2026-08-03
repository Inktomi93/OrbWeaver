// verbs: markAllRead · dismiss — recipient-scoping (a user can't touch another's inbox) + idempotence.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { beforeEach, describe } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { ALICE, BOB, inviteEvent, makeNotificationsService, principal, seedUser } from "../_support";

let db: Db;
let svc: NotificationsService;
// Recreated per test — one test advances the clock, and isolate is per-file (not per-test).
let clock = createFrozenClock();

beforeEach(async () => {
  clock = createFrozenClock();
  db = await freshDb();
  await seedUser(db, ALICE, castId<Handle>("alice"));
  await seedUser(db, BOB, castId<Handle>("bob"));
  svc = makeNotificationsService(db, clock.now);
});

describe("markAllRead — bulk recipient-scope + idempotence", () => {
  test("marks every one of the caller's unread notifications read in one call", async () => {
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.record({ event: inviteEvent(ALICE) });
    const result = await svc.markAllRead({ principal: principal(ALICE) });
    expect(result.markedCount).toBe(3);
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items.every((i) => i.readAt === clock.frozenAt)).toBe(true);
  });

  test("never touches another recipient's unread rows", async () => {
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.record({ event: inviteEvent(BOB) });
    await svc.markAllRead({ principal: principal(ALICE) });
    const bobPage = await svc.list({ principal: principal(BOB) });
    expect(bobPage.items[0]?.readAt).toBeNull();
  });

  test("a re-call after all rows are read marks nothing new (idempotent count)", async () => {
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.markAllRead({ principal: principal(ALICE) });
    clock.advance(5000);
    const second = await svc.markAllRead({ principal: principal(ALICE) });
    expect(second.markedCount).toBe(0);
  });

  test("an already-read row keeps its original readAt instant (COALESCE idempotence)", async () => {
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.markAllRead({ principal: principal(ALICE) });
    const firstReadAt = (await svc.list({ principal: principal(ALICE) })).items[0]?.readAt;
    clock.advance(5000);
    await svc.markAllRead({ principal: principal(ALICE) });
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items[0]?.readAt).toBe(firstReadAt);
  });

  test("an empty inbox marks zero rows", async () => {
    const result = await svc.markAllRead({ principal: principal(ALICE) });
    expect(result.markedCount).toBe(0);
  });
});

describe("dismiss — recipient-scope + idempotence", () => {
  test("dismisses the caller's own notification and removes it from list", async () => {
    const view = await svc.record({ event: inviteEvent(ALICE) });
    const dismissed = await svc.dismiss({ principal: principal(ALICE), notificationId: view.id });
    expect(dismissed.dismissedAt).toBe(clock.frozenAt);
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items).toHaveLength(0);
  });

  test("another user cannot dismiss it — throws not-found", async () => {
    const view = await svc.record({ event: inviteEvent(ALICE) });
    await expect(svc.dismiss({ principal: principal(BOB), notificationId: view.id })).rejects.toThrow();
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items).toHaveLength(1);
  });
});
