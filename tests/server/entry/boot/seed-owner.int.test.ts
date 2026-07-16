// entry/boot/seed-owner — the privileged boot owner backfill. Real libSQL :memory: (the .int lane). Covers:
// a non-owner row at an OWNER handle is flipped to role=owner; the returned ids match; idempotent (a second
// run keeps role=owner and does NOT re-stamp updated_at, proving the ne(role,'owner') guard changed 0 rows);
// a row whose handle is NOT in OWNER_HANDLES is left untouched. `ensureUser` is stubbed to the row the test
// seeded (its JIT-create mechanics are tested in domain/sessions — this isolates the backfill).
//
// The AUTH_MODE=local password-seed block below runs against the REAL sessions service (real ensureUser +
// real scrypt hasher over one pepper): a fresh local owner is FORM-loginable via the real `authenticate`
// verb; a re-boot never clobbers a subsequently-rotated password; and without the password deps (single-user
// / SSO) no hash is ever written.

import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSessionsService } from "@orb/server/domain/sessions";
import { seedOwner } from "@orb/server/entry/boot";
import { createPasswordHasher } from "@orb/server/infra/auth";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";

const OWNER_ID = castId<UserId>("u_owner");
const OTHER_ID = castId<UserId>("u_other");

// ≥32 chars — the SESSION_SECRET pepper floor (mirrors the sessions harness).
const PEPPER = "test-session-secret-at-least-32-chars-long";
const INITIAL_PASSWORD = "correct horse battery";

test("backfills a non-owner OWNER-handle row to role=owner + returns its id", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(users).values({ id: OWNER_ID, handle: castId<Handle>("owner"), role: "user" });

  const ids = await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
    ownerHandles: ["owner"],
    now: clock.now,
  });

  expect(ids).toEqual([OWNER_ID]);
  const [row] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  expect(row?.role).toBe("owner");
});

test("idempotent — a second run keeps role=owner and does not re-stamp updated_at", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(users).values({ id: OWNER_ID, handle: castId<Handle>("owner"), role: "user", updatedAt: 1 });

  await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
    ownerHandles: ["owner"],
    now: clock.now,
  });
  const [afterFirst] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  const stampedAt = afterFirst?.updatedAt;
  expect(afterFirst?.role).toBe("owner");

  clock.advance(10_000);
  await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
    ownerHandles: ["owner"],
    now: clock.now,
  });
  const [afterSecond] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  expect(afterSecond?.role).toBe("owner");
  // The ne(role,'owner') guard matched 0 rows on the second run → updated_at is unchanged.
  expect(afterSecond?.updatedAt).toBe(stampedAt);
});

test("refuses a multi-handle owner set — fail-fast, not a UNIQUE loop (D17: exactly one owner)", async ({ clock }) => {
  const db = await freshDb();
  await expect(
    seedOwner({
      db,
      sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
      ownerHandles: ["alice", "bob"],
      now: clock.now,
    }),
  ).rejects.toThrow("EXACTLY ONE owner");
});

test("leaves a non-OWNER-handle row untouched (stays role=user)", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(users).values({ id: OTHER_ID, handle: castId<Handle>("someone"), role: "user" });

  await seedOwner({
    db,
    // ensureUser would JIT-create the owner row in production; here the test only cares the OTHER row is left alone.
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
    ownerHandles: ["owner"],
    now: clock.now,
  });

  const [row] = await db.select().from(users).where(eq(users.id, OTHER_ID));
  expect(row?.role).toBe("user");
});

test("AUTH_MODE=local: a fresh owner is form-loginable via the real authenticate path", async ({ clock }) => {
  const db = await freshDb();
  // Real sessions service = real ensureUser (JIT-create) + real scrypt verify over the same pepper.
  const sessions = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });

  const [ownerId] = await seedOwner({
    db,
    sessions,
    ownerHandles: ["owner"],
    now: clock.now,
    initialPassword: INITIAL_PASSWORD,
    hashPassword: createPasswordHasher(PEPPER).hash,
  });

  // The row now carries a real scrypt$ hash (never the cleartext).
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.handle, castId<Handle>("owner")));
  expect(row?.role).toBe("owner");
  expect(row?.passwordHash?.startsWith("scrypt$")).toBe(true);
  expect(row?.passwordHash).not.toContain(INITIAL_PASSWORD);

  // The real login path accepts the seeded password and rejects a wrong one.
  expect(await sessions.authenticate("owner", INITIAL_PASSWORD)).toBe(ownerId);
  expect(await sessions.authenticate("owner", "not the password")).toBeNull();
});

test("re-boot does NOT clobber a subsequently-rotated owner password", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
  const hasher = createPasswordHasher(PEPPER);

  await seedOwner({
    db,
    sessions,
    ownerHandles: ["owner"],
    now: clock.now,
    initialPassword: INITIAL_PASSWORD,
    hashPassword: hasher.hash,
  });

  // The owner rotates their password after first login (a distinct hash lands on the row).
  const rotatedPassword = "a different pass phrase";
  const rotatedHash = await hasher.hash(rotatedPassword);
  await db
    .update(users)
    .set({ passwordHash: rotatedHash })
    .where(eq(users.handle, castId<Handle>("owner")));

  // A restart with LOCAL_INITIAL_PASSWORD still set must leave the rotated hash untouched.
  clock.advance(10_000);
  await seedOwner({
    db,
    sessions,
    ownerHandles: ["owner"],
    now: clock.now,
    initialPassword: INITIAL_PASSWORD,
    hashPassword: hasher.hash,
  });

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.handle, castId<Handle>("owner")));
  expect(row?.passwordHash).toBe(rotatedHash);
  // The env value no longer logs in; the rotated password does.
  expect(await sessions.authenticate("owner", INITIAL_PASSWORD)).toBeNull();
  expect(await sessions.authenticate("owner", rotatedPassword)).not.toBeNull();
});

test("no initialPassword (single-user / SSO): the owner row is seeded WITHOUT a password", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });

  await seedOwner({ db, sessions, ownerHandles: ["owner"], now: clock.now });

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.handle, castId<Handle>("owner")));
  expect(row?.role).toBe("owner");
  expect(row?.passwordHash).toBeNull();
  // No hash → the local login path cannot authenticate (SSO/fallback owns identity in these modes).
  expect(await sessions.authenticate("owner", INITIAL_PASSWORD)).toBeNull();
});
