// @subject packages/server/src/domain/notifications/persistence/queries.ts
import { notifications } from "@orb/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../_fixtures.ts";

test("seq starts at 1 and increments per recipient, independently", async ({ harness, notificationActors: actors }) => {
  const a1 = actors.aliceRaised;
  const a2 = await harness.services.notifications.record({ event: actors.aliceInvite });
  const a3 = await harness.services.notifications.record({ event: actors.aliceInvite });
  expect([a1.seq, a2.seq, a3.seq]).toEqual([1, 2, 3]);
  expect(actors.bobRaised.seq).toBe(1);
  const b2 = await harness.services.notifications.record({ event: actors.bobInvite });
  expect(b2.seq).toBe(2);
});
test("the row is durable — readable from the table alone", async ({ harness, notificationActors: actors }) => {
  const view = await harness.services.notifications.record({ event: actors.aliceInvite });
  const rows = await harness.db.select().from(notifications).where(eq(notifications.id, view.id));
  expect(rows).toMatchObject([{ id: view.id, recipientUserId: actors.alice.userId, payload: actors.aliceInvite, seq: view.seq }]);
});
test("only the recipient's own rows are returned", async ({ harness, notificationActors: actors }) => {
  const a = await harness.services.notifications.record({ event: actors.aliceInvite });
  const b = await harness.services.notifications.record({ event: actors.bobInvite });
  const alice = await harness.services.notifications.list({ principal: actors.alice });
  const bob = await harness.services.notifications.list({ principal: actors.bob });
  expect(alice.items.map((row) => [row.id, row.payload])).toEqual([[a.id, actors.aliceInvite]]);
  expect(bob.items.map((row) => [row.id, row.payload])).toEqual([[b.id, actors.bobInvite]]);
});
test("newest-first by seq; dismissed rows excluded", async ({ harness, notificationActors: actors }) => {
  const first = await harness.services.notifications.record({ event: actors.aliceInvite });
  const second = await harness.services.notifications.record({ event: actors.aliceInvite });
  await harness.services.notifications.dismiss({ principal: actors.alice, notificationId: first.id });
  expect((await harness.services.notifications.list({ principal: actors.alice })).items.map((row) => row.id)).toEqual([second.id]);
});
test("cursor pages strictly below the given seq", async ({ harness, notificationActors: actors }) => {
  const first = await harness.services.notifications.record({ event: actors.aliceInvite });
  const second = await harness.services.notifications.record({ event: actors.aliceInvite });
  const third = await harness.services.notifications.record({ event: actors.aliceInvite });
  const page = await harness.services.notifications.list({ principal: actors.alice, cursor: third.seq });
  expect(page.items.map((row) => row.seq)).toEqual([second.seq, first.seq]);
});
test("flips every unread row for the recipient in one UPDATE, returns the touched count", async ({ harness, notificationActors: actors, clock }) => {
  const a = await harness.services.notifications.record({ event: actors.aliceInvite });
  const b = await harness.services.notifications.record({ event: actors.aliceInvite });
  const foreign = await harness.services.notifications.record({ event: actors.bobInvite });
  expect(await harness.services.notifications.markAllRead({ principal: actors.alice })).toEqual({ markedCount: 2 });
  expect((await harness.services.notifications.list({ principal: actors.alice })).items.map((row) => [row.id, row.readAt])).toEqual([
    [b.id, clock.now()],
    [a.id, clock.now()],
  ]);
  expect((await harness.services.notifications.list({ principal: actors.bob })).items.map((row) => [row.id, row.readAt])).toEqual([[foreign.id, null]]);
});
test("an already-read row is left with its original instant", async ({ harness, notificationActors: actors, clock }) => {
  const view = await harness.services.notifications.record({ event: actors.aliceInvite });
  await harness.services.notifications.markAllRead({ principal: actors.alice });
  const firstRead = clock.now();
  clock.advance(1000);
  await harness.services.notifications.markAllRead({ principal: actors.alice });
  expect((await harness.services.notifications.list({ principal: actors.alice })).items.map((row) => [row.id, row.readAt])).toEqual([[view.id, firstRead]]);
});
test("no unread rows means zero touched", async ({ harness, notificationActors: actors }) => {
  expect(await harness.services.notifications.markAllRead({ principal: actors.alice })).toEqual({ markedCount: 0 });
});
// The unshipped markReadScoped API is retired; its isolation trait is proved through the shipped bulk read.
test("a foreign recipient's read matches no own rows and mutates no row", async ({ harness, notificationActors: actors }) => {
  const view = await harness.services.notifications.record({ event: actors.aliceInvite });
  expect(await harness.services.notifications.markAllRead({ principal: actors.bob })).toEqual({ markedCount: 0 });
  const rows = await harness.db.select().from(notifications).where(eq(notifications.id, view.id));
  expect(rows).toMatchObject([{ id: view.id, readAt: null, dismissedAt: null, payload: actors.aliceInvite }]);
});
test("readAt is set once — a re-flip keeps the original instant", async ({ harness, notificationActors: actors, clock }) => {
  const view = await harness.services.notifications.record({ event: actors.aliceInvite });
  const firstRead = clock.now();
  expect(await harness.services.notifications.markAllRead({ principal: actors.alice })).toEqual({ markedCount: 1 });
  clock.advance(5000);
  expect(await harness.services.notifications.markAllRead({ principal: actors.alice })).toEqual({ markedCount: 0 });
  expect((await harness.services.notifications.list({ principal: actors.alice })).items.map((row) => [row.id, row.readAt])).toEqual([[view.id, firstRead]]);
});
test("dismissedAt is set once — idempotent", async ({ harness, notificationActors: actors, notificationDecisions: decisions, clock }) => {
  const view = await harness.services.notifications.record({ event: decisions.kicked });
  const first = await harness.services.notifications.dismiss({ principal: actors.alice, notificationId: view.id });
  clock.advance(1000);
  const second = await harness.services.notifications.dismiss({ principal: actors.alice, notificationId: view.id });
  expect(first.dismissedAt).toBe(clock.frozenAt);
  expect(second.dismissedAt).toBe(first.dismissedAt);
});
