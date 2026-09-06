import { gate as dbEnumFromTuple } from "../../../../tooling/src/verify/gates/db-enum-from-tuple.ts";
import { gate as fkColumnsIndexed } from "../../../../tooling/src/verify/gates/fk-columns-indexed.ts";
import { gate as fkOnDeleteStated } from "../../../../tooling/src/verify/gates/fk-ondelete-stated.ts";
import { gate as nullableColumnInequality } from "../../../../tooling/src/verify/gates/nullable-column-inequality.ts";
import { gate as ownerIdRegistry } from "../../../../tooling/src/verify/gates/ownerid-registry.ts";
import { gate as schemaBranding } from "../../../../tooling/src/verify/gates/schema-branding.ts";
import { gate as schemaFactHealth } from "../../../../tooling/src/verify/gates/schema-fact-health.ts";
import { gate as tableExplicitPrimaryKey } from "../../../../tooling/src/verify/gates/table-explicit-primary-key.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// EACH of these tests concentrates a whole family's proof set — every row builds its own in-memory project
// and resolves schema identities through the shared fact — into ONE test, so the per-TEST default (5 s,
// contention-blind) is the wrong number: measured, this file timed out in a loaded batch while passing in
// 4.9 s alone. `scaledBudget` is the house spelling and grows with the box.
const FAMILY_TIMEOUT_MS = scaledBudget(120_000);

test(
  "the first Drizzle schema policy wave proves fact health, relational integrity, and brands",
  () => {
    expect(verifyPolicyProofs([schemaFactHealth, schemaBranding, fkColumnsIndexed, fkOnDeleteStated, tableExplicitPrimaryKey])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);

// The second wave: ownership classification, the D34 enum derive, and the D124 nullable-inequality reader.
// All three consume the SAME `drizzleSchemaFact` and own no schema parsing of their own, which is why they
// join this entry rather than growing a per-policy test file.
test(
  "the schema-fact consumer wave proves ownership, enum derivation, and nullable-inequality",
  () => {
    expect(verifyPolicyProofs([ownerIdRegistry, dbEnumFromTuple, nullableColumnInequality])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);
