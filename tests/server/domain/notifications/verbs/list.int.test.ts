// verb: list — recipient-scoped, newest-first, dismissed-excluded, cursor-paged on seq.

import type { Db } from "@orb/db";
import { chatInvites } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { beforeEach, describe } from "vitest";
import { createFrozenClock } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { ALICE, BOB, inviteEvent, kickedEvent, makeNotificationsService, principal, seedUser } from "../_support.ts";

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

// ── `actionable` — the #1799 read model, END TO END ─────────────────────────────────────────────────
// The domain suite runs the REAL resolver (`_support.makeNotificationsService`), so these are not a stub
// agreeing with itself: the invite events below name REAL `chat_invites` rows, and what the wire says is
// what the chat tables say.
describe("list — actionable (#1799)", () => {
  test("an invite the chat domain still holds open is actionable; a settled one is not, with the row unmoved", async () => {
    const chat = await seedChat(db, { id: mintTypeId(ID_PREFIX.chat) });
    const open = mintTypeId(ID_PREFIX.chatInvite);
    const settled = mintTypeId(ID_PREFIX.chatInvite);
    await db.insert(chatInvites).values([
      { id: open, chatId: chat.id, tokenHash: `hash_${open}`, invitedUserId: ALICE, status: "pending", createdAt: 0 },
      // Accepted from a share link, or accepted here with a failed follow-up dismiss (#1501): the ask is
      // gone and the inbox row is not.
      { id: settled, chatId: chat.id, tokenHash: `hash_${settled}`, invitedUserId: ALICE, status: "accepted", createdAt: 0 },
    ]);
    await svc.record({ event: { type: "invite", recipientUserId: ALICE, chatId: chat.id, inviteId: settled, invitedByHandle: castId<Handle>("host") } });
    await svc.record({ event: { type: "invite", recipientUserId: ALICE, chatId: chat.id, inviteId: open, invitedByHandle: castId<Handle>("host") } });

    const page = await svc.list({ principal: principal(ALICE) });

    // Newest-first: the open one, then the settled one. BOTH rows are present — that is the point.
    expect(page.items.map((i) => i.actionable)).toEqual([true, false]);
  });

  test("an informational row is never actionable", async () => {
    await svc.record({ event: kickedEvent(ALICE) });
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items[0]?.actionable).toBe(false);
  });

  test("the RESUME wire agrees with the list wire, row for row", async () => {
    // The one property two wires carrying one view owe each other. A reader whose live resume disagreed
    // with its page load would see the bell flicker for reasons nothing could reproduce.
    const chat = await seedChat(db, { id: mintTypeId(ID_PREFIX.chat) });
    const open = mintTypeId(ID_PREFIX.chatInvite);
    await db.insert(chatInvites).values({ id: open, chatId: chat.id, tokenHash: `hash_${open}`, invitedUserId: ALICE, status: "pending", createdAt: 0 });
    await svc.record({ event: { type: "invite", recipientUserId: ALICE, chatId: chat.id, inviteId: open, invitedByHandle: castId<Handle>("host") } });
    await svc.record({ event: kickedEvent(ALICE) });

    const listed = await svc.list({ principal: principal(ALICE) });
    const resumed = await svc.replaySince({ principal: principal(ALICE), afterSeq: 0 });

    expect(new Map(listed.items.map((i) => [i.id, i.actionable]))).toEqual(new Map(resumed.map((i) => [i.id, i.actionable])));
    expect([...resumed].map((i) => i.actionable)).toEqual([true, false]);
  });
});
