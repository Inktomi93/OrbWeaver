// db-errors classifier coverage. The unified `isConstraintViolation` 4-depth cause-walk is the replacement
// for neo's scattered marker predicates; domains branch on `.kind`. The `unique`/`foreign-key` arms are
// exercised by the schema tests, but `check` and `not-null` were not — these pin them against real libSQL
// constraint errors (raw inserts that bypass drizzle's typed-insert guards).
import { isConstraintViolation } from "@orb/db";
import { sql } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

test("classifies a CHECK violation as kind 'check'", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    // `role` carries a tuple-derived CHECK; "nope" is not a USER_ROLES member.
    await db.run(sql.raw("insert into users (id, handle, role) values ('user_chk', 'h-chk', 'nope')"));
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("classifies a NOT NULL violation as kind 'not-null'", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    // `handle` is NOT NULL with no default — omitting it trips the NOT NULL constraint.
    await db.run(sql.raw("insert into users (id, role) values ('user_nn', 'user')"));
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("not-null");
});

test("returns undefined for a non-constraint error", () => {
  expect(isConstraintViolation(new Error("just a plain error"))).toBeUndefined();
  expect(isConstraintViolation("not even an error")).toBeUndefined();
});
