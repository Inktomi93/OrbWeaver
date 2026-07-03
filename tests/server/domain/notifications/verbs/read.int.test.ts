// verbs: markRead · dismiss — recipient-scoping (a user can't touch another's inbox) + idempotence.

import type { Db } from "@orb/db";
import type { NotificationId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { beforeEach, describe } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import {
  ALICE,
  BOB,
  inviteEvent,
  makeNotificationsService,
  principal,
  seedUser,
} from "../_support";

let db: Db;
let svc: NotificationsService;
// Recreated per test — one test advances the clock, and isolate is per-file (not per-test).
let clock = createFrozenClock();

beforeEach(async () => {
  clock = createFrozenClock();
  db = await freshDb();
  await seedUser(db, ALICE, "alice");
  await seedUser(db, BOB, "bob");
  svc = makeNotificationsService(db, clock.now);
});

describe("markRead — recipient-scope + idempotence", () => {
  test("marks the caller's own notification read", async () => {
    const view = await svc.record({ event: inviteEvent(ALICE) });
    const read = await svc.markRead({ principal: principal(ALICE), notificationId: view.id });
    expect(read.readAt).toBe(clock.frozenAt);
  });

  test("a re-mark keeps the original instant (idempotent)", async () => {
    const view = await svc.record({ event: inviteEvent(ALICE) });
    await svc.markRead({ principal: principal(ALICE), notificationId: view.id });
    clock.advance(5000);
    const again = await svc.markRead({ principal: principal(ALICE), notificationId: view.id });
    expect(again.readAt).toBe(clock.frozenAt);
  });

  test("another user cannot mark it read — throws not-found (no cross-user inbox)", async () => {
    const view = await svc.record({ event: inviteEvent(ALICE) });
    await expect(
      svc.markRead({ principal: principal(BOB), notificationId: view.id }),
    ).rejects.toThrow();
  });

  test("a missing id throws not-found", async () => {
    await expect(
      svc.markRead({ principal: principal(ALICE), notificationId: castId<NotificationId>("nope") }),
    ).rejects.toThrow();
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
    await expect(
      svc.dismiss({ principal: principal(BOB), notificationId: view.id }),
    ).rejects.toThrow();
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items).toHaveLength(1);
  });
});
