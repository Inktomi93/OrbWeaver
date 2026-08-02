// Pins that the committed migrations/0000_baseline.sql equals what the LIVE schema (schema/*.ts — the
// source of truth Drizzle reads at runtime) would generate. freshDb PUSHES schema-derived DDL, so the
// per-table .int tests never touch the committed baseline; a schema change without regenerating the
// baseline is silent today (client.int.test.ts only checks the baseline APPLIES + 5 sentinel tables).
//
// THE COMPARATOR LIVES IN THE STAGE, NOT HERE (2026-08-02): the drift is now RED at COMMIT time — the
// `structure:db-baseline` stage (`scripts/verify/db-baseline-parity.ts`, in `pnpm check`) owns the ONE
// statement diff, and this suite is its second caller. It used to be push-only, which is how two
// baseline-regen misses shipped and sat ~10 hours before `verify --push` caught them (latest: the
// schema_version DEFAULT 5→6 drift, fixed 1160f0a8). Two comparators would be the drift this pins against,
// so there is exactly one.
import { join } from "node:path";
import { compareSchemaBaseline } from "../../scripts/verify/db-baseline-parity.ts";
import { expect, test } from "../support/fixtures";

const ROOT = join(import.meta.dirname, "..", "..");

test("committed 0000_baseline.sql matches the live schema (no drift)", async () => {
  const result = await compareSchemaBaseline(ROOT);
  // Named both directions — a missing CREATE (never regenerated) reads differently from a stale one
  // (hand-edited baseline), and the stage prints the same two groups.
  expect(result.missingFromBaseline).toEqual([]);
  expect(result.staleInBaseline).toEqual([]);
  // Count last: with both diffs empty this can only fail on a duplicated statement, which the set-diff
  // above cannot see.
  expect(result.actual.length).toBe(result.expected.length);
});
