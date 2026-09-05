import { Node, Project, SyntaxKind } from "ts-morph";
import type { GatePolicy, GatePolicyContext } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { resolveModuleMemberOrigin } from "../../../../tooling/src/verify/lib/reference-fact.ts";
import { readStaticAuthoredValue } from "../../../../tooling/src/verify/lib/static-authored-value.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/reader-policy";
const SUBJECT_PATH = "packages/client/src/subject.ts";
const POLICY_ID = "reader-composition";
const GRANT = {
  id: "reader-fixture-grant",
  policyId: POLICY_ID,
  subject: SUBJECT_PATH,
  operation: "disabled-record",
  why: "the fixture exercises central consumption of a reader-derived finding",
  endsWhen: "the record is enabled",
} as const;

function filesFor(options: string): Readonly<Record<string, string>> {
  return {
    "packages/client/src/api.ts": "export function record(value: unknown) { return value; }",
    "packages/client/src/barrel.ts": 'export { record as register } from "./api";',
    "packages/client/src/options.ts": `export const options = ${options};`,
    [SUBJECT_PATH]:
      'import * as api from "./barrel"; import { options } from "./options"; const key = "register"; const register = api[key]; export const subject = register(options);',
  };
}

function visitSubject(node: Node, ctx: GatePolicyContext): void {
  if (!Node.isVariableDeclaration(node) || node.getName() !== "subject") {
    return;
  }
  const call = node.getInitializerOrThrow();
  if (!Node.isCallExpression(call)) {
    throw new Error("the fixture subject must be a call");
  }
  const origin = resolveModuleMemberOrigin(call.getExpression());
  ctx.receipt({ kind: "population", source: "call-origin", members: 1, unresolved: origin.kind === "unresolved" ? 1 : 0 });
  const argument = call.getArguments()[0];
  if (argument === undefined) {
    throw new Error("the fixture subject must have authored options");
  }
  const value = readStaticAuthoredValue(argument);
  ctx.receipt({ kind: "population", source: "authored-options", members: 1, unresolved: value.kind === "unresolved" ? 1 : 0 });
  if (origin.kind === "unresolved" || value.kind === "unresolved") {
    return;
  }
  if (origin.value.canonical.exportedName !== "record") {
    throw new Error("the alias must resolve to the declaring export");
  }
  const enabled = value.value.kind === "object" ? value.value.properties.findLast((property) => property.key === "enabled")?.value : undefined;
  if (enabled?.kind === "scalar" && enabled.value === false) {
    ctx.report.node(call, { subject: ctx.relativePath(node.getSourceFile()), operation: GRANT.operation });
  }
}

function makePolicy(): GatePolicy {
  return defineGate({
    id: POLICY_ID,
    family: POLICY_ID,
    authority: "reviewed-grant",
    severity: "error",
    population: "@client",
    analysis: "types",
    execution: "selected-files",
    resources: [],
    message: "the authored record is disabled",
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node) => visitSubject(node, ctx),
        },
      ],
    }),
    mustFlag: [{ mode: "types", files: filesFor("{ enabled: false } as const"), why: "canonical origin and authored options compose at the visitor" }],
    mustPass: [{ mode: "types", files: filesFor("{ enabled: true } as const"), why: "a resolved enabled record is legal" }],
  });
}

function populate(project: Project, files: Readonly<Record<string, string>>, root = ROOT): void {
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, text);
  }
}

test("canonical origin and authored value facts reach central grant consumption from the shared walk", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  populate(project, filesFor("{ enabled: false, tuple: [1, 2] } as const"));
  const policy = makePolicy();
  const result = runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [GRANT], failOnWarnings: false });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
  expect(result.policies[0]?.receipts).toEqual([
    { kind: "population", source: "authored-options", members: 1, unresolved: 0 },
    { kind: "population", source: "call-origin", members: 1, unresolved: 0 },
  ]);
  expect(result.authority.grantedFindings).toMatchObject([{ grantId: GRANT.id, finding: { policyId: POLICY_ID, file: SUBJECT_PATH } }]);
  expect(result.authority.reviewedGrantConsumption).toEqual([{ id: GRANT.id, count: 1 }]);
});

test("unreadable authored values withhold grant liveness and a reused Project can recover", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  populate(project, filesFor("{ enabled: loadFlag() }"));
  const policy = makePolicy();
  const refused = runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [GRANT], failOnWarnings: false });

  expect(refused.policies[0]?.receipts).toContainEqual({ kind: "population", source: "authored-options", members: 1, unresolved: 1 });
  expect(refused.policies[0]?.owner.status).toBe("incomplete");
  expect(refused.toolErrors).toMatchObject([{ policyId: POLICY_ID, phase: "receipt", message: expect.stringContaining("unresolved") }]);
  expect(refused.authority.withheldPolicyIds).toEqual([POLICY_ID]);
  expect(refused.authority.authorityAlarms).toEqual([]);

  for (const file of [...project.getSourceFiles()]) {
    project.removeSourceFile(file);
  }
  const recoveredRoot = "/reader-policy-recovered";
  populate(project, filesFor("{ enabled: true } as const"), recoveredRoot);
  const recovered = runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: recoveredRoot,
    project,
    reviewedGrants: [GRANT],
    failOnWarnings: false,
  });

  expect(recovered.toolErrors).toEqual([]);
  expect(recovered.policies[0]?.owner.status).toBe("success");
  expect(recovered.authority.withheldPolicyIds).toEqual([]);
  expect(recovered.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: GRANT.id }]);
});
