// @subject packages/server/src/domain/notifications/verbs/plugin-delivery.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts
// Stored-byte corruption and held-driver races exercise the composed notification service, not a query double.

import type { Db } from "@orb/db";
import { closeDb, notifications } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { NotificationId } from "@orb/kit/ids";
import { createPluginNotificationDelivery } from "@orb/server/domain/notifications";
import type { HeldDb } from "@orb/testkit/node/db.ts";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import type { Fixtures } from "@orb/testkit/node/fixtures.ts";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { expect, test as notificationTest } from "../_fixtures.ts";

const test = notificationTest.extend<{ heldDb: HeldDb } & Pick<Fixtures, "db">>({
  heldDb: async ({}, use): Promise<void> => {
    const held = await freshHeldDb();
    try {
      await use(held);
    } finally {
      closeDb(held.db);
    }
  },
  db: async ({ heldDb }, use): Promise<void> => {
    await use(heldDb.db);
  },
});

async function corruptPayload(db: Db, id: NotificationId, payload: string): Promise<void> {
  await db
    .update(notifications)
    .set({ payload: sql`${payload}` })
    .where(eq(notifications.id, id));
}

async function disposition(db: Db, id: NotificationId): Promise<Pick<typeof notifications.$inferSelect, "readAt" | "dismissedAt"> | undefined> {
  const rows = await db.select({ readAt: notifications.readAt, dismissedAt: notifications.dismissedAt }).from(notifications).where(eq(notifications.id, id));
  return rows[0];
}

test("an owned malformed payload refuses dismissal before changing either timestamp", async ({ harness, notificationActors: actors }) => {
  const raised = await harness.services.notifications.record({ event: actors.aliceInvite });
  await corruptPayload(harness.db, raised.id, JSON.stringify({ ...actors.aliceInvite, inviteId: false }));
  await expect(harness.services.notifications.dismiss({ principal: actors.alice, notificationId: raised.id })).rejects.toBeInstanceOf(z.ZodError);
  expect(await disposition(harness.db, raised.id)).toEqual({ readAt: null, dismissedAt: null });
});

test("foreign malformed JSON has the same public refusal as a gone notification and is never decoded", async ({ harness, notificationActors: actors }) => {
  const raised = await harness.services.notifications.record({ event: actors.aliceInvite });
  await corruptPayload(harness.db, raised.id, "{");
  await expect(harness.services.notifications.dismiss({ principal: actors.bob, notificationId: raised.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await disposition(harness.db, raised.id)).toEqual({ readAt: null, dismissedAt: null });
});

test("a valid-shaped payload cannot redirect its owned row to another recipient", async ({ harness, notificationActors: actors }) => {
  const raised = await harness.services.notifications.record({ event: actors.aliceInvite });
  await corruptPayload(harness.db, raised.id, JSON.stringify(actors.bobInvite));
  await expect(harness.services.notifications.dismiss({ principal: actors.alice, notificationId: raised.id })).rejects.toBeInstanceOf(z.ZodError);
  await expect(harness.services.notifications.list({ principal: actors.alice })).rejects.toBeInstanceOf(z.ZodError);
  expect(await disposition(harness.db, raised.id)).toEqual({ readAt: null, dismissedAt: null });
});

test("the stored discriminator must agree with its parsed payload before a disposition", async ({
  harness,
  notificationActors: actors,
  notificationDecisions: decisions,
}) => {
  const raised = await harness.services.notifications.record({ event: actors.aliceInvite });
  await corruptPayload(harness.db, raised.id, JSON.stringify(decisions.kicked));
  await expect(harness.services.notifications.dismiss({ principal: actors.alice, notificationId: raised.id })).rejects.toBeInstanceOf(z.ZodError);
  expect(await disposition(harness.db, raised.id)).toEqual({ readAt: null, dismissedAt: null });
});

test("a raced valid refresh is dismissed as its newest payload without inventing absence", async ({
  harness,
  heldDb,
  clock,
  notificationActors: actors,
  consentSnapshots: consent,
}) => {
  const raised = await harness.services.notifications.record({ event: consent.large });
  const gate = heldDb.hold(/update "notifications" set "dismissed_at"/u);
  const dismissed = harness.services.notifications.dismiss({ principal: actors.alice, notificationId: raised.id });
  try {
    await gate.reached;
    gate.disarm();
    await harness.services.notifications.refreshStanding({
      event: consent.corrected,
    });
  } finally {
    gate.release();
  }
  const result = await dismissed;
  expect(result.payload).toEqual(consent.corrected);
  expect(result.dismissedAt).toBe(clock.frozenAt);
  clock.advance(1000);
  expect((await harness.services.notifications.dismiss({ principal: actors.alice, notificationId: raised.id })).dismissedAt).toBe(result.dismissedAt);
});

test("a raced malformed refresh refuses before the held dismissal changes timestamps", async ({ harness, heldDb, notificationActors: actors }) => {
  const raised = await harness.services.notifications.record({ event: actors.aliceInvite });
  const gate = heldDb.hold(/update "notifications" set "dismissed_at"/u);
  const refused = Promise.allSettled([harness.services.notifications.dismiss({ principal: actors.alice, notificationId: raised.id })]);
  try {
    await gate.reached;
    gate.disarm();
    await corruptPayload(harness.db, raised.id, JSON.stringify({ ...actors.aliceInvite, inviteId: false }));
  } finally {
    gate.release();
  }
  expect(await refused).toEqual([{ status: "rejected", reason: expect.any(z.ZodError) }]);
  expect(await disposition(harness.db, raised.id)).toEqual({ readAt: null, dismissedAt: null });
});

test("bulk withdrawal refuses an owned malformed ask before dismissing any of its siblings", async ({ harness, notificationActors: actors }) => {
  const first = await harness.services.notifications.record({ event: actors.aliceInvite });
  const second = await harness.services.notifications.record({ event: actors.aliceInvite });
  await corruptPayload(harness.db, second.id, JSON.stringify({ ...actors.aliceInvite, inviteId: false }));
  await expect(harness.services.notifications.retract({ recipientUserId: actors.alice.userId, type: "invite" })).rejects.toBeInstanceOf(z.ZodError);
  expect(await disposition(harness.db, first.id)).toEqual({ readAt: null, dismissedAt: null });
  expect(await disposition(harness.db, second.id)).toEqual({ readAt: null, dismissedAt: null });
});

test("bulk withdrawal rechecks a malformed raced refresh before its one atomic write", async ({ harness, heldDb, notificationActors: actors }) => {
  const first = await harness.services.notifications.record({ event: actors.aliceInvite });
  const second = await harness.services.notifications.record({ event: actors.aliceInvite });
  const gate = heldDb.hold(/update "notifications" set "dismissed_at"/u);
  const refused = Promise.allSettled([harness.services.notifications.retract({ recipientUserId: actors.alice.userId, type: "invite" })]);
  try {
    await gate.reached;
    gate.disarm();
    await corruptPayload(harness.db, second.id, JSON.stringify({ ...actors.aliceInvite, inviteId: false }));
  } finally {
    gate.release();
  }
  expect(await refused).toEqual([{ status: "rejected", reason: expect.any(z.ZodError) }]);
  expect(await disposition(harness.db, first.id)).toEqual({ readAt: null, dismissedAt: null });
  expect(await disposition(harness.db, second.id)).toEqual({ readAt: null, dismissedAt: null });
});

test("withdrawal ignores another recipient's corrupt ask while removing its own valid ask", async ({ harness, notificationActors: actors }) => {
  const own = await harness.services.notifications.record({ event: actors.aliceInvite });
  const foreign = await harness.services.notifications.record({ event: actors.bobInvite });
  await corruptPayload(harness.db, foreign.id, "{");
  const result = await harness.services.notifications.retract({ recipientUserId: actors.alice.userId, type: "invite" });
  expect(result.map((row) => row.id)).toEqual([own.id]);
  expect(result[0]?.payload).toEqual(actors.aliceInvite);
  expect(await disposition(harness.db, foreign.id)).toEqual({ readAt: null, dismissedAt: null });
});

test("refused stored recipient bytes never reach the real recipient-keyed publication bus", async ({ harness, notificationActors: actors }) => {
  const delivery = createPluginNotificationDelivery({
    notifications: harness.services.notifications,
    publish: harness.app.liveBuses.notifications.publishNotification,
  });
  const lifetime = new AbortController();
  const stream = harness.app.liveBuses.notifications.subscribeNotifications(actors.bob.userId, lifetime.signal)[Symbol.asyncIterator]();
  try {
    const control = stream.next();
    await delivery.emit(actors.bobInvite);
    expect((await control).value?.view.payload).toEqual(actors.bobInvite);
    const own = await harness.services.notifications.record({ event: actors.aliceInvite });
    await corruptPayload(harness.db, own.id, JSON.stringify(actors.bobInvite));
    const publication = Promise.allSettled([stream.next()]);
    const verdict = await Promise.allSettled([delivery.retractStanding({ recipientUserId: actors.alice.userId, type: "invite" })]);
    lifetime.abort();
    expect(await publication).toEqual([{ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }]);
    expect(verdict).toEqual([{ status: "rejected", reason: expect.any(z.ZodError) }]);
    expect(await disposition(harness.db, own.id)).toEqual({ readAt: null, dismissedAt: null });
  } finally {
    lifetime.abort();
  }
});
