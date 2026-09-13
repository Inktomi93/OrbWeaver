// db/kit/batch — the ONE sanctioned bridge from a plain statement array into the non-empty tuple
// `Db.batch` wants.
//
// #1377 item 3 asked for the helper to stop "lying about what it accepts" by REFUSING `[]`. That premise
// was REFUTED by probe against a real migrated libSQL db: `db.batch([])` RESOLVES with `[]` — it does not
// reject, contrary to what the helper's own JSDoc asserted. So an empty batch is a harmless no-op and the
// lie was the CONTRACT, not the runtime; ~90 call sites hand this a computed array whose empty case is a
// legitimate "nothing to write", and refusing it would have converted every one into a crash. These pin
// the truth so the next reader does not re-derive it — and so a driver upgrade that DID start rejecting
// `[]` shows up here rather than in production.

import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

/** A stand-in statement — `batchMany` is a typed pass-through and never touches the value. */
// @orb-waive no-test-fabrication(unknown): `batchMany` is a typed PASS-THROUGH — it never reads the statement, so a real drizzle Ends when this deliberate test boundary can be expressed without a fabricated typed value.
// builder would add setup that proves nothing. The cast is the probe subject, not a shortcut around one.
const STMT = { __stmt: true } as unknown as BatchStmt;

test("passes a list through by IDENTITY — it is a cast, never a copy or a filter", () => {
  const stmts = [STMT, STMT];
  expect(batchMany(stmts)).toBe(stmts);
  expect(batchMany([])).toEqual([]);
});

test("db.batch of an EMPTY list is a no-op that RESOLVES — the premise this helper documented is false", async () => {
  const db = await freshDb();
  await expect(db.batch(batchMany([]))).resolves.toEqual([]);
});
