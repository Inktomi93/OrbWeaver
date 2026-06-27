// users.int — the identity-root users slice against a real libSQL :memory: db (FK enforcement ON via
// createDb). Covers: the role CHECK (off-enum rejected) + the test-mirror that the db column DERIVES
// USER_ROLES (db === contracts), the role default, the handle UNIQUE, the externalId UNIQUE-when-set
// partial index (multiple nulls coexist, equal non-nulls collide), and the epoch-ms NUMBER timestamps.

import { USER_ROLES } from "@orb/contracts/identity";
import { isConstraintViolation, users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// The default global role a freshly-provisioned user lands on (owner/admin are granted explicitly — D17).
const DEFAULT_ROLE = "user";

test("the users_role_check CHECK rejects an off-enum role", async () => {
  const db = await freshDb();

  // A `string`-typed value downcast to the enum union forces an invalid value at the SQL boundary
  // (a bare string-literal `as` would trip TS2352 — the literal doesn't overlap the union).
  const invalidRole: string = "nope";

  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_bad_role"),
      handle: castId<Handle>("user_bad_role"),
      role: invalidRole as (typeof USER_ROLES)[number],
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("test-mirror: the users.role column derives the canonical USER_ROLES tuple", () => {
  // Pins db === contracts: the schema enum is built FROM the contracts tuple, never re-spelled.
  expect([...users.role.enumValues]).toEqual([...USER_ROLES]);
});

test("a user round-trips with the default role and epoch-ms NUMBER timestamps", async () => {
  const db = await freshDb();
  const id = castId<UserId>("user_defaults");

  await db.insert(users).values({ id, handle: castId<Handle>("user_defaults") });

  const rows = await db.select().from(users).where(eq(users.id, id));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  // The role defaults (it is never spelled at insert time here).
  expect(row?.role).toBe(DEFAULT_ROLE);
  // externalId is null on the owner-fallback / single-user path.
  expect(row?.externalId).toBeNull();
  // Timestamps are plain integer epoch-ms NUMBERS — never Date instances.
  expect(row?.createdAt).toBeTypeOf("number");
  expect(row?.updatedAt).toBeTypeOf("number");
});

test("the handle UNIQUE index rejects a duplicate handle", async () => {
  const db = await freshDb();
  const handle = castId<Handle>("dup_handle");
  await db.insert(users).values({ id: castId<UserId>("user_handle_a"), handle });

  let caught: unknown;
  try {
    await db.insert(users).values({ id: castId<UserId>("user_handle_b"), handle });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("the externalId UNIQUE-when-set partial index lets multiple null externalIds coexist", async () => {
  const db = await freshDb();

  // SQLite's UNIQUE ignores NULL rows (reinforced by the partial `where externalId is not null`), so
  // many SSO-less users coexist.
  await db.insert(users).values([
    { id: castId<UserId>("user_null_ext_a"), handle: castId<Handle>("user_null_ext_a") },
    { id: castId<UserId>("user_null_ext_b"), handle: castId<Handle>("user_null_ext_b") },
  ]);

  const rows = await db.select().from(users);
  expect(rows).toHaveLength(2);
});

test("the externalId UNIQUE-when-set partial index rejects two equal non-null externalIds", async () => {
  const db = await freshDb();
  const externalId = castId<ExternalId>("sso_subject_one");
  await db.insert(users).values({
    id: castId<UserId>("user_ext_a"),
    handle: castId<Handle>("user_ext_a"),
    externalId,
  });

  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_ext_b"),
      handle: castId<Handle>("user_ext_b"),
      externalId,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});
