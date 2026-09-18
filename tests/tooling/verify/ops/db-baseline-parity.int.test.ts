// Pins that the committed migration CHAIN already accounts for the LIVE schema (schema/*.ts — the source
// of truth Drizzle reads at runtime). freshDb PUSHES schema-derived DDL, so the per-table .int tests never
// touch the committed migrations; a schema change with no migration behind it is silent today
// (client.int.test.ts only checks the chain APPLIES + 5 sentinel tables).
//
// THE SUBJECT IS THE CHAIN, NOT THE BASELINE (2026-09-18, #316 Arm A): the comparator generates from the
// chain TIP's snapshot, so a legitimate forward `000N` advances the recorded schema instead of reading as
// drift. Empty `pending` is the only clean verdict.
//
// THE COMPARATOR LIVES IN THE STAGE, NOT HERE (2026-08-02): the drift is now RED at COMMIT time — the
// `structure:db-baseline` stage (`tooling/src/verify/ops/db-baseline-parity.ts`, in `pnpm check`) owns the ONE
// statement diff, and this suite is its second caller. It used to be push-only, which is how two
// baseline-regen misses shipped and sat ~10 hours before `verify --push` caught them (latest: the
// schema_version DEFAULT 5→6 drift, fixed 1160f0a8). Two comparators would be the drift this pins against,
// so there is exactly one.
import { join } from "node:path";
import { compareSchemaBaseline } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

test("the committed migration chain accounts for the live schema (no drift)", async () => {
  const result = await compareSchemaBaseline(ROOT);
  // The statements themselves, not a count — a failure here must NAME the DDL the tree owes a migration
  // for, which is the whole reason the stage prints them.
  expect(result.pending).toEqual([]);
  // …and the comparison really read the chain: a tip of "" / a length of 0 would mean the journal read
  // silently degraded, which would make the emptiness above meaningless.
  expect(result.chainLength).toBeGreaterThan(0);
  expect(result.chainTip).not.toBe("");
});
