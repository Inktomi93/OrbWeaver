// persistence/queries — the table-level invariants against a real libSQL :memory: db: db-driven monotonic
// seq, recipient-scoped reads/flips, dismissed-exclusion + newest-first paging, COALESCE idempotence.

import type { Db } from "@orb/db";
import { notifications } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  dismissScoped,
  insertNotification,
  markAllReadScoped,
  markReadScoped,
  selectInbox,
} from "../../../../../packages/server/src/domain/notifications/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { ALICE, BOB, inviteEvent, kickedEvent, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
  await seedUser(db, ALICE, castId<Handle>("alice"));
  await seedUser(db, BOB, castId<Handle>("bob"));
});

function insert(recipientUserId: typeof ALICE): ReturnType<typeof insertNotification> {
  const event = inviteEvent(recipientUserId);
  return insertNotification(db, {
    id: mintTypeId(ID_PREFIX.notification),
    recipientUserId,
    type: event.type,
    payload: event,
    createdAt: 1000,
  });
}

describe("insertNotification — db-driven monotonic seq", () => {
  test("seq starts at 1 and increments per recipient, independently", async () => {
    const a1 = await insert(ALICE);
    const a2 = await insert(ALICE);
    const b1 = await insert(BOB);
    expect(a1.seq).toBe(1);
    expect(a2.seq).toBe(2);
    expect(b1.seq).toBe(1);
  });

  test("the row is durable — readable from the table alone", async () => {
    const row = await insert(ALICE);
    const stored = await db.select().from(notifications).where(eq(notifications.id, row.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.recipientUserId).toBe(ALICE);
  });
});

describe("selectInbox — recipient-scope + dismissed-exclusion + newest-first", () => {
  test("only the recipient's own rows are returned", async () => {
    await insert(ALICE);
    await insert(BOB);
    const alice = await selectInbox(db, ALICE, undefined, 50);
    expect(alice).toHaveLength(1);
    const bob = await selectInbox(db, BOB, undefined, 50);
    expect(bob).toHaveLength(1);
  });

  test("newest-first by seq; dismissed rows excluded", async () => {
    const first = await insert(ALICE);
    const second = await insert(ALICE);
    await dismissScoped(db, ALICE, first.id, 2000);
    const rows = await selectInbox(db, ALICE, undefined, 50);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.seq).toBe(second.seq);
  });

  test("cursor pages strictly below the given seq", async () => {
    await insert(ALICE);
    const second = await insert(ALICE);
    const third = await insert(ALICE);
    const page = await selectInbox(db, ALICE, third.seq, 50);
    // Excludes third (the cursor itself) — returns the two older rows, newest-first.
    expect(page.map((r) => r.seq)).toEqual([second.seq, 1]);
  });
});

describe("markAllReadScoped — bulk recipient-scope + COALESCE idempotence", () => {
  test("flips every unread row for the recipient in one UPDATE, returns the touched count", async () => {
    await insert(ALICE);
    await insert(ALICE);
    await insert(BOB);
    const count = await markAllReadScoped(db, ALICE, 2000);
    expect(count).toBe(2);
    const rows = await selectInbox(db, ALICE, undefined, 50);
    expect(rows.every((r) => r.readAt === 2000)).toBe(true);
    const bobRows = await selectInbox(db, BOB, undefined, 50);
    expect(bobRows[0]?.readAt).toBeNull();
  });

  test("an already-read row is left with its original instant", async () => {
    const row = await insert(ALICE);
    await markReadScoped(db, ALICE, row.id, 2000);
    await markAllReadScoped(db, ALICE, 9999);
    const [fresh] = await selectInbox(db, ALICE, undefined, 50);
    expect(fresh?.readAt).toBe(2000);
  });

  test("no unread rows means zero touched", async () => {
    const count = await markAllReadScoped(db, ALICE, 2000);
    expect(count).toBe(0);
  });
});

describe("markReadScoped / dismissScoped — scope + COALESCE idempotence", () => {
  test("a non-owner id matches nothing (undefined) and mutates no row", async () => {
    const row = await insert(ALICE);
    const result = await markReadScoped(db, BOB, row.id, 2000);
    expect(result).toBeUndefined();
    const fresh = await db.select().from(notifications).where(eq(notifications.id, row.id));
    expect(fresh[0]?.readAt).toBeNull();
  });

  test("readAt is set once — a re-flip keeps the original instant", async () => {
    const row = await insert(ALICE);
    const first = await markReadScoped(db, ALICE, row.id, 2000);
    const second = await markReadScoped(db, ALICE, row.id, 9999);
    expect(first?.readAt).toBe(2000);
    expect(second?.readAt).toBe(2000);
  });

  test("dismissedAt is set once — idempotent", async () => {
    const event = kickedEvent(ALICE);
    const row = await insertNotification(db, {
      id: mintTypeId(ID_PREFIX.notification),
      recipientUserId: ALICE,
      type: event.type,
      payload: event,
      createdAt: 1000,
    });
    const first = await dismissScoped(db, ALICE, row.id, 3000);
    const second = await dismissScoped(db, ALICE, row.id, 8888);
    expect(first?.dismissedAt).toBe(3000);
    expect(second?.dismissedAt).toBe(3000);
  });
});
