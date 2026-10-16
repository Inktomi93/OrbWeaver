import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readMemberReference } from "@orb/tooling/floor/code-facts/reference-fact";
import { createSchemaQuery } from "@orb/tooling/floor/code-facts/schema-query";
import type { CallExpression } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { JsonColumnOriginContext } from "../../../../tooling/src/verify/contract/json-column-origin.ts";
import type { GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate } from "../../../../tooling/src/verify/gates/json-column-write-parity.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/json-column-write-parity-health.ts";
import { createJsonColumnOriginContext } from "../../../../tooling/src/verify/lib/json-column-origin-context.ts";
import type { JsonColumnWriter } from "../../../../tooling/src/verify/lib/json-column-writers.ts";
import { collectWriters, updatedTable } from "../../../../tooling/src/verify/lib/json-column-writers.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { spellingTwinsOf } from "../../../../tooling/src/verify/lib/spelling-twins.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SHORTHAND_PROOF_PREFIX = "THE #1035 SHORTHAND RED:";
const DATA_PORT_ROOT = "/json-column-normalizer-data-port";
const SNAPSHOT_REFUSAL = "normalizer facts are missing or belong to another native snapshot";

test("the actual shorthand-writer namespace twin preserves detection and its unchanged supporting proofs", { tags: ["slow"] }, () => {
  const proofs = gate.mustFlag.filter((candidate) => candidate.why.startsWith(SHORTHAND_PROOF_PREFIX));
  expect(proofs).toHaveLength(1);
  const proof = proofs[0];
  const witness = gate.mustFlag.find((candidate) => "grant" in candidate);
  if (proof === undefined || witness === undefined) {
    throw new Error("the actual founding fixture and authored grant witness must exist");
  }
  const root = "/json-column-namespace-twin";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(proof.files)) {
    project.createSourceFile(`${root}/${path}`, source);
  }
  const baseline = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(baseline.toolErrors).toEqual([]);
  expect(baseline.factErrors).toEqual([]);
  expect(baseline.authority.effectiveFindings).toHaveLength(1);
  const finding = baseline.authority.effectiveFindings[0];
  if (finding === undefined) {
    throw new Error("the reported writer must supply the respeller's focused line");
  }
  const reported = new Map([[finding.file, new Set([finding.line])]]);
  const namespace = spellingTwinsOf(proof.files, reported).namespace;
  if (namespace === undefined) {
    throw new Error("the actual namespace respelling must exist");
  }
  const detection: GatePolicyProof = { mode: proof.mode, files: namespace, why: `namespace twin of: ${proof.why}` };
  const respelled = defineGate({ ...gate, mustFlag: [detection, witness], mustPass: gate.mustPass });
  expect(verifyPolicyProofs([respelled])).toEqual([]);
});

function normalizerWriterFixture(): {
  readonly project: Project;
  readonly context: JsonColumnOriginContext;
  readonly inspect: (context: JsonColumnOriginContext) => readonly JsonColumnWriter[];
  readonly normalizer: CallExpression;
} {
  const proofs = gate.mustFlag.filter((candidate) => candidate.why.startsWith(SHORTHAND_PROOF_PREFIX));
  expect(proofs).toHaveLength(1);
  const proof = proofs[0];
  if (proof === undefined) {
    throw new Error("the founding producer fixture must exist");
  }
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(proof.files)) {
    project.createSourceFile(`${DATA_PORT_ROOT}/${path}`, source);
  }
  const files = project.getSourceFiles();
  const query = createSchemaQuery({
    files: files.filter((source) => source.getFilePath().includes("/packages/db/src/schema/")),
    relativePath: (source) => source.getFilePath().slice(DATA_PORT_ROOT.length + 1),
    checker: () => project.getTypeChecker(),
  });
  const fact = query.schema();
  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(fact.reason);
  }
  const schema = fact.value;
  const calls = files.flatMap((source) => source.getDescendantsOfKind(SyntaxKind.CallExpression));
  const context = createJsonColumnOriginContext(schema, calls);
  const applySource = project.getSourceFileOrThrow(`${DATA_PORT_ROOT}/packages/server/src/domain/refinery/verbs/apply-fields.ts`);
  const set = applySource.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => {
    const member = readMemberReference(call.getExpression());
    return member.kind === "resolved" && member.value.name === "set";
  });
  if (set === undefined) {
    throw new Error("the actual producer must retain its set call");
  }
  const member = readMemberReference(set.getExpression());
  if (member.kind !== "resolved") {
    throw new Error(member.detail);
  }
  const tableName = updatedTable(member.value.receiver, schema);
  const table = schema.tables.find((candidate) => candidate.identity.declarationName === tableName);
  if (table === undefined) {
    throw new Error("the actual writer must name its canonical schema table");
  }
  const cols = new Set(table.columns.filter((column) => column.json !== null).map((column) => column.identity.propertyName));
  const inspect = (current: JsonColumnOriginContext): readonly JsonColumnWriter[] => {
    const out: JsonColumnWriter[] = [];
    collectWriters(set.getArguments()[0], { table, cols, out }, current, 0);
    return out;
  };
  const normalizer = applySource
    .getFunctionOrThrow("sessionViewOf")
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "selectionParser.parse");
  if (normalizer === undefined) {
    throw new Error("the actual loaded-row view must retain its normalizer");
  }
  return { project, context, inspect, normalizer };
}

test("the actual persisted writer refuses a missing consumer-judged normalizer fact", () => {
  const { context, inspect, normalizer } = normalizerWriterFixture();
  expect(inspect(context)).toMatchObject([{ wholeReplace: false, historicalHeal: true }]);

  const normalizers = new Map(context.normalizers);
  expect(normalizers.delete(normalizer.compilerNode)).toBe(true);
  expect(() => inspect({ ...context, normalizers })).toThrow(SNAPSHOT_REFUSAL);
});

test("the actual persisted writer refuses facts from an invalidated native Program snapshot", () => {
  const { project, context, inspect } = normalizerWriterFixture();
  expect(inspect(context)).toMatchObject([{ wholeReplace: false, historicalHeal: true }]);

  project.createSourceFile(`${DATA_PORT_ROOT}/unrelated.ts`, "export const unrelated = true;\n");
  expect(() => inspect(context)).toThrow(SNAPSHOT_REFUSAL);
});

test(
  "complete JSON write occurrence and health proof populations retain all findings, refusals and exact grants",
  () => {
    expect(verifyPolicyProofs([gate, health])).toEqual([]);
  },
  scaledBudget(120_000),
);
