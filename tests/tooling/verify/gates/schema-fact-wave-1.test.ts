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
// it claimed ("an empty or unresolved schema census is a broken instrument, never a clean verdict") is owned by
// the runtime rather than by a policy, and the module's `if (fact.status !== "ready")` branch was provably dead.
// WHICH RUNTIME PHASE owns it changed on 2026-09-11 (#1962): it was the dispatcher's fact-receipt refusal
// (ab675b23b) until that receipt was corrected to state the denominator the provider WALKED instead of the
// census it FOUND (§12.3); it is now every consumer's own fail-closed `recordReadySchemaFact`, which throws on
// any non-`ready` status. The retirement ruling survives — its INPUT moved one phase later. See the describe
// block at the bottom, which pins the guarantee where it actually lives.
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
// missing / empty / ready), and every consumer of the fact calls `recordReadySchemaFact`, which throws on any
// status but `ready` — so the health policy's "not ready" branch could never run, and its two mustFlag rows
// were red on the unmodified tree for exactly that reason.
//
// WHERE THE REFUSAL LIVES MOVED ONE PHASE ON 2026-09-11 (#1962), and these pins moved with it. It used to be
// the dispatcher's fact-receipt refusal (`lib/policy-pass.ts` `factReceiptFailures`, ab675b23b): the provider
// receipted its CENSUS, so members 0 / unresolved 1 refused the FACT and withheld every consumer before
// `evaluate`. That is the §12.3 anti-pattern — a receipt states the denominator walked, never what was found —
// and it is what kept `freeze-provenance-write-pairing-health`'s empty-schema arm unexecutable. The provider
// now receipts its walked sources, the census is DELIVERED, and the guarantee is asserted at its new home:
// the CONSUMER's fail-closed read throws, the consumer is incomplete and withheld, nothing is reported. The
// loudness is identical — a tool error either way — and only the accused moves from the fact to the policy.
const VIRTUAL_ROOT = "/orb-schema-fact-wave-1";
const PROBE = "packages/db/src/schema/probe.ts";

function runConsumer(files: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(`${VIRTUAL_ROOT}/${path}`, content);
  }
  return runPolicyPass({ knownPolicies: [schemaBranding], policies: [schemaBranding], root: VIRTUAL_ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

describe("the shared Drizzle fact's health is its CONSUMER's fail-closed read (schema-fact-health RETIRED, #1948; phase moved #1962)", () => {
  test("a schema population with no canonical Drizzle table: the census is DELIVERED and its consumer refuses on it", () => {
    const result = runConsumer({ [PROBE]: "export const noSchemaTable = true;\n" });
    // The provider SUCCEEDS: it walked one authored schema source and says so. Emptiness is the fact's own
    // modelled status, which is exactly what makes `freeze-provenance-write-pairing-health` able to REPORT
    // this corpus instead of dying on it (#1962).
    expect(result.factErrors).toEqual([]);
    expect(result.facts[0]).toMatchObject({ id: "drizzle-schema", status: "success", receipts: [{ source: "drizzle-schema-sources", members: 1 }] });
    expect(result.toolErrors).toEqual([
      expect.objectContaining({
        policyId: "schema-branding",
        phase: "evaluate",
        message: expect.stringMatching(/^drizzle schema fact empty: schema source population declares no Drizzle SQLite tables$/u),
      }),
    ]);
    expect(result.policies[0]?.owner.status).toBe("incomplete");
    expect(result.authority.effectiveFindings).toEqual([]);
  });

  test("an impostor builder leaves the census unresolved: the consumer refuses, no manufactured evidence", () => {
    const result = runConsumer({
      [PROBE]:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        "const fake = { primaryKey: (value: unknown) => value };\n" +
        'export const probe = sqliteTable("probe", { id: text("id") }, (t) => [fake.primaryKey({ columns: [t.id] })]);\n',
    });
    expect(result.factErrors).toEqual([]);
    expect(result.toolErrors).toEqual([
      expect.objectContaining({ policyId: "schema-branding", phase: "evaluate", message: expect.stringMatching(/^drizzle schema fact unresolved: /u) }),
    ]);
    expect(result.policies[0]?.owner.status).toBe("incomplete");
    expect(result.authority.effectiveFindings).toEqual([]);
  });

  test("the healthy control: a resolved census reaches the consumer and it runs to a verdict", () => {
    const result = runConsumer({
      [PROBE]: 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const probe = sqliteTable("probe", { id: text("id").primaryKey() });\n',
    });
    expect(result.factErrors).toEqual([]);
    expect(result.toolErrors).toEqual([]);
    expect(result.policies[0]?.owner.status).toBe("success");
    expect(result.facts[0]?.receipts).toEqual([expect.objectContaining({ kind: "population", source: "drizzle-schema-sources", members: 1 })]);
    // The CONSUMER's receipt is the census — `recordReadySchemaFact` files `fact.receipt.members` — which is
    // the sanctioned blindness door, one phase later and per consumer. The two receipts are different
    // objects with different jobs; conflating them is what #1962 undid.
    expect(result.policies[0]?.receipts).toEqual([expect.objectContaining({ kind: "population", source: "drizzle-schema", members: 2 })]);
  });
});
