// db-errors classifier coverage. The unified `isConstraintViolation` 4-depth cause-walk is the replacement
// for neo's scattered marker predicates; domains branch on `.kind`. The `unique`/`foreign-key` arms are
// exercised by the schema tests, but `check` and `not-null` were not — these pin them against real libSQL
// constraint errors (raw inserts that bypass drizzle's typed-insert guards).
import { isConstraintViolation } from "@orb/db/kit";
import { sql } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

test("classifies a CHECK violation as kind 'check'", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    // `role` carries a tuple-derived CHECK; "nope" is not a USER_ROLES member.
    await db.run(sql.raw("insert into users (id, handle, handle_key, role) values ('user_chk', 'h-chk', 'h-chk', 'nope')"));
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

// ── the cause walk is CYCLE-SAFE, not depth-4 (#1377 item 4) ─────────────────────────────────────────
// Four was an arbitrary number chosen off "every observed shape". Past it the classifier returned
// undefined and a caller branching on `.kind` (e.g. `domain/tag/verbs/update.ts`) fell through to
// `throw err`, so a deeply-wrapped constraint violation surfaced as a raw opaque error instead of a typed
// domain conflict. The honest bound is the one the walk genuinely needs: stop when a cause repeats.

/** An error chain `depth` links long whose DEEPEST link is the real constraint error. */
function wrapped(depth: number): unknown {
  let err: unknown = Object.assign(new Error("UNIQUE constraint failed: users.handle"), { code: "SQLITE_CONSTRAINT_UNIQUE" });
  for (let i = 0; i < depth; i += 1) {
    err = Object.assign(new Error(`wrapper ${i}`), { cause: err });
  }
  return err;
}

test("a constraint error found at ANY cause depth is classified, not lost past four levels", () => {
  expect(isConstraintViolation(wrapped(0))?.kind).toBe("unique");
  expect(isConstraintViolation(wrapped(3))?.kind).toBe("unique");
  // Depth 4+ used to return undefined — the exact case that reached a caller as an opaque throw.
  expect(isConstraintViolation(wrapped(4))?.kind).toBe("unique");
  expect(isConstraintViolation(wrapped(12))?.kind).toBe("unique");
});

test("a CYCLIC cause chain terminates instead of spinning", () => {
  const a: { message: string; cause?: unknown } = { message: "a" };
  const b: { message: string; cause?: unknown } = { message: "b", cause: a };
  a.cause = b;
  expect(isConstraintViolation(a)).toBeUndefined();
});
