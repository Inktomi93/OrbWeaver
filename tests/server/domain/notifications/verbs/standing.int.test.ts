// verbs: refreshStanding · retract (+ `record`'s `supersedeActiveOfSameType`) — the three moves a STANDING
// ASK has and an episodic event does not (#1041). The behaviours pinned here are the ones the aggregate
// consent prompt's whole point rests on: the reader never holds two copies of one ask, answering asks one
// at a time does not re-badge the bell, the last answer takes the row away, and a reader who dismissed the
// row is left alone.

import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
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

const CONSENT_TYPE = "plugins-awaiting-consent";

function consentEvent(recipientUserId: UserId, pendingCount: number): NotificationEvent {
  return { type: CONSENT_TYPE, recipientUserId, pendingCount };
}

/** The recipient's ACTIVE rows of the standing type, newest-first (what the bell reads). */
async function standingRows(userId: UserId): Promise<readonly { readonly payload: NotificationEvent; readonly seq: number; readonly readAt: number | null }[]> {
  const page = await svc.list({ principal: principal(userId) });
  return page.items.filter((item) => item.type === CONSENT_TYPE);
}

beforeEach(async () => {
  db = await freshDb();
  await seedUser(db, ALICE, castId<Handle>("alice"));
  await seedUser(db, BOB, castId<Handle>("bob"));
  svc = makeNotificationsService(db, clock.now);
});

describe("record — supersedeActiveOfSameType", () => {
  test("a re-raise leaves ONE live row of the type, carrying the newest number", async () => {
    await svc.record({ event: consentEvent(ALICE, 3), supersedeActiveOfSameType: true });
    await svc.record({ event: consentEvent(ALICE, 9), supersedeActiveOfSameType: true });

    const rows = await standingRows(ALICE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual(consentEvent(ALICE, 9));
  });

  test("it supersedes only the SAME type, and only the SAME recipient", async () => {
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.record({ event: consentEvent(BOB, 2), supersedeActiveOfSameType: true });
    await svc.record({ event: consentEvent(ALICE, 1), supersedeActiveOfSameType: true });
    await svc.record({ event: consentEvent(ALICE, 4), supersedeActiveOfSameType: true });

    // Alice keeps her invite (a different type is a different ask) and holds one consent row.
    const alice = await svc.list({ principal: principal(ALICE) });
    expect(alice.items.map((item) => item.type).sort()).toEqual(["invite", CONSENT_TYPE].sort());
    // Bob's own standing row is untouched by Alice's supersede — the WHERE pins the recipient.
    expect((await standingRows(BOB))[0]?.payload).toEqual(consentEvent(BOB, 2));
  });

  test("the absent flag still APPENDS — two invites are two events", async () => {
    await svc.record({ event: inviteEvent(ALICE) });
    await svc.record({ event: inviteEvent(ALICE) });
    expect((await svc.list({ principal: principal(ALICE) })).items).toHaveLength(2);
  });
});

describe("refreshStanding — the QUIET correction", () => {
  test("the number changes in place: same row, same seq, and a row already read STAYS read", async () => {
    const raised = await svc.record({ event: consentEvent(ALICE, 9), supersedeActiveOfSameType: true });
    await svc.markAllRead({ principal: principal(ALICE) });

    const changed = await svc.refreshStanding({ event: consentEvent(ALICE, 8) });
    expect(changed).toHaveLength(1);

    const rows = await standingRows(ALICE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual(consentEvent(ALICE, 8));
    expect(rows[0]?.seq).toBe(raised.seq);
    // THE WHOLE POINT: answering nine asks one at a time must not badge the bell nine times.
    expect(rows[0]?.readAt).not.toBeNull();
  });

  test("it does NOT resurrect a dismissed ask — no active row means no write", async () => {
    const raised = await svc.record({ event: consentEvent(ALICE, 9), supersedeActiveOfSameType: true });
    await svc.dismiss({ principal: principal(ALICE), notificationId: raised.id });

    expect(await svc.refreshStanding({ event: consentEvent(ALICE, 8) })).toHaveLength(0);
    expect(await standingRows(ALICE)).toHaveLength(0);
  });

  test("it touches only the addressed recipient's row", async () => {
    await svc.record({ event: consentEvent(ALICE, 9), supersedeActiveOfSameType: true });
    await svc.record({ event: consentEvent(BOB, 2), supersedeActiveOfSameType: true });

    await svc.refreshStanding({ event: consentEvent(ALICE, 1) });

    expect((await standingRows(BOB))[0]?.payload).toEqual(consentEvent(BOB, 2));
  });
});

describe("retract — the ask is gone", () => {
  test("it takes the standing row out of the active inbox and returns what it flipped", async () => {
    await svc.record({ event: consentEvent(ALICE, 1), supersedeActiveOfSameType: true });
    await svc.record({ event: inviteEvent(ALICE) });

    const withdrawn = await svc.retract({ recipientUserId: ALICE, type: CONSENT_TYPE });
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]?.dismissedAt).toBe(clock.frozenAt);

    // The invite is untouched: retract is per-type.
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items.map((item) => item.type)).toEqual(["invite"]);
  });

  test("it is idempotent and total — retracting when nothing stands flips nothing", async () => {
    expect(await svc.retract({ recipientUserId: ALICE, type: CONSENT_TYPE })).toHaveLength(0);
    await svc.record({ event: consentEvent(ALICE, 1), supersedeActiveOfSameType: true });
    expect(await svc.retract({ recipientUserId: ALICE, type: CONSENT_TYPE })).toHaveLength(1);
    expect(await svc.retract({ recipientUserId: ALICE, type: CONSENT_TYPE })).toHaveLength(0);
  });

  test("a retracted row never replays on a socket resume (#1459's ascending pump reads active rows only)", async () => {
    const raised = await svc.record({ event: consentEvent(ALICE, 4), supersedeActiveOfSameType: true });
    await svc.retract({ recipientUserId: ALICE, type: CONSENT_TYPE });

    expect(await svc.replaySince({ principal: principal(ALICE), afterSeq: raised.seq - 1 })).toHaveLength(0);
  });

  test("a SUPERSEDED row never replays either — a resume cannot show two copies of one ask", async () => {
    const first = await svc.record({ event: consentEvent(ALICE, 3), supersedeActiveOfSameType: true });
    const second = await svc.record({ event: consentEvent(ALICE, 9), supersedeActiveOfSameType: true });

    const replayed = await svc.replaySince({ principal: principal(ALICE), afterSeq: first.seq - 1 });
    expect(replayed.map((view) => view.seq)).toEqual([second.seq]);
  });
});
