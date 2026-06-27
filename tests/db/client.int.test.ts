// Smoke .int test for the @orb/db floor: the FK PRAGMA dance, the integrity gate, a users round-trip,
// and the unified constraint classifier. Real libSQL :memory: (the integration lane). NOTE: Wave-0 has
// no FK-bearing tables (users/audit have none), so the constraint test exercises a UNIQUE violation;
// the foreign-key arm of isConstraintViolation is exercised by the Wave-1 slices that land real FKs.

import { assertReferentialIntegrity, createDb, isConstraintViolation, users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../support/db";
import { expect, test } from "../support/fixtures";

const FK_ON = 1;

test("createDb turns foreign_keys ON and the readback sticks", async () => {
  const db = await createDb(":memory:");
  const row = await db.get<Record<string, number>>(sql`PRAGMA foreign_keys`);
  expect(row?.["foreign_keys"]).toBe(FK_ON);
});

test("assertReferentialIntegrity passes on the freshly-applied schema", async () => {
  const db = await freshDb();
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
});

test("users insert→select round-trips (branded id survives, role enum accepted)", async () => {
  const db = await freshDb();
  const id = castId<UserId>("user_roundtrip");
  await db.insert(users).values({
    id,
    handle: castId<Handle>("alice"),
    role: "owner",
  });

  const rows = await db.select().from(users).where(eq(users.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.role).toBe("owner");
  expect(rows[0]?.enabled).toBe(true);
});

test("a UNIQUE violation is caught + classified by isConstraintViolation", async () => {
  const db = await freshDb();
  const externalId = castId<ExternalId>("sso-sub-shared");
  await db.insert(users).values({
    id: castId<UserId>("user_a"),
    handle: castId<Handle>("user-a"),
    externalId,
  });

  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_b"),
      handle: castId<Handle>("user-b"),
      externalId, // collides on the unique-when-set external_id index
    });
  } catch (err) {
    caught = err;
  }

  const violation = isConstraintViolation(caught);
  expect(violation).toBeDefined();
  expect(violation?.kind).toBe("unique");
});
