// .int tests for schema/notifications — the per-user durable inbox (D16). Real libSQL :memory: (FK ON).
// Covers: round-trips + payload JSON, the `type` discriminant test-mirror (db column accepts EXACTLY the
// `@orb/contracts/notifications` union members) + the CHECK rejecting an out-of-union value, the
// per-recipient monotonic `seq` ordering + uniqueness, the read/dismiss flips, the FK cascade (delete
// user → inbox gone), and the secret-unrepresentable belt (a credential-shaped payload is STRIPPED by
// the closed union, never representable).

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import { notificationEventSchema } from "@orb/contracts/notifications";
import { notifications, users } from "@orb/db";
import type { Handle, NotificationId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

async function seedUser(db: Awaited<ReturnType<typeof freshDb>>, raw: string): Promise<UserId> {
  const id = castId<UserId>(raw);
  await db.insert(users).values({ id, handle: castId<Handle>(raw) });
  return id;
}

/** A valid `invite` event for the given recipient (real TypeIDs so it also parses via the contract). */
function inviteEvent(recipientUserId: UserId): NotificationEvent {
  return {
    type: "invite",
    recipientUserId,
    chatId: mintTypeId(ID_PREFIX.chat),
    inviteId: mintTypeId(ID_PREFIX.chatInvite),
    invitedByHandle: castId<Handle>("alice"),
  };
}

test("notifications insert→select round-trips (payload JSON + discriminant + defaults)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, "user_notif_rt");
  const payload = inviteEvent(userId);
  await db.insert(notifications).values({
    id: castId<NotificationId>("notification_rt"),
    recipientUserId: userId,
    type: "invite",
    payload,
    seq: 1,
  });

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, userId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.type).toBe("invite");
  expect(row?.payload).toEqual(payload);
  expect(row?.seq).toBe(1);
  expect(row?.readAt).toBeNull();
  expect(row?.dismissedAt).toBeNull();
  expect(row?.createdAt).toBeTypeOf("number");
});

test("test-mirror: the `type` column accepts EXACTLY the contract union members", async () => {
  // Derive the canonical discriminant set from the closed union (the column's one home). A structural
  // cast reads each member's `type` literal without depending on zod's internal option typing.
  const unionTypes = notificationEventSchema.options
    .map(
      (member) =>
        (member as unknown as { shape: { type: { value: NotificationType } } }).shape.type.value,
    )
    .sort();
  expect(unionTypes).toEqual(["handoff-accepted", "handoff-nominated", "invite", "kicked"]);

  // Every union member inserts cleanly (the column enum + CHECK derive the same set). Batched (one
  // insert) to avoid await-in-loop.
  const db = await freshDb();
  const userId = await seedUser(db, "user_notif_types");
  await db.insert(notifications).values(
    unionTypes.map((type, i) => ({
      id: castId<NotificationId>(`notification_type_${i}`),
      recipientUserId: userId,
      type: type as NotificationEvent["type"],
      payload: inviteEvent(userId),
      seq: i + 1,
    })),
  );
  expect(await db.select().from(notifications)).toHaveLength(unionTypes.length);
});

test("notifications type CHECK rejects an out-of-union value", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, "user_notif_badtype");
  let caught: unknown;
  try {
    await db.insert(notifications).values({
      id: castId<NotificationId>("notification_badtype"),
      recipientUserId: userId,
      type: "credential-leak" as unknown as NotificationEvent["type"],
      payload: inviteEvent(userId),
      seq: 1,
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("seq is monotonic-orderable per recipient and unique per (recipient, seq)", async () => {
  const db = await freshDb();
  const a = await seedUser(db, "user_seq_a");
  const b = await seedUser(db, "user_seq_b");

  // Out-of-order inserts, then read back in seq order.
  await db.insert(notifications).values([
    {
      id: castId<NotificationId>("n_a3"),
      recipientUserId: a,
      type: "invite",
      payload: inviteEvent(a),
      seq: 3,
    },
    {
      id: castId<NotificationId>("n_a1"),
      recipientUserId: a,
      type: "invite",
      payload: inviteEvent(a),
      seq: 1,
    },
    {
      id: castId<NotificationId>("n_a2"),
      recipientUserId: a,
      type: "invite",
      payload: inviteEvent(a),
      seq: 2,
    },
    // Same seq=1 is fine for a DIFFERENT recipient (per-recipient monotonicity).
    {
      id: castId<NotificationId>("n_b1"),
      recipientUserId: b,
      type: "invite",
      payload: inviteEvent(b),
      seq: 1,
    },
  ]);

  const ordered = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, a))
    .orderBy(asc(notifications.seq));
  expect(ordered.map((r) => r.seq)).toEqual([1, 2, 3]);

  // A duplicate (recipient, seq) collides on the unique index.
  let caught: unknown;
  try {
    await db.insert(notifications).values({
      id: castId<NotificationId>("n_a1_dup"),
      recipientUserId: a,
      type: "invite",
      payload: inviteEvent(a),
      seq: 1,
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("readAt / dismissedAt flip from null on update", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, "user_notif_read");
  await db.insert(notifications).values({
    id: castId<NotificationId>("notification_read"),
    recipientUserId: userId,
    type: "invite",
    payload: inviteEvent(userId),
    seq: 1,
  });

  const readAt = 1_700_000_000_000;
  await db
    .update(notifications)
    .set({ readAt })
    .where(eq(notifications.id, castId<NotificationId>("notification_read")));
  const afterRead = (
    await db.select().from(notifications).where(eq(notifications.recipientUserId, userId))
  )[0];
  expect(afterRead?.readAt).toBeTypeOf("number");
  expect(afterRead?.dismissedAt).toBeNull();

  const dismissedAt = 1_700_000_001_000;
  await db
    .update(notifications)
    .set({ dismissedAt })
    .where(eq(notifications.id, castId<NotificationId>("notification_read")));
  const afterDismiss = (
    await db.select().from(notifications).where(eq(notifications.recipientUserId, userId))
  )[0];
  expect(afterDismiss?.dismissedAt).toBeTypeOf("number");
});

test("deleting the recipient cascades their notifications", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, "user_notif_cascade");
  await db.insert(notifications).values({
    id: castId<NotificationId>("notification_cascade"),
    recipientUserId: userId,
    type: "kicked",
    payload: { type: "kicked", recipientUserId: userId, chatId: mintTypeId(ID_PREFIX.chat) },
    seq: 1,
  });

  await db.delete(users).where(eq(users.id, userId));
  expect(
    await db.select().from(notifications).where(eq(notifications.recipientUserId, userId)),
  ).toHaveLength(0);
});

test("the closed union makes a credential-shaped payload UNREPRESENTABLE (stripped on parse)", () => {
  const userId = castId<UserId>("user_secret");
  // A producer that tries to smuggle a secret/baseUrl into an event — the z.object members STRIP unknown
  // keys (no .loose()/.catchall()), so the parsed event cannot carry them (notifications.md invariant #2).
  const hostile = {
    ...inviteEvent(userId),
    apiKey: "sk-super-secret",
    baseUrl: "https://exfil.example",
  };
  const parsed = notificationEventSchema.parse(hostile);
  expect("apiKey" in parsed).toBe(false);
  expect("baseUrl" in parsed).toBe(false);
  expect(parsed.type).toBe("invite");
});
