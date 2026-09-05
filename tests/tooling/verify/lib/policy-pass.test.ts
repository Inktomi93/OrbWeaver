import type { SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicy, GatePolicyContext, GatePolicyHooks, GatePolicyProofMode } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassInput, PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function proofMode(analysis: GatePolicy["analysis"]): GatePolicyProofMode {
  return analysis === "syntax" ? "source" : analysis;
}

function policy(id: string, overrides: Partial<GatePolicy> = {}): GatePolicy {
  const analysis = overrides.analysis ?? "syntax";
  const mode = proofMode(analysis);
  const path = mode === "resource" ? "resources/proof.json" : "packages/client/src/proof.ts";
  return defineGate({
    id,
    family: id,
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis,
    execution: "selected-files",
    message: `${id} message`,
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode, files: { [path]: "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode, files: { [path]: "export const clean = true;\n" }, why: "nearest legal shape" }],
    ...overrides,
  });
}

function run(policies: readonly GatePolicy[], project: Project, overrides: Partial<PolicyPassInput> = {}): PolicyPassResult {
  return runPolicyPass({
    policies,
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
    ...overrides,
  });
}

function nodeReportingPolicy(id: string, events?: string[]): GatePolicy {
  return policy(id, {
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node) => {
            events?.push(`${id}:visit`);
            ctx.report.node(node);
          },
        },
      ],
    }),
  });
}

test("two policies share one physical descendant walk and receive deterministic findings", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const sf = project.getSourceFileOrThrow(`${ROOT}/packages/client/src/a.ts`);
  const original = sf.forEachDescendant.bind(sf);
  let walks = 0;
  Object.defineProperty(sf, "forEachDescendant", {
    configurable: true,
    value: (visitor: Parameters<SourceFile["forEachDescendant"]>[0]) => {
      walks += 1;
      return original(visitor);
    },
  });

  const result = run([nodeReportingPolicy("policy-b"), nodeReportingPolicy("policy-a")], project);

  expect(walks).toBe(1);
  expect(result.policies.map(({ id }) => id)).toEqual(["policy-a", "policy-b"]);
  expect(result.authority.effectiveFindings.map(({ policyId }) => policyId)).toEqual(["policy-a", "policy-b"]);
});

test("visitFile precedes visitor dispatch and evaluate follows the complete walk", () => {
  const project = projectOf({
    "packages/client/src/a.ts": "export const a = 1;\n",
    "packages/client/src/b.ts": "export const b = 2;\n",
  });
  const events: string[] = [];
  const gate = policy("phase-order", {
    create: () => ({
      visitFile: (sf) => events.push(`file:${sf.getBaseName()}`),
      visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: (node) => events.push(`visit:${node.getSourceFile().getBaseName()}`) }],
      evaluate: () => events.push("evaluate"),
    }),
  });

  run([gate], project);

  expect(events).toEqual(["file:a.ts", "visit:a.ts", "file:b.ts", "visit:b.ts", "evaluate"]);
});

test("selected policies run intersections while entire-population policies visibly defer", () => {
  const project = projectOf({
    "packages/client/src/a.ts": "export const a = 1;\n",
    "packages/client/src/folder/b.ts": "export const b = 2;\n",
    "packages/client/src/folder/c.ts": "export const c = 3;\n",
  });
  const selected = nodeReportingPolicy("selected-policy");
  const entire = policy("entire-policy", { execution: "entire-population", create: selected.create });
  const requestedPaths = ["packages/client/src/a.ts", "packages/client/src/folder/b.ts"];

  const result = run([entire, selected], project, { requestedPaths });
  const selectedResult = result.policies.find(({ id }) => id === selected.id);
  const entireResult = result.policies.find(({ id }) => id === entire.id);

  expect(selectedResult?.owner).toEqual({ status: "success", population: "complete" });
  expect(selectedResult?.population).toMatchObject({
    requestedPaths,
    effectiveSourcePaths: requestedPaths,
    effectiveResourcePaths: [],
  });
  expect(selectedResult?.findings).toHaveLength(2);
  expect(entireResult?.owner).toMatchObject({ status: "not-applicable", population: "complete", reason: expect.stringMatching(/proper subset|entire/i) });
  expect(entireResult?.population.effectiveSourcePaths).toEqual(requestedPaths);
  expect(result.authority.withheldPolicyIds).toEqual(["entire-policy"]);
});

test("an empty selected intersection is not-applicable and missing source populations are incomplete", () => {
  const project = projectOf({ "packages/server/src/a.ts": "export const a = 1;\n" });
  const missing = policy("missing-source");
  const resourceMissing = policy("missing-resource", {
    analysis: "resource",
    population: { of: "none", why: "resource-only fixture" },
    mustFlag: [{ mode: "resource", files: { "resources/a.json": "{}" }, why: "founding defect" }],
    mustPass: [{ mode: "resource", files: { "resources/a.json": "{}" }, why: "nearest legal shape" }],
  });

  const result = run([missing, resourceMissing], project, { requestedPaths: ["packages/server/src/a.ts"] });

  expect(result.policies.map(({ owner }) => owner.status)).toEqual(["incomplete", "incomplete"]);
  expect(result.toolErrors.map(({ phase }) => phase)).toEqual(["population", "population"]);
  expect(result.authority.withheldPolicyIds).toEqual(["missing-resource", "missing-source"]);

  const emptyCorpus = run([policy("empty-corpus")], projectOf({}));
  expect(emptyCorpus.policies[0]?.owner.status).toBe("incomplete");
  expect(emptyCorpus.toolErrors).toMatchObject([
    { policyId: "empty-corpus", phase: "population", message: expect.stringMatching(/candidate corpus is empty/i) },
  ]);
});

test("resource identities join requested selection and resource-only findings are file-anchored", () => {
  const project = projectOf({ "packages/server/src/unrelated.ts": "export const unrelated = true;\n" });
  let seenResources: readonly string[] = [];
  const gate = policy("resource-policy", {
    analysis: "resource",
    population: { of: "none", why: "resource-only fixture" },
    create: (ctx) => ({
      evaluate: () => {
        seenResources = ctx.resourcePaths;
        ctx.receipt({ kind: "resource", source: "configs", resources: ctx.resourcePaths.length });
        ctx.report.file(ctx.resourcePaths[0] as string, { message: "resource finding" });
      },
    }),
    mustFlag: [{ mode: "resource", files: { "resources/a.json": "{}" }, why: "founding defect" }],
    mustPass: [{ mode: "resource", files: { "resources/a.json": "{}" }, why: "nearest legal shape" }],
  });

  const result = run([gate], project, {
    requestedPaths: ["resources/b.json"],
    resourcePathsByPolicy: new Map([[gate.id, ["resources/b.json", "resources/a.json"]]]),
  });

  expect(seenResources).toEqual(["resources/b.json"]);
  expect(result.policies[0]?.population).toMatchObject({
    declaredSourcePaths: [],
    declaredResourcePaths: ["resources/a.json", "resources/b.json"],
    effectiveResourcePaths: ["resources/b.json"],
  });
  expect(result.policies[0]?.receipts).toEqual([{ kind: "resource", source: "configs", resources: 1, unresolved: 0 }]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: "resources/b.json", line: 1, column: 1, policyId: gate.id }]);
});

test("the checker is lazy, shared once, and refuses syntax policies", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const original = project.getTypeChecker.bind(project);
  let checkerBuilds = 0;
  Object.defineProperty(project, "getTypeChecker", {
    configurable: true,
    value: () => {
      checkerBuilds += 1;
      return original();
    },
  });
  const typed = (id: string): GatePolicy =>
    policy(id, {
      analysis: "types",
      create: (ctx) => ({ evaluate: () => void ctx.checker() }),
      mustFlag: [{ mode: "types", files: { "packages/client/src/a.ts": "export const a = 1;" }, why: "founding defect" }],
      mustPass: [{ mode: "types", files: { "packages/client/src/a.ts": "export const a = 1;" }, why: "nearest legal shape" }],
    });
  const syntax = policy("syntax-checker", { create: (ctx) => ({ evaluate: () => void ctx.checker() }) });

  const result = run([typed("typed-a"), syntax, typed("typed-b")], project);

  expect(checkerBuilds).toBe(1);
  expect(result.policies.find(({ id }) => id === syntax.id)?.owner.status).toBe("incomplete");
  expect(result.toolErrors).toMatchObject([{ policyId: "syntax-checker", phase: "evaluate", message: expect.stringMatching(/syntax.*checker/i) }]);
});

test("sourceFile cannot escape the effective population", () => {
  const project = projectOf({
    "packages/client/src/a.ts": "export const a = 1;\n",
    "packages/client/src/b.ts": "export const b = 2;\n",
  });
  const gate = policy("source-escape", {
    create: (ctx) => ({ evaluate: () => void ctx.sourceFile("packages/client/src/b.ts") }),
  });

  const result = run([gate], project, { requestedPaths: ["packages/client/src/a.ts"] });

  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.toolErrors).toMatchObject([{ policyId: gate.id, phase: "evaluate", message: expect.stringMatching(/effective population/i) }]);
});

test("create state is invocation-local across re-entry", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  let creates = 0;
  const gate = policy("reentry-policy", {
    create: (ctx) => {
      creates += 1;
      let visits = 0;
      return {
        visitors: [
          {
            kinds: [SyntaxKind.VariableDeclaration],
            visit: () => {
              visits += 1;
            },
          },
        ],
        evaluate: () => {
          if (visits === 1) {
            ctx.report.file("packages/client/src/a.ts");
          }
        },
      };
    },
  });

  const first = run([gate], project);
  const second = run([gate], project);

  expect(creates).toBe(2);
  expect(first.policies[0]?.findings).toHaveLength(1);
  expect(second.policies[0]?.findings).toHaveLength(1);
});

test("every hook throw withholds only its owner and siblings survive", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const boom = (phase: string): never => {
    throw new Error(`${phase} boom`);
  };
  const throwing: readonly GatePolicy[] = [
    policy("throws-create", { create: () => boom("create") }),
    policy("throws-file", { create: () => ({ visitFile: () => boom("visitFile") }) }),
    policy("throws-visit", { create: () => ({ visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: () => boom("visit") }] }) }),
    policy("throws-evaluate", { create: () => ({ evaluate: () => boom("evaluate") }) }),
  ];
  const survivor = nodeReportingPolicy("survivor");

  const result = run([...throwing, survivor], project);

  expect(result.toolErrors.map(({ policyId, phase }) => `${policyId}:${phase}`)).toEqual([
    "throws-create:create",
    "throws-evaluate:evaluate",
    "throws-file:visitFile",
    "throws-visit:visit",
  ]);
  expect(result.policies.filter(({ owner }) => owner.status === "incomplete").map(({ id }) => id)).toEqual([
    "throws-create",
    "throws-evaluate",
    "throws-file",
    "throws-visit",
  ]);
  expect(result.authority.withheldPolicyIds).toEqual(["throws-create", "throws-evaluate", "throws-file", "throws-visit"]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: survivor.id }]);
});

test("central authority handles hard, ordinary, reviewed, and warning promotion", () => {
  const project = projectOf({
    "packages/client/src/hard.ts": "export const hard = 1;\n",
    "packages/client/src/ordinary.ts": "export const ordinary = 1;\n",
    "packages/client/src/reviewed.ts": "export const reviewed = 1;\n",
  });
  const anchored = (id: string, file: string, overrides: Partial<GatePolicy> = {}): GatePolicy =>
    policy(id, { create: (ctx) => ({ evaluate: () => ctx.report.file(file, { subject: file, operation: "read" }) }), ...overrides });
  const hard = anchored("hard-policy", "packages/client/src/hard.ts");
  const ordinary = anchored("ordinary-policy", "packages/client/src/ordinary.ts", { authority: "ordinary", severity: "warning" });
  const reviewed = anchored("reviewed-policy", "packages/client/src/reviewed.ts", { authority: "reviewed-grant" });
  const grants = [
    {
      id: "grant-reviewed",
      policyId: reviewed.id,
      subject: "packages/client/src/reviewed.ts",
      operation: "read",
      why: "fixture",
      endsWhen: "the read disappears",
    },
  ];

  const result = run([reviewed, ordinary, hard], project, {
    reviewedGrants: grants,
    failOnWarnings: true,
    waiverFor: (finding) => (finding.policyId === ordinary.id ? "waiver-ordinary" : null),
    reconcileOrdinary: () => [],
  });

  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: hard.id, severity: "error" }]);
  expect(result.authority.waivedFindings).toMatchObject([{ waiverId: "waiver-ordinary", finding: { policyId: ordinary.id, severity: "warning" } }]);
  expect(result.authority.grantedFindings).toMatchObject([{ grantId: "grant-reviewed", finding: { policyId: reviewed.id } }]);
  expect(result.authority.verdict).toEqual({ errors: 1, warnings: 0, blocking: 1, failOnWarnings: true });

  const promoted = run([ordinary], project, { failOnWarnings: true, reconcileOrdinary: () => [] });
  expect(promoted.authority.effectiveFindings).toMatchObject([{ policyId: ordinary.id, severity: "warning" }]);
  expect(promoted.authority.verdict).toEqual({ errors: 0, warnings: 1, blocking: 1, failOnWarnings: true });
});

test("result ordering and timing receipt shape are deterministic", () => {
  const project = projectOf({
    "packages/client/src/b.ts": "export const b = 1;\n",
    "packages/client/src/a.ts": "export const a = 1;\n",
  });
  const gate = nodeReportingPolicy("ordered-policy");

  const result = run([gate], project);
  const repeated = run([gate], project);

  expect(result.policies[0]?.findings.map(({ file }) => file)).toEqual(["packages/client/src/a.ts", "packages/client/src/b.ts"]);
  expect(repeated.policies.map(({ id, owner, population, findings, receipts }) => ({ id, owner, population, findings, receipts }))).toEqual(
    result.policies.map(({ id, owner, population, findings, receipts }) => ({ id, owner, population, findings, receipts })),
  );
  expect(result.policies[0]?.timing.phaseMs).toEqual({
    population: expect.any(Number),
    create: expect.any(Number),
    visitFile: expect.any(Number),
    visit: expect.any(Number),
    evaluate: expect.any(Number),
  });
  expect(result.timing.totalMs).toBeGreaterThanOrEqual(result.timing.policyMs);
});

test("the public context type and runtime surface expose neither Project nor root", () => {
  type Forbidden = Extract<keyof GatePolicyContext, "project" | "root">;
  const noForbiddenKeys: Forbidden extends never ? true : false = true;
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  let keys: readonly string[] = [];
  const gate = policy("context-surface", {
    create: (ctx) => {
      keys = Object.keys(ctx).sort();
      return { evaluate: () => undefined } satisfies GatePolicyHooks;
    },
  });

  run([gate], project);

  expect(noForbiddenKeys).toBe(true);
  expect(keys).toEqual(["checker", "files", "receipt", "relativePath", "report", "resourcePaths", "sourceFile"]);
});
