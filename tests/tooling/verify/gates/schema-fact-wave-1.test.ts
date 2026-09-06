import { expect, test } from "vitest";
import { gate as fkColumnsIndexed } from "../../../../tooling/src/verify/gates/fk-columns-indexed.ts";
import { gate as fkOnDeleteStated } from "../../../../tooling/src/verify/gates/fk-ondelete-stated.ts";
import { gate as schemaBranding } from "../../../../tooling/src/verify/gates/schema-branding.ts";
import { gate as schemaFactHealth } from "../../../../tooling/src/verify/gates/schema-fact-health.ts";
import { gate as tableExplicitPrimaryKey } from "../../../../tooling/src/verify/gates/table-explicit-primary-key.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the first Drizzle schema policy wave proves fact health, relational integrity, and brands", () => {
  expect(verifyPolicyProofs([schemaFactHealth, schemaBranding, fkColumnsIndexed, fkOnDeleteStated, tableExplicitPrimaryKey])).toEqual([]);
});
