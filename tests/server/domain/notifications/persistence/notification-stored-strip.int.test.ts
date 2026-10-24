// A notification record and its standing correction strip extra input before the notifications row is stored
// and before any recipient frame carries it.

import { notifications } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const NOTIFICATION_SECRET = "bus-private-untrusted-notification-material";

test("real notification record and standing correction strip extra input before stored and recipient replay bytes", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const foreign = await root.actor();
  const other = await root.principalFor(foreign.id);
  const event = { type: "plugins-awaiting-consent", recipientUserId: principal.userId, pendingCount: 2, apiKey: NOTIFICATION_SECRET } as const;
  const raised = await root.services.notifications.record({ event });
  const stored = await root.db.select().from(notifications).where(eq(notifications.id, raised.id)).get();
  if (stored === undefined) {
    throw new Error("the canonical notification writer omitted its durable row");
  }
  expect(stored.payload).toEqual({ type: event.type, recipientUserId: principal.userId, pendingCount: 2 });
  expect(raised.payload).toEqual(stored.payload);
  const correction = { ...event, pendingCount: 1 };
  const corrected = await root.services.notifications.refreshStanding({ event: correction });
  expect(corrected).toHaveLength(1);
  expect(corrected[0]).toMatchObject({ id: raised.id, seq: raised.seq, payload: { type: event.type, recipientUserId: principal.userId, pendingCount: 1 } });
  const rows = await root.db.select().from(notifications).where(eq(notifications.id, raised.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.payload).toEqual({ type: event.type, recipientUserId: principal.userId, pendingCount: 1 });
  const replay = await root.services.notifications.replaySince({ principal, afterSeq: 0 });
  expect(replay).toHaveLength(1);
  expect(replay[0]?.payload).toEqual(rows[0]?.payload);
  expect(await root.services.notifications.replaySince({ principal: other, afterSeq: 0 })).toEqual([]);
  expect(JSON.stringify({ raised, stored, corrected, rows, replay })).not.toContain(NOTIFICATION_SECRET);
});
