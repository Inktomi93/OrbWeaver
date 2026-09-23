import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/zod-output-twin-parity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/zod-output-twin-parity";

/** Narrow a looked-up proof, THROWING when the gate no longer declares it (an `expect` does not narrow). */
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`zod-output-twin-parity no longer declares the proof: ${label}`);
  }
  return value;
}

function drive(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test("zod-output-twin-parity proves its complete output/cast/refusal matrix through production conformance", () => {
  expect(gate.id).toBe("zod-output-twin-parity");
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the production pass exposes the concrete-pair denominator on a cast that tries to erase narrowing", () => {
  const proof = gate.mustFlag[2];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.authority.effectiveFindings[0]?.message).toContain("authored type is not assignable to schema output");
  expect(result.policies[0]?.receipts).toEqual([
    {
      kind: "population",
      source: "zod-output-twin-parity concrete authored pairs [declarations=0, expression-pairs=1, contextual-pairs=0, raw-casts=1]",
      members: 1,
      unresolved: 0,
    },
  ]);
});

test("an erased concrete schema output withholds the policy instead of cleaning the corpus", () => {
  const proof = gate.mustRefuse[1];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toContain(gate.id);
  expect(result.policies[0]?.receipts).toEqual([
    {
      kind: "population",
      source:
        'zod-output-twin-parity concrete authored pairs [declarations=1, expression-pairs=0, contextual-pairs=0, raw-casts=0] unresolved-sites=["packages/contracts/src/x.ts:4:14:rowSchema"]',
      members: 0,
      unresolved: 1,
    },
  ]);
});

test("any and unknown output erasure cannot hide beside a healthy pair", () => {
  const proof = gate.mustRefuse[2];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toContain(gate.id);
  expect(result.policies[0]?.receipts).toEqual([
    {
      kind: "population",
      source:
        'zod-output-twin-parity concrete authored pairs [declarations=2, expression-pairs=1, contextual-pairs=0, raw-casts=0] unresolved-sites=["packages/contracts/src/x.ts:4:14:anyErased","packages/contracts/src/x.ts:5:14:unknownErased"]',
      members: 1,
      unresolved: 2,
    },
  ]);
});

test("contextual any and unknown output erasure cannot hide beside a healthy pair", () => {
  const proof = gate.mustRefuse[3];
  expect(proof).toBeDefined();
  const result = drive(proof.files);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toContain(gate.id);
  expect(result.policies[0]?.receipts).toEqual([
    {
      kind: "population",
      source:
        'zod-output-twin-parity concrete authored pairs [declarations=0, expression-pairs=1, contextual-pairs=2, raw-casts=0] unresolved-sites=["packages/contracts/src/x.ts:5:48:anySchema","packages/contracts/src/x.ts:5:75:unknownSchema"]',
      members: 1,
      unresolved: 2,
    },
  ]);
  const source = result.policies[0]?.receipts[0]?.source ?? "";
  const sites = JSON.parse(source.slice(source.indexOf("unresolved-sites=") + "unresolved-sites=".length)) as string[];
  expect(sites).toEqual([...new Set(sites)].sort());
  expect(sites).toEqual(["packages/contracts/src/x.ts:5:48:anySchema", "packages/contracts/src/x.ts:5:75:unknownSchema"]);
});

test("an unrelated generic call parameter does not remove an exact aggregate pair", () => {
  const proof = required(
    gate.mustPass.find((candidate) => candidate.why.includes("different call parameter owns the generic type")),
    "different call parameter owns the generic type",
  );
  const result = drive(proof.files);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies[0]?.receipts).toEqual([
    {
      kind: "population",
      source: "zod-output-twin-parity concrete authored pairs [declarations=0, expression-pairs=1, contextual-pairs=1, raw-casts=0]",
      members: 2,
      unresolved: 0,
    },
  ]);
});

test("only the canonical branded generated-schema member is omitted from contextual parity", () => {
  const canonical = required(
    gate.mustPass.find((proof) => proof.why.includes("canonical nominal runtime-generated-schema member")),
    "canonical nominal runtime-generated-schema member",
  );
  const canonicalResult = drive(canonical.files);
  expect(canonicalResult.toolErrors).toEqual([]);
  expect(canonicalResult.authority.effectiveFindings).toEqual([]);
  expect(canonicalResult.authority.withheldPolicyIds).toEqual([]);
  expect(canonicalResult.policies[0]?.receipts).toEqual([
    {
      kind: "population",
      source: "zod-output-twin-parity concrete authored pairs [declarations=0, expression-pairs=1, contextual-pairs=0, raw-casts=0]",
      members: 1,
      unresolved: 0,
    },
  ]);

  for (const marker of ["shadow wrapper", "bare ZodType member", "authored fixed schema"] as const) {
    const proof = required(
      gate.mustFlag.find((candidate) => candidate.why.includes(marker)),
      marker,
    );
    const result = drive(proof.files);
    expect(result.toolErrors, marker).toEqual([]);
    expect(result.authority.effectiveFindings, marker).toHaveLength(1);
    expect(result.authority.withheldPolicyIds, marker).toEqual([]);
  }

  const counterfeit = required(
    gate.mustRefuse.find((proof) => proof.why.includes("counterfeit generated-schema wrapper")),
    "counterfeit generated-schema wrapper",
  );
  const counterfeitResult = drive(counterfeit.files);
  expect(counterfeitResult.authority.effectiveFindings).toEqual([]);
  expect(counterfeitResult.authority.withheldPolicyIds).toContain(gate.id);
  expect(counterfeitResult.policies[0]?.receipts[0]).toMatchObject({ members: 1, unresolved: 1 });
});
