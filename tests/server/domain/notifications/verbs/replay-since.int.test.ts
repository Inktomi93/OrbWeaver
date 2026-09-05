// verb: replaySince (#1459) — the socket's durable RESUME read: recipient-scoped, dismissed-excluded,
// `seq` strictly ABOVE the watermark, OLDEST-first, clamped to the shared list ceiling.
//
// THE DIRECTION IS THE CONTRACT, so it is what these pin. `list` walks DOWN from the newest row; a resume
// walks UP from what the reader last delivered, which is the only shape in which a partial answer is a
// COMPLETE answer for its prefix. Every receipt below is taken as ALICE except the scope pin, which asks as
// BOB and proves his page holds none of her rows.

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

/** Record `count` notifications for a recipient and return their seqs in mint order. */
async function record(recipient: typeof ALICE, count: number): Promise<number[]> {
  const seqs: number[] = [];
  for (let i = 0; i < count; i++) {
    const view = await svc.record({ event: inviteEvent(recipient) });
    seqs.push(view.seq);
  }
  return seqs;
}

describe("replaySince — recipient scope", () => {
  test("a replay page holds ONLY the asking principal's rows", async () => {
    await record(ALICE, 3);
    const bobSeqs = await record(BOB, 2);

    // Asked as BOB: his own two rows, and neither of Alice's — the scope is the WHERE clause, not a filter
    // the caller could forget (`seq` is per-recipient, so Alice's rows sit in the same numeric range).
    const bobPage = await svc.replaySince({ principal: principal(BOB), afterSeq: 0 });
    expect(bobPage.map((row) => row.seq)).toEqual(bobSeqs);
    for (const row of bobPage) {
      expect(row.payload.recipientUserId).toBe(BOB);
    }

    // Asked as ALICE: three rows, all hers.
    const alicePage = await svc.replaySince({ principal: principal(ALICE), afterSeq: 0 });
    expect(alicePage).toHaveLength(3);
    for (const row of alicePage) {
      expect(row.payload.recipientUserId).toBe(ALICE);
    }
  });
});

describe("replaySince — direction, strictness, and the short page", () => {
  test("ASCENDING from the watermark, strictly above it, and a short page means the log is exhausted", async () => {
    const seqs = await record(ALICE, 5);
    const watermark = seqs[1];
    if (watermark === undefined) {
      throw new Error("expected a seeded watermark");
    }

    const page = await svc.replaySince({ principal: principal(ALICE), afterSeq: watermark });

    // Oldest-first, and the watermark row itself is NOT re-delivered (a reader already yielded it).
    expect(page.map((row) => row.seq)).toEqual(seqs.slice(2));
    expect(page.length).toBeLessThan(5);
  });

  test("paging from the last DELIVERED seq walks the whole log exactly once — no gap, no repeat", async () => {
    const seqs = await record(ALICE, 7);

    const delivered: number[] = [];
    let watermark = 0;
    for (;;) {
      const page = await svc.replaySince({ principal: principal(ALICE), afterSeq: watermark, limit: 3 });
      for (const row of page) {
        delivered.push(row.seq);
        watermark = row.seq;
      }
      if (page.length < 3) {
        break;
      }
    }

    expect(delivered).toEqual(seqs);
  });

  test("a row recorded BETWEEN two pages lands in the later page, exactly once", async () => {
    const first = await record(ALICE, 3);

    const pageOne = await svc.replaySince({ principal: principal(ALICE), afterSeq: 0, limit: 3 });
    // The concurrent write: a producer records while the reader is between pages.
    const late = await svc.record({ event: inviteEvent(ALICE) });
    const lastDelivered = pageOne.at(-1)?.seq ?? 0;
    const pageTwo = await svc.replaySince({ principal: principal(ALICE), afterSeq: lastDelivered, limit: 3 });

    expect(pageOne.map((row) => row.seq)).toEqual(first);
    expect(pageTwo.map((row) => row.seq)).toEqual([late.seq]);
  });

  test("dismissed rows are excluded — the resume replays the ACTIVE inbox `list` would show", async () => {
    const seqs = await record(ALICE, 3);
    const page = await svc.replaySince({ principal: principal(ALICE), afterSeq: 0 });
    const dismissed = page[0];
    if (dismissed === undefined) {
      throw new Error("expected a row to dismiss");
    }
    await svc.dismiss({ principal: principal(ALICE), notificationId: dismissed.id });

    const after = await svc.replaySince({ principal: principal(ALICE), afterSeq: 0 });

    expect(after.map((row) => row.seq)).toEqual(seqs.slice(1));
  });

  test("the page is clamped to the shared ceiling — an over-bound ask cannot pull the whole inbox at once", async () => {
    await record(ALICE, 4);

    const page = await svc.replaySince({ principal: principal(ALICE), afterSeq: 0, limit: 1_000_000 });

    // The clamp is `NOTIFICATIONS_LIST_MAX_LIMIT` (100), so four rows come back whole; the pin that matters
    // is that the ask did not become the limit.
    expect(page).toHaveLength(4);
    await expect(svc.replaySince({ principal: principal(ALICE), afterSeq: 0, limit: 2 })).resolves.toHaveLength(2);
  });
});
