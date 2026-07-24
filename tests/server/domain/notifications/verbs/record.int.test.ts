// verb: record — durable-first write + the secret-free belt + db-driven monotonic seq.

import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { chatParticipants, users } from "@orb/db";
import type { ChatId, ChatParticipantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { ALICE, BOB, inviteEvent, makeNotificationsService, principal, seedUser } from "../_support";

let db: Db;
let svc: NotificationsService;
const clock = createFrozenClock();

beforeEach(async () => {
  db = await freshDb();
  await seedUser(db, ALICE, "alice");
  await seedUser(db, BOB, "bob");
  svc = makeNotificationsService(db, clock.now);
});

describe("record — durable-first", () => {
  test("persists the event and returns it deliverable from the table alone", async () => {
    const view = await svc.record({ event: inviteEvent(ALICE) });
    expect(view.type).toBe("invite");
    expect(view.seq).toBe(1);
    expect(view.createdAt).toBe(clock.frozenAt);
    expect(view.readAt).toBeNull();
    expect(view.dismissedAt).toBeNull();
    // Deliverable from the durable table with NO fan-out path in play — durable-first.
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(view.id);
  });

  test("seq is db-driven monotonic per recipient", async () => {
    const a1 = await svc.record({ event: inviteEvent(ALICE) });
    const a2 = await svc.record({ event: inviteEvent(ALICE) });
    const b1 = await svc.record({ event: inviteEvent(BOB) });
    expect([a1.seq, a2.seq]).toEqual([1, 2]);
    expect(b1.seq).toBe(1);
  });
});

describe("record — coStatements ride the SAME batch (PD-24 tx-atomicity)", () => {
  test("the producer's transition statement + the INSERT commit together; the view carries the db seq", async () => {
    // Stand in for a membership transition: a users-row touch that must commit WITH the notification.
    const transition = db
      .update(users)
      .set({ handle: castId("alice2") })
      .where(eq(users.id, ALICE));
    const view = await svc.record({ event: inviteEvent(ALICE), coStatements: [transition] });

    expect(view.type).toBe("invite");
    expect(view.seq).toBe(1);
    const [row] = await db.select().from(users).where(eq(users.id, ALICE));
    expect(row?.handle).toBe("alice2");
    const page = await svc.list({ principal: principal(ALICE) });
    expect(page.items.map((i) => i.id)).toEqual([view.id]);
  });

  test("a failing co-statement aborts BOTH halves (no transition, no notification row)", async () => {
    // An FK-violating INSERT: chat_participants referencing a chat that does not exist.
    const bad = db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_x"),
      chatId: castId<ChatId>("chat_missing"),
      kind: "human",
      userId: ALICE,
      role: "member",
      joinSeq: 0,
      joinedAt: clock.frozenAt,
    });
    const good = db
      .update(users)
      .set({ handle: castId("alice3") })
      .where(eq(users.id, ALICE));

    await expect(svc.record({ event: inviteEvent(ALICE), coStatements: [good, bad] })).rejects.toThrow();
    // NOTHING committed — not the transition, not the notification (one implicit transaction).
    const [row] = await db.select().from(users).where(eq(users.id, ALICE));
    expect(row?.handle).toBe("alice");
    expect((await svc.list({ principal: principal(ALICE) })).items).toHaveLength(0);
  });
});

describe("record — the closed union is the secret-free belt", () => {
  test("an unknown secret field smuggled onto the event does NOT survive the parse", async () => {
    // The type makes this unrepresentable; force it via a cast to prove the RUNTIME strip at the write seam.
    const dirty = {
      ...inviteEvent(ALICE),
      apiKey: "sk-leak-me",
      baseUrl: "https://evil.example",
    } as unknown as NotificationEvent;
    const view = await svc.record({ event: dirty });
    const payload = view.payload as Record<string, unknown>;
    expect(payload["apiKey"]).toBeUndefined();
    expect(payload["baseUrl"]).toBeUndefined();
    expect(payload["type"]).toBe("invite");
    expect(payload["recipientUserId"]).toBe(ALICE);
  });
});
