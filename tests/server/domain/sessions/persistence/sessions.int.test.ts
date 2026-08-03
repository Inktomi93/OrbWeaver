import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  insertSession,
  listForUser,
  revokeAllForUser,
  revokeById,
  revokeByTokenHash,
  selectForValidation,
  slideExpiry,
} from "../../../../../packages/server/src/domain/sessions/persistence/sessions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const USER_ID = castId<UserId>("user_alice");
const HANDLE = castId<Handle>("alice");
const T0 = 1_750_000_000_000;
const TTL = 1000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
  await db.insert(users).values({ id: USER_ID, handle: HANDLE, role: "owner" });
});

async function seedSession(id: string, tokenHash: string, createdAt: number = T0): Promise<SessionId> {
  const sessionId = castId<SessionId>(id);
  await insertSession(db, {
    id: sessionId,
    userId: USER_ID,
    tokenHash,
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: createdAt + TTL,
    userAgent: null,
  });
  return sessionId;
}

describe("persistence/sessions", () => {
  test("insertSession + selectForValidation joins the owning user (userId/role/handle/enabled)", async () => {
    await seedSession("session_a", "hash-a");
    const row = await selectForValidation(db, "hash-a");
    expect(row?.userId).toBe(USER_ID);
    expect(row?.role).toBe("owner");
    expect(row?.handle).toBe(HANDLE);
    expect(row?.enabled).toBe(true);
    expect(row?.revokedAt).toBeNull();
  });

  test("selectForValidation returns undefined for an unknown hash", async () => {
    expect(await selectForValidation(db, "missing")).toBeUndefined();
  });

  test("slideExpiry bumps lastSeenAt + expiresAt together", async () => {
    const id = await seedSession("session_a", "hash-a");
    await slideExpiry(db, id, T0 + 500, T0 + 500 + TTL);
    const row = await selectForValidation(db, "hash-a");
    expect(row?.lastSeenAt).toBe(T0 + 500);
    expect(row?.expiresAt).toBe(T0 + 500 + TTL);
  });

  test("revokeByTokenHash is atomic — returns the owner ONCE, then nothing", async () => {
    const id = await seedSession("session_a", "hash-a");
    const first = await revokeByTokenHash(db, "hash-a", T0 + 1);
    expect(first).toStrictEqual({ id, userId: USER_ID });
    expect(await revokeByTokenHash(db, "hash-a", T0 + 2)).toBeUndefined();
  });

  test("revokeById flips one device", async () => {
    const id = await seedSession("session_a", "hash-a");
    await revokeById(db, id, T0 + 1);
    expect(await selectForValidation(db, "hash-a")).toMatchObject({ revokedAt: T0 + 1 });
  });

  test("revokeAllForUser returns the ids flipped this call (and not already-revoked ones)", async () => {
    const a = await seedSession("session_a", "hash-a");
    const b = await seedSession("session_b", "hash-b");
    const revoked = await revokeAllForUser(db, USER_ID, T0 + 1);
    expect(revoked.toSorted()).toStrictEqual([a, b].toSorted());
    expect(await revokeAllForUser(db, USER_ID, T0 + 2)).toStrictEqual([]);
  });

  test("listForUser projects the secret-free view, newest-first", async () => {
    const older = await seedSession("session_a", "hash-a", T0);
    const newer = await seedSession("session_b", "hash-b", T0 + 1000);
    const views = await listForUser(db, USER_ID);
    expect(views.map((v) => v.id)).toStrictEqual([newer, older]);
    expect(views[0]).not.toHaveProperty("tokenHash");
    expect(views[0]).not.toHaveProperty("userId");
  });

  test("listForUser caps at the hard ceiling (DoS floor), keeping the newest window", async () => {
    // One over the cap; the STALEST row (created earliest) must be the one dropped by the newest-first cap.
    const cap = 200;
    await Promise.all(Array.from({ length: cap + 1 }, (_, i) => seedSession(`session_${i}`, `hash-${i}`, T0 + i)));
    const views = await listForUser(db, USER_ID);
    expect(views).toHaveLength(cap);
    expect(views.some((v) => v.id === castId<SessionId>("session_0"))).toBe(false);
    expect(views.some((v) => v.id === castId<SessionId>(`session_${cap}`))).toBe(true);
  });
});
