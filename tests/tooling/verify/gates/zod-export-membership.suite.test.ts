import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/zod-export-membership.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/zod-export-membership";

function drive(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  project.resolveSourceFileDependencies();
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test("zod-export-membership proves every ownership class and its fail-closed population arms through production conformance", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the production pass reports renamed and barrel-exported schemas at the canonical declaration", () => {
  const proof = gate.mustFlag[1];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    {
      subject: "packages/contracts/src/leaf.ts",
      operation: "schema-only-export:internal",
      token: "internal",
    },
  ]);
  expect(result.policies[0]?.receipts).toEqual([
    {
      kind: "population",
      source: "zod-export-membership [derived=0, twins=0, factories=0, schema-only=1]",
      members: 1,
      unresolved: 0,
    },
  ]);
});

test("a schema-free product corpus withholds the gate instead of returning a vacuous clean verdict", () => {
  const proof = gate.mustRefuse[0];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toContain(gate.id);
  expect(result.policies[0]?.receipts).toEqual([
    {
      kind: "population",
      source: "zod-export-membership [derived=0, twins=0, factories=0, schema-only=0]",
      members: 0,
      unresolved: 0,
    },
  ]);
});

test("nested default-object schemas enter the denominator once at their stable export path", () => {
  const proof = gate.mustFlag[3];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    {
      subject: "packages/contracts/src/x.ts",
      operation: "schema-only-export:default.nested.wire",
      token: "wire",
    },
  ]);
  expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 0 }]);
});

test("an exported aggregate alias does not double-count a directly exported schema", () => {
  const proof = gate.mustFlag[5];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    {
      subject: "packages/contracts/src/x.ts",
      operation: "schema-only-export:wire",
      token: "wire",
    },
  ]);
  expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 0 }]);
});

test("aggregate shorthand preserves the private schema identity at its public path", () => {
  const proof = gate.mustFlag[6];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ operation: "schema-only-export:default.hidden", token: "hidden" }]);
  expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 0 }]);
});

test("resolvable aggregate spreads retain stable exported property paths", () => {
  const proof = gate.mustFlag[7];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ operation: "schema-only-export:default.wire", token: "wire" }]);
  expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 0 }]);
});

test("schema array exports use stable element paths", () => {
  const proof = gate.mustFlag[8];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ operation: "schema-only-export:default[0]" }]);
  expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 0 }]);
});

test("a bare Zod subclass return remains a grantable schema-only builder", () => {
  const proof = gate.mustFlag[9];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ operation: "schema-only-export:lift", token: "lift" }]);
  expect(result.policies[0]?.receipts).toMatchObject([{ source: expect.stringContaining("schema-only=1"), members: 1, unresolved: 0 }]);
});

test("a fixed schema factory cannot become generated by adding an unused parameter", () => {
  const proof = gate.mustFlag[4];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    {
      subject: "packages/contracts/src/x.ts",
      operation: "schema-only-export:makeWire",
      token: "makeWire",
    },
  ]);
  expect(result.policies[0]?.receipts).toMatchObject([{ source: expect.stringContaining("schema-only=1"), members: 1, unresolved: 0 }]);
});

test("concrete object and static property accesses still expose schema members", () => {
  for (const index of [10, 11]) {
    const proof = gate.mustFlag[index];
    if (proof === undefined) {
      throw new Error(`missing mustFlag proof ${String(index)}`);
    }
    const result = drive(proof.files);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toMatchObject([{ operation: "schema-only-export:publicSchemas.wire", token: "wire" }]);
    expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 0 }]);
  }
});

test("derived output ownership binds through an exported value alias", () => {
  const proof = gate.mustPass[3];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.receipts).toMatchObject([{ source: expect.stringContaining("derived=1"), members: 1, unresolved: 0 }]);
});

test("a static property derives through its own symbol while export reach stays on the class", () => {
  const proof = gate.mustPass[4];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.receipts).toMatchObject([{ source: expect.stringContaining("derived=1"), members: 1, unresolved: 0 }]);
});

test("a fixed-return function with a concrete authored return twin is owned", () => {
  const proof = gate.mustPass[5];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.receipts).toMatchObject([{ source: expect.stringContaining("twins=1"), members: 1, unresolved: 0 }]);
});

test("an aggregate mapped contract contextually owns each property schema", () => {
  const proof = gate.mustPass[6];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.receipts).toMatchObject([{ source: expect.stringContaining("twins=2"), members: 2, unresolved: 0 }]);
});

test("an exported aggregate does not turn an ordinary property-access value into its source schema", () => {
  const proof = gate.mustPass[7];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.receipts).toMatchObject([{ source: expect.stringContaining("derived=1"), members: 1, unresolved: 0 }]);
});

test("an explicitly erased fixed return remains in the unreadable denominator", () => {
  const proof = gate.mustRefuse[2];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.authority.withheldPolicyIds).toContain(gate.id);
  expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 1 }]);
});

test("computed schema keys and dynamic schema spreads refuse unreadable aggregate identities", () => {
  for (const index of [3, 5]) {
    const proof = gate.mustRefuse[index];
    if (proof === undefined) {
      throw new Error(`missing mustRefuse proof ${String(index)}`);
    }
    const result = drive(proof.files);
    expect(result.authority.withheldPolicyIds).toContain(gate.id);
    expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 1 }]);
  }
});

test("a generic overload cannot launder a fixed implementation schema", () => {
  const proof = gate.mustRefuse[4];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.authority.withheldPolicyIds).toContain(gate.id);
  expect(result.policies[0]?.receipts).toMatchObject([{ members: 1, unresolved: 1 }]);
});
