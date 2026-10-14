// @subject packages/server/src/domain/notifications/verbs/replay-since.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts
import type { NotificationEvent } from "@orb/contracts/notifications";
import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { describe } from "vitest";
import { expect, test } from "../_fixtures.ts";

/** Record `count` notifications for a recipient and return their seqs in mint order. */
async function record(harness: ServerTestHarness, event: NotificationEvent, count: number): Promise<number[]> {
  const seqs: number[] = [];
  for (let i = 0; i < count; i++) {
    const view = await harness.services.notifications.record({ event });
    seqs.push(view.seq);
  }
  return seqs;
}

describe("replaySince — recipient scope", () => {
  test("a replay page holds ONLY the asking principal's rows", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    await record(harness, actors.aliceInvite, 3);
    const bobSeqs = await record(harness, actors.bobInvite, 2);

    const bobPage = await svc.replaySince({ principal: actors.bob, afterSeq: 0 });
    expect(bobPage.map((row) => row.seq)).toEqual(bobSeqs);
    for (const row of bobPage) {
      expect(row.payload.recipientUserId).toBe(actors.bob.userId);
    }

    const alicePage = await svc.replaySince({ principal: actors.alice, afterSeq: 0 });
    expect(alicePage).toHaveLength(3);
    for (const row of alicePage) {
      expect(row.payload.recipientUserId).toBe(actors.alice.userId);
    }
  });
});

describe("replaySince — direction, strictness, and the short page", () => {
  test("ASCENDING from the watermark, strictly above it, and a short page means the log is exhausted", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const seqs = await record(harness, actors.aliceInvite, 5);
    const watermark = seqs[1];
    if (watermark === undefined) {
      throw new Error("expected a seeded watermark");
    }

    const page = await svc.replaySince({ principal: actors.alice, afterSeq: watermark });

    expect(page.map((row) => row.seq)).toEqual(seqs.slice(2));
    expect(page.length).toBeLessThan(5);
  });

  test("paging from the last DELIVERED seq walks the whole log exactly once — no gap, no repeat", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const seqs = await record(harness, actors.aliceInvite, 7);

    const delivered: number[] = [];
    let watermark = 0;
    for (;;) {
      const page = await svc.replaySince({ principal: actors.alice, afterSeq: watermark, limit: 3 });
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

  test("a row recorded BETWEEN two pages lands in the later page, exactly once", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const first = await record(harness, actors.aliceInvite, 3);

    const pageOne = await svc.replaySince({ principal: actors.alice, afterSeq: 0, limit: 3 });
    const late = await svc.record({ event: actors.aliceInvite });
    const lastDelivered = pageOne.at(-1)?.seq ?? 0;
    const pageTwo = await svc.replaySince({ principal: actors.alice, afterSeq: lastDelivered, limit: 3 });

    expect(pageOne.map((row) => row.seq)).toEqual(first);
    expect(pageTwo.map((row) => row.seq)).toEqual([late.seq]);
  });

  test("dismissed rows are excluded — the resume replays the ACTIVE inbox `list` would show", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const seqs = await record(harness, actors.aliceInvite, 3);
    const page = await svc.replaySince({ principal: actors.alice, afterSeq: 0 });
    const dismissed = page[0];
    if (dismissed === undefined) {
      throw new Error("expected a row to dismiss");
    }
    await svc.dismiss({ principal: actors.alice, notificationId: dismissed.id });

    const after = await svc.replaySince({ principal: actors.alice, afterSeq: 0 });

    expect(after.map((row) => row.seq)).toEqual(seqs.slice(1));
  });

  test("the page is clamped to the shared ceiling — an over-bound ask cannot pull the whole inbox at once", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const seqs = await record(harness, actors.aliceInvite, NOTIFICATIONS_LIST_MAX_LIMIT + 1);

    const page = await svc.replaySince({ principal: actors.alice, afterSeq: 0, limit: 1_000_000 });

    expect(page.map((row) => row.seq)).toEqual(seqs.slice(0, NOTIFICATIONS_LIST_MAX_LIMIT));
    const tail = await svc.replaySince({ principal: actors.alice, afterSeq: page.at(-1)?.seq ?? 0 });
    expect(tail.map((row) => row.seq)).toEqual(seqs.slice(NOTIFICATIONS_LIST_MAX_LIMIT));
    await expect(svc.replaySince({ principal: actors.alice, afterSeq: 0, limit: 2 })).resolves.toHaveLength(2);
  });
});
