// verb: record — durable-first write + the secret-free belt + db-driven monotonic seq.

import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { createNotificationsService } from "@orb/server/domain/notifications";
import { beforeEach, describe, expect, test } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { ALICE, BOB, inviteEvent, principal, seedUser } from "../_support";

let db: Db;
let svc: NotificationsService;
const clock = createFrozenClock();

beforeEach(async () => {
  db = await freshDb();
  await seedUser(db, ALICE, "alice");
  await seedUser(db, BOB, "bob");
  svc = createNotificationsService({ db, now: clock.now });
});

describe("record — durable-first", () => {
  test("persists the event and returns it deliverable from the table alone", async () => {
    const view = await svc.record({ event: inviteEvent(ALICE) });
    expect(view.type).toBe("invite");
    expect(view.seq).toBe(1);
    expect(view.createdAt).toBe(clock.frozenAt);
    expect(view.readAt).toBeNull();
    expect(view.dismissedAt).toBeNull();
    // Deliverable from the durable table with NO fan-out path in play — invariant #1.
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

describe("record — the closed union is the secret-free belt (invariant #2)", () => {
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
    // The legitimate fields are preserved.
    expect(payload["type"]).toBe("invite");
    expect(payload["recipientUserId"]).toBe(ALICE);
  });
});
