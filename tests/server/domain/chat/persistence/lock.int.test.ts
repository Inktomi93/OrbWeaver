import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import {
  reclaimChatLocksOnBoot,
  refreshLock,
  releaseLock,
  tryAcquireLock,
} from "../../../../../packages/server/src/domain/chat/persistence/lock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { seedChat } from "../_support";

const T0 = 1_750_000_000_000;
const TTL = 60_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("persistence/lock — the per-chat turn lock", () => {
  test("tryAcquireLock takes a free lock; a contended fresh lock is refused", async () => {
    const chatId = await seedChat(db, "a");
    expect(await tryAcquireLock(db, { chatId, holder: "r1", now: T0, expiresAt: T0 + TTL })).toBe(
      true,
    );
    // r2 contends while r1's lock is still fresh → refused.
    expect(await tryAcquireLock(db, { chatId, holder: "r2", now: T0, expiresAt: T0 + TTL })).toBe(
      false,
    );
  });

  test("tryAcquireLock STEALS a stale lock (expiresAt <= now)", async () => {
    const chatId = await seedChat(db, "a");
    await tryAcquireLock(db, { chatId, holder: "r1", now: T0, expiresAt: T0 + TTL });
    // r2 contends AFTER r1's TTL horizon → steal succeeds.
    const stolen = await tryAcquireLock(db, {
      chatId,
      holder: "r2",
      now: T0 + TTL + 1,
      expiresAt: T0 + TTL + 1 + TTL,
    });
    expect(stolen).toBe(true);
  });

  test("refreshLock extends only while THIS holder owns it", async () => {
    const chatId = await seedChat(db, "a");
    await tryAcquireLock(db, { chatId, holder: "r1", now: T0, expiresAt: T0 + TTL });
    expect(await refreshLock(db, chatId, "r1", T0 + TTL * 2)).toBe(true);
    expect(await refreshLock(db, chatId, "imposter", T0 + TTL * 3)).toBe(false);
  });

  test("releaseLock is holder-scoped + idempotent; releases only the owner's lock", async () => {
    const chatId = await seedChat(db, "a");
    await tryAcquireLock(db, { chatId, holder: "r1", now: T0, expiresAt: T0 + TTL });
    // A non-owner release is a no-op — the lock survives, so a fresh acquire is still refused.
    await releaseLock(db, chatId, "imposter");
    expect(await tryAcquireLock(db, { chatId, holder: "r2", now: T0, expiresAt: T0 + TTL })).toBe(
      false,
    );
    // The owner releases → the lock is free again.
    await releaseLock(db, chatId, "r1");
    expect(await tryAcquireLock(db, { chatId, holder: "r2", now: T0, expiresAt: T0 + TTL })).toBe(
      true,
    );
  });

  test("boot reclaim clears only this replica's holder + returns the count", async () => {
    const a = await seedChat(db, "a");
    const b = await seedChat(db, "b");
    const c = await seedChat(db, "c");
    await tryAcquireLock(db, { chatId: a, holder: "r1", now: T0, expiresAt: T0 + TTL });
    await tryAcquireLock(db, { chatId: b, holder: "r1", now: T0, expiresAt: T0 + TTL });
    await tryAcquireLock(db, { chatId: c, holder: "r2", now: T0, expiresAt: T0 + TTL });

    expect(await reclaimChatLocksOnBoot(db, "r1")).toBe(2);
    // r2's live lock survived the r1 boot-reclaim.
    expect(
      await tryAcquireLock(db, { chatId: c, holder: "r3", now: T0, expiresAt: T0 + TTL }),
    ).toBe(false);
  });
});
