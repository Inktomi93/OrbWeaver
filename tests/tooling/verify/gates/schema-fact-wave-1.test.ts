import { Project } from "ts-morph";
import { describe } from "vitest";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as dbEnumFromTuple } from "../../../../tooling/src/verify/gates/db-enum-from-tuple.ts";
import { gate as fkColumnsIndexed } from "../../../../tooling/src/verify/gates/fk-columns-indexed.ts";
import { gate as fkOnDeleteStated } from "../../../../tooling/src/verify/gates/fk-ondelete-stated.ts";
import { gate as nullableColumnInequality } from "../../../../tooling/src/verify/gates/nullable-column-inequality.ts";
import { gate as ownTablesOnly } from "../../../../tooling/src/verify/gates/own-tables-only.ts";
import { gate as ownerIdRegistry } from "../../../../tooling/src/verify/gates/ownerid-registry.ts";
import { gate as schemaBranding } from "../../../../tooling/src/verify/gates/schema-branding.ts";
import { gate as tableExplicitPrimaryKey } from "../../../../tooling/src/verify/gates/table-explicit-primary-key.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// EACH of these tests concentrates a whole family's proof set — every row builds its own in-memory project
// and resolves schema identities through the shared fact — into ONE test, so the per-TEST default (5 s,
// contention-blind) is the wrong number: measured, this file timed out in a loaded batch while passing in
// 4.9 s alone. `scaledBudget` is the house spelling and grows with the box.
const FAMILY_TIMEOUT_MS = scaledBudget(120_000);

// own-tables-only joins this wave (#1934 fix): its conversion consumes the SAME `drizzleSchemaFact` as the
// rest of the "drizzle-schema" family, but the module previously had NO committed test driving
// `verifyPolicyProofs` over it — its 12 mustFlag/mustPass rows executed nowhere. Landed here rather than a
// dedicated file because its own header already documents the family reuse (schema-branding.ts's sibling
// reasoning: "one computation, several policies"). AUTHORITY ESCALATION: own-tables-only is `authority:
// "hard"` (no suppression door — SCHEMA_OWNERS/TABLE_OWNERS/BULK_READERS/FILE_ALLOWLIST are ruling data,
// never a comment-marker escape), unlike this wave's other members' mixed authorities; its own header
// states this explicitly ("SPLIT FROM THE LEGACY MODULE (authority is HARD...)").
//
// `schema-fact-health` is RETIRED (#1948, owner-ratified 2026-09-11) and no longer in this list: the guarantee
// it claimed ("an empty or unresolved schema census is a broken instrument, never a clean verdict") is the
// dispatcher's own fact-receipt refusal since ab675b23b, and the policy's `if (fact.status !== "ready")` branch
// was provably dead — see the describe block at the bottom, which pins the guarantee where it actually lives.
test(
  "the first Drizzle schema policy wave proves relational integrity, ownership, and brands",
  () => {
    expect(verifyPolicyProofs([schemaBranding, fkColumnsIndexed, fkOnDeleteStated, tableExplicitPrimaryKey, ownTablesOnly])).toEqual([]);
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

// THE SUCCESSOR PINS for the retired `schema-fact-health` (#1948). The mapping that made the policy dead is
// TOTAL: the fact's status union is closed at four members (lib/schema-fact.ts `buildSchema`: unresolved /
// missing / empty / ready), `receipt()` sums tables + columns + fks + indexes, every non-ready branch passes
// `[]` for tables (members 0) and the missing/unresolved branches also set `unresolved: 1`, while `ready` is
// reachable only past the `calls.length === 0` guard, so it always carries members ≥ 1. The dispatcher's
// receipt refusal (lib/policy-pass.ts `factReceiptFailures`, ab675b23b) refuses members 0 or unresolved > 0
// and withholds every consumer BEFORE `evaluate` — so the health policy's "not ready" branch could never run,
// and its two mustFlag rows were red on the unmodified tree for exactly that reason. These pins drive a REAL
// consumer of the fact through `runPolicyPass` on the same two fixtures and assert the guarantee at its
// actual home: the refusal names the fact and the reason, the consumer is withheld, nothing is reported.
const VIRTUAL_ROOT = "/orb-schema-fact-wave-1";
const PROBE = "packages/db/src/schema/probe.ts";

function runConsumer(files: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(`${VIRTUAL_ROOT}/${path}`, content);
  }
  return runPolicyPass({ knownPolicies: [schemaBranding], policies: [schemaBranding], root: VIRTUAL_ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

describe("the shared Drizzle fact's health is the dispatcher's receipt refusal (schema-fact-health RETIRED, #1948)", () => {
  test("a schema population with no canonical Drizzle table: the fact is refused at receipt and its consumer is withheld", () => {
    const result = runConsumer({ [PROBE]: "export const noSchemaTable = true;\n" });
    expect(result.factErrors).toEqual([
      {
        factId: "drizzle-schema",
        phase: "receipt",
        message: expect.stringMatching(/^fact receipt refused: population "drizzle-schema" resolved zero members$/u),
      },
    ]);
    expect(result.toolErrors).toEqual([
      expect.objectContaining({ policyId: "schema-branding", phase: "evaluate", message: expect.stringMatching(/^declared fact failed: drizzle-schema: /u) }),
    ]);
    expect(result.policies[0]?.owner.status).toBe("incomplete");
    expect(result.authority.effectiveFindings).toEqual([]);
  });

  test("an impostor builder leaves the census unresolved: refused at receipt, consumer withheld, no manufactured evidence", () => {
    const result = runConsumer({
      [PROBE]:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        "const fake = { primaryKey: (value: unknown) => value };\n" +
        'export const probe = sqliteTable("probe", { id: text("id") }, (t) => [fake.primaryKey({ columns: [t.id] })]);\n',
    });
    expect(result.factErrors).toEqual([
      {
        factId: "drizzle-schema",
        phase: "receipt",
        message: expect.stringMatching(
          /^fact receipt refused: population "drizzle-schema" resolved zero members; population "drizzle-schema" left 1 unresolved$/u,
        ),
      },
    ]);
    expect(result.toolErrors).toEqual([expect.objectContaining({ policyId: "schema-branding", phase: "evaluate" })]);
    expect(result.policies[0]?.owner.status).toBe("incomplete");
    expect(result.authority.effectiveFindings).toEqual([]);
  });

  test("the healthy control: a resolved census carries members and the consumer runs to a verdict", () => {
    const result = runConsumer({
      [PROBE]: 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const probe = sqliteTable("probe", { id: text("id").primaryKey() });\n',
    });
    expect(result.factErrors).toEqual([]);
    expect(result.toolErrors).toEqual([]);
    expect(result.policies[0]?.owner.status).toBe("success");
    expect(result.facts[0]?.receipts).toEqual([expect.objectContaining({ kind: "population", source: "drizzle-schema", unresolved: 0 })]);
  });
});
