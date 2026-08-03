// verb: list — recipient-scoped, newest-first, dismissed-excluded, cursor-paged on seq.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { beforeEach, describe } from "vitest";
import { createFrozenClock } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { ALICE, BOB, inviteEvent, makeNotificationsService, principal, seedUser } from "../_support.ts";

let db: Db;
let svc: NotificationsService;
const clock = createFrozenClock();

beforeEach(async () => {
  db = await freshDb();
  await seedUser(db, ALICE, castId<Handle>("alice"));
  await seedUser(db, BOB, castId<Handle>("bob"));
  svc = makeNotificationsService(db, clock.now);
});

describe("list — recipient-scope", () => {
  test("returns only the caller's own notifications", async () => {
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.record({ event: inviteEvent(BOB) });
    const alice = await svc.list({ principal: principal(ALICE) });
    expect(alice.items).toHaveLength(2);
    const bob = await svc.list({ principal: principal(BOB) });
    expect(bob.items).toHaveLength(1);
  });
});

describe("list — ordering + paging", () => {
  test("newest-first by seq; nextCursor pages the remainder, then null", async () => {
    const a = await svc.record({ event: inviteEvent(ALICE) });
    const b = await svc.record({ event: inviteEvent(ALICE) });
    const c = await svc.record({ event: inviteEvent(ALICE) });

    const first = await svc.list({ principal: principal(ALICE), limit: 2 });
    expect(first.items.map((i) => i.seq)).toEqual([c.seq, b.seq]);
    expect(first.nextCursor).toBe(b.seq);

    const cursor = first.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const second = await svc.list({ principal: principal(ALICE), limit: 2, cursor });
    expect(second.items.map((i) => i.seq)).toEqual([a.seq]);
    expect(second.nextCursor).toBeNull();
  });

  test("dismissed notifications are excluded", async () => {
    const a = await svc.record({ event: inviteEvent(ALICE) });
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.dismiss({ principal: principal(ALICE), notificationId: a.id });
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).not.toBe(a.id);
  });
});
