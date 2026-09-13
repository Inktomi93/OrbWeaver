import { execFileSync } from "node:child_process";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { GateFact } from "../../../../tooling/src/verify/contract/fact.ts";
import { defineFact } from "../../../../tooling/src/verify/contract/fact.ts";
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
    facts: [],
    resources: analysis === "resource" ? [{ kind: "package-metadata", id: "root" }] : [],
    message: `${id} message`,
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode, files: { [path]: "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode, files: { [path]: "export const clean = true;\n" }, why: "nearest legal shape" }],
    ...overrides,
  } as GatePolicy);
}

function run(policies: readonly GatePolicy[], project: Project, overrides: Partial<PolicyPassInput> = {}): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: policies,
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

test("the invocation boundary rejects empty, duplicate, unbranded, and invalid policies before hooks", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  let creates = 0;
  const counted = (id: string): GatePolicy =>
    policy(id, {
      create: () => {
        creates += 1;
        return { evaluate: () => undefined };
      },
    });
  const valid = counted("valid-policy");
  const unbranded = { ...valid, id: "unbranded-policy", family: "unbranded-policy" } as GatePolicy;
  const invalid = defineGate({
    ...valid,
    id: "invalid-policy",
    family: "invalid-policy",
    analysis: "bogus",
    execution: "bogus",
    facts: [],
    mustFlag: [],
    mustPass: [],
  } as never);

  expect(() => run([], project)).toThrow(/nonempty|policy/i);
  expect(() => run([counted("duplicate-policy"), counted("duplicate-policy")], project)).toThrow(/duplicate/i);
  expect(() => run([unbranded], project)).toThrow(/defineGate|brand/i);
  expect(() => run([invalid], project)).toThrow(/invalid.*policy|analysis|proof/i);
  expect(creates).toBe(0);
});

test("selected policies must be exact loaded descriptor identities before any hook runs", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const events: string[] = [];
  const tracked = (id: string, overrides: Partial<GatePolicy> = {}): GatePolicy =>
    policy(id, {
      create: () => {
        events.push("create");
        return {
          visitFile: () => events.push("visitFile"),
          visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: () => events.push("visit") }],
          evaluate: () => events.push("evaluate"),
        };
      },
      ...overrides,
    });
  const absent = tracked("absent-selected");
  expect(() => run([absent], project, { knownPolicies: [policy("different-known")] })).toThrow(/absent.*known roster/i);
  expect(events).toEqual([]);

  const loaded = tracked("substituted-policy");
  const substitute = tracked("substituted-policy", { authority: "ordinary" });
  expect(() => run([substitute], project, { knownPolicies: [loaded] })).toThrow(/loaded descriptor identity/i);
  expect(events).toEqual([]);

  const sameMetadataLoaded = tracked("same-metadata-policy");
  const sameMetadataSubstitute = tracked("same-metadata-policy");
  expect(() => run([sameMetadataSubstitute], project, { knownPolicies: [sameMetadataLoaded] })).toThrow(/loaded descriptor identity/i);
  expect(events).toEqual([]);
});

test("the pass walks the raw compiler tree (never the wrapped forEachDescendant) and two policies receive deterministic findings", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const sf = project.getSourceFileOrThrow(`${ROOT}/packages/client/src/a.ts`);
  // `collectByKinds` walks `sf.compilerNode` with `ts.forEachChild` and wraps only subscribed kinds; the
  // wrapped `forEachDescendant` (which wraps EVERY node — the largest slice of the 2026-09-06 composed-pass
  // profile) must never be reached from the pass. The one-physical-walk-per-file guarantee itself is
  // `collectByKinds`'s own construction (one root traversal per file) and is pinned at its unit level.
  let wrappedWalks = 0;
  Object.defineProperty(sf, "forEachDescendant", {
    configurable: true,
    value: () => {
      wrappedWalks += 1;
    },
  });

  const result = run([nodeReportingPolicy("policy-b"), nodeReportingPolicy("policy-a")], project);

  expect(wrappedWalks).toBe(0);
  expect(result.policies.map(({ id }) => id)).toEqual(["policy-a", "policy-b"]);
  expect(result.authority.effectiveFindings.map(({ policyId }) => policyId)).toEqual(["policy-a", "policy-b"]);
});

test("only .ts and .tsx Project members enter the source candidate walk", () => {
  const extensions = ["ts", "tsx", "mts", "cts", "mjs", "cjs"] as const;
  const files = Object.fromEntries(extensions.map((extension) => [`packages/client/src/source.${extension}`, "export const source = true;\n"]));
  const visited: string[] = [];
  const gate = policy("source-candidate-extensions", {
    population: { of: "all", why: "exercise the complete compiler Project" },
    create: (ctx) => ({ visitFile: (sourceFile) => visited.push(ctx.relativePath(sourceFile)) }),
  });

  const result = run([gate], projectOf(files));

  expect(result.toolErrors).toEqual([]);
  expect(visited).toEqual(["packages/client/src/source.ts", "packages/client/src/source.tsx"]);
  expect(result.policies[0]?.population.declaredSourcePaths).toEqual(visited);
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

test("an entire-population policy that exposes no evaluate hook is refused at create — its verdict composes per file (#2111 A21)", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const perFile = policy("entire-per-file", { execution: "entire-population", create: () => ({ visitFile: () => undefined }) });
  const refused = run([perFile], project);
  expect(refused.toolErrors).toMatchObject([{ policyId: "entire-per-file", phase: "create" }]);
  expect(refused.toolErrors[0]?.message).toMatch(/declares execution entire-population but exposes no evaluate hook/u);
  expect(refused.authority.withheldPolicyIds).toEqual(["entire-per-file"]);

  // The other direction: the same declaration WITH the post-walk phase runs clean, and a selected-files policy
  // with no evaluate is the ordinary composing shape and is never asked.
  const whole = policy("entire-whole", { execution: "entire-population", create: () => ({ visitFile: () => undefined, evaluate: () => undefined }) });
  const composing = policy("selected-per-file", { create: () => ({ visitFile: () => undefined }) });
  const clean = run([whole, composing], project);
  expect(clean.toolErrors).toEqual([]);
  expect(clean.authority.withheldPolicyIds).toEqual([]);
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

// REWRITTEN AT #2309, TITLE AND SUBJECT PRESERVED: a resource identity still JOINS the requested selection —
// naming one is what makes this policy applicable at all, and the skip arm below is the other side of that.
// What it used to pin beside it was the defect: the owner received ONLY the resource its request named, so a
// two-resource policy under a one-resource request was handed a hole. `bindPolicyResources` then throws
// `is undeclared` on the withdrawn door (`requestStaysDeclared` drops it) or `is outside the effective
// resource population` on a fact whose paths outran the narrowed set — a TOOL ERROR on the ordinary
// `--changed` path, measured on both `baseui-derives-not-respells` siblings at `028e278ee`. A RUNNING owner
// now receives its COMPLETE declared resource population; the fixture reads both, as obligation 1 of
// `docs/design/resource-policy-contract.md` requires of every resource policy.
test("resource identities join requested selection and resource-only findings are file-anchored", () => {
  const project = projectOf({ "packages/server/src/unrelated.ts": "export const unrelated = true;\n" });
  let seenResources: readonly string[] = [];
  const gate = policy("resource-policy", {
    analysis: "resource",
    population: { of: "none", why: "resource-only fixture" },
    resources: [
      { kind: "package-metadata", id: "root" },
      { kind: "package-metadata", id: "ui" },
    ],
    create: (ctx) => ({
      evaluate: () => {
        seenResources = ctx.resourcePaths;
        ctx.resources.packageMetadata("root");
        ctx.resources.packageMetadata("ui");
        ctx.report.file("packages/ui/package.json", { message: "resource finding" });
      },
    }),
    mustFlag: [{ mode: "resource", files: { "package.json": "{}" }, why: "founding defect" }],
    mustPass: [{ mode: "resource", files: { "package.json": "{}" }, why: "nearest legal shape" }],
  });

  const result = run([gate], project, {
    requestedPaths: ["packages/ui/package.json"],
    resourceOptions: { overlay: { "package.json": '{"name":"orb"}', "packages/ui/package.json": '{"name":"@orb/ui"}' } },
  });

  expect(result.toolErrors).toEqual([]);
  expect(seenResources).toEqual(["package.json", "packages/ui/package.json"]);
  expect(result.policies[0]?.population).toMatchObject({
    declaredSourcePaths: [],
    declaredResourcePaths: ["package.json", "packages/ui/package.json"],
    effectiveResourcePaths: ["package.json", "packages/ui/package.json"],
  });
  expect(result.policies[0]?.receipts).toEqual([
    { kind: "resource", source: "package:root", resources: 1, unresolved: 0 },
    { kind: "resource", source: "package:ui", resources: 1, unresolved: 0 },
  ]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: "packages/ui/package.json", line: 1, column: 1, policyId: gate.id }]);

  // THE OTHER SIDE, and the arm that keeps "complete availability" from meaning "always applicable": a
  // request naming NEITHER declared resource selects nothing, and the owner is not-applicable rather than
  // silently clean over data it was handed anyway.
  const untouched = run([gate], project, {
    requestedPaths: ["packages/server/src/unrelated.ts"],
    resourceOptions: { overlay: { "package.json": '{"name":"orb"}', "packages/ui/package.json": '{"name":"@orb/ui"}' } },
  });
  expect(untouched.policies[0]?.owner).toMatchObject({ status: "not-applicable", reason: expect.stringMatching(/empty policy intersection/u) });
  expect(untouched.policies[0]?.population.effectiveResourcePaths).toEqual([]);
});

test("a hybrid policy consumes one TS identity through both source and resource axes", () => {
  const path = "packages/client/src/hybrid.ts";
  const source = "export const hybrid = true;\n";
  const project = projectOf({ [path]: source });
  const visited: string[] = [];
  const gate = policy("hybrid-policy", {
    analysis: "resource",
    population: "@client",
    resources: [{ kind: "authored-tree", id: "client-source" }],
    create: (ctx) => ({
      visitFile: (sourceFile) => visited.push(ctx.relativePath(sourceFile)),
      evaluate: () => {
        const tree = ctx.resources.authoredTree("client-source");
        if (tree.status !== "ready") {
          throw new Error(tree.reason);
        }
        ctx.report.file(path);
      },
    }),
  });

  const result = run([gate], project, {
    resourceOptions: { overlay: { [path]: source } },
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
  expect(result.policies[0]?.population).toMatchObject({
    declaredSourcePaths: [path],
    declaredResourcePaths: [path],
    effectiveSourcePaths: [path],
    effectiveResourcePaths: [path],
  });
  expect(visited).toEqual([path]);
  expect(result.authority.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: path, policyId: gate.id }]);
});

test("descriptor resource declarations are the pass resource manifest", () => {
  const first = "packages/client/src/a.ts";
  const second = "packages/client/src/b.ts";
  let seenResources: readonly string[] = [];
  const gate = policy("resource-manifest-disagreement", {
    analysis: "resource",
    population: { of: "none", why: "resource-only authored tree" },
    resources: [{ kind: "authored-tree", id: "client-source" }],
    create: (ctx) => ({
      evaluate: () => {
        seenResources = ctx.resourcePaths;
        ctx.resources.authoredTree("client-source");
      },
    }),
  });

  const result = run([gate], projectOf({}), {
    resourceOptions: { overlay: { [first]: "export const a = 1;\n", [second]: "export const b = 2;\n" } },
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  expect(seenResources).toEqual([first, second]);
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

test("visitor subscriptions reject impossible kinds and duplicates while real range edges remain valid", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const withKinds = (id: string, kinds: readonly SyntaxKind[]): GatePolicy => policy(id, { create: () => ({ visitors: [{ kinds, visit: () => undefined }] }) });
  const invalidKinds = [
    ["negative-kind", [-1]],
    ["unknown-kind", [SyntaxKind.Unknown]],
    ["count-kind", [SyntaxKind.Count]],
    ["beyond-kind", [SyntaxKind.Count + 10]],
    ["duplicate-kind", [SyntaxKind.Identifier, SyntaxKind.Identifier]],
  ] as const;

  for (const [id, kinds] of invalidKinds) {
    const result = run([withKinds(id, kinds as readonly SyntaxKind[])], project);
    expect(result.policies[0]?.owner.status).toBe("incomplete");
    expect(result.toolErrors).toMatchObject([{ policyId: id, phase: "create", message: expect.stringMatching(/SyntaxKind|kinds|unique/i) }]);
  }

  const valid = run([withKinds("valid-kind-edges", [SyntaxKind.Identifier, (SyntaxKind.Count - 1) as SyntaxKind])], project);
  expect(valid.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
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

test("semantic and resource receipt failures remain visible and withhold their owner", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const denominators = policy("bad-denominators", {
    authority: "ordinary",
    create: (ctx) => ({
      evaluate: () => {
        ctx.receipt({ kind: "population", source: "empty-members", members: 0 });
        ctx.receipt({ kind: "population", source: "unresolved-members", members: 2, unresolved: 1 });
        ctx.receipt({ kind: "resource", source: "empty-resources", resources: 0 });
        ctx.receipt({ kind: "resource", source: "unresolved-resources", resources: 2, unresolved: 1 });
      },
    }),
  });
  const bogus = policy("bogus-receipt", {
    authority: "ordinary",
    create: (ctx) => ({ evaluate: () => ctx.receipt({ kind: "bogus", source: "bogus-kind", resources: 1 } as never) }),
  });

  const result = run([bogus, denominators], project);
  const denominatorResult = result.policies.find(({ id }) => id === denominators.id);

  expect(denominatorResult?.owner.status).toBe("incomplete");
  expect(denominatorResult?.receipts).toHaveLength(4);
  expect(denominatorResult?.receipts).toContainEqual({ kind: "population", source: "empty-members", members: 0, unresolved: 0 });
  expect(denominatorResult?.receipts).toContainEqual({ kind: "resource", source: "unresolved-resources", resources: 2, unresolved: 1 });
  expect(result.toolErrors).toMatchObject([
    { policyId: "bad-denominators", phase: "receipt", message: expect.stringMatching(/zero|unresolved/i) },
    { policyId: "bogus-receipt", phase: "evaluate", message: expect.stringMatching(/kind|discriminant/i) },
  ]);
  expect(result.authority.withheldPolicyIds).toEqual(["bad-denominators", "bogus-receipt"]);
});

test("node reports require an exact in-range token and offset pair", () => {
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const withDetails = (id: string, details: object): GatePolicy =>
    policy(id, {
      create: (ctx) => ({
        visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: (node) => ctx.report.node(node, details as never) }],
      }),
    });
  const invalid = [
    ["offset-only", { offset: 0 }],
    ["token-only", { token: "a" }],
    ["negative-offset", { token: "a", offset: -1 }],
    ["fractional-offset", { token: "a", offset: 0.5 }],
    ["range-offset", { token: "a", offset: 100 }],
    ["mismatch-offset", { token: "missing", offset: 0 }],
  ] as const;
  for (const [id, details] of invalid) {
    const result = run([withDetails(id, details)], project);
    expect(result.policies[0]?.owner.status).toBe("incomplete");
    expect(result.toolErrors).toMatchObject([{ policyId: id, phase: "visit", message: expect.stringMatching(/token|offset/i) }]);
  }

  const valid = run([withDetails("valid-token-offset", { token: "a", offset: 0 })], project);
  expect(valid.policies[0]?.owner.status).toBe("success");
  expect(valid.policies[0]?.findings).toMatchObject([{ token: "a" }]);
});

test("bare node reports derive deterministic authored position tokens across syntax shapes", () => {
  const project = projectOf({
    "packages/client/src/a.tsx": [
      "@Injectable()",
      "class Example {}",
      "if (isGroup) { doSomething(); }",
      'export const view = <img compact src="bad" />;',
    ].join("\n"),
  });
  const gate = policy("derived-node-position", {
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.Decorator, SyntaxKind.Identifier, SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxAttribute],
          visit: (node) => {
            if (
              node.getKind() === SyntaxKind.Decorator ||
              (node.getKind() === SyntaxKind.Identifier && node.getText() === "isGroup") ||
              node.getKind() === SyntaxKind.JsxSelfClosingElement ||
              (node.getKind() === SyntaxKind.JsxAttribute && node.getText().startsWith("compact"))
            ) {
              ctx.report.node(node);
            }
          },
        },
      ],
    }),
  });

  const first = run([gate], project);
  const second = run([gate], project);

  expect(first.toolErrors).toEqual([]);
  expect(first.policies[0]?.findings).toMatchObject([
    { line: 1, column: 2, token: "Injectable" },
    { line: 3, column: 5, token: "isGroup" },
    { line: 4, column: 22, token: "img" },
    { line: 4, column: 26, token: "compact" },
  ]);
  expect(second.policies[0]?.findings).toEqual(first.policies[0]?.findings);
});

test("ordinary waivers bind to a bare node report's derived position", () => {
  const project = projectOf({
    "packages/client/src/a.ts": "// @orb-waive derived-node-waiver(isGroup): exact derived position\nif (isGroup) { doSomething(); }\n",
  });
  const gate = policy("derived-node-waiver", {
    authority: "ordinary",
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node) => {
            if (node.getText() === "isGroup") {
              ctx.report.node(node);
            }
          },
        },
      ],
    }),
  });

  const result = run([gate], project);

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toMatchObject([{ finding: { line: 2, column: 5, token: "isGroup" } }]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("explicit node position overrides remain exact and tokenless nodes fail loud", () => {
  const explicitProject = projectOf({ "packages/client/src/a.ts": "export const alpha = 1;\n" });
  const explicit = policy("explicit-node-position", {
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node) => ctx.report.node(node, { token: "alpha", offset: 0 }),
        },
      ],
    }),
  });
  const explicitResult = run([explicit], explicitProject);
  expect(explicitResult.toolErrors).toEqual([]);
  expect(explicitResult.policies[0]?.findings).toMatchObject([{ line: 1, column: 14, token: "alpha" }]);

  const whitespaceProject = projectOf({ "packages/client/src/a.tsx": "export const view = <div>   </div>;\n" });
  const whitespace = policy("empty-node-position", {
    create: (ctx) => ({
      visitors: [{ kinds: [SyntaxKind.JsxText], visit: (node) => ctx.report.node(node) }],
    }),
  });
  const whitespaceResult = run([whitespace], whitespaceProject);
  expect(whitespaceResult.policies[0]?.owner.status).toBe("incomplete");
  expect(whitespaceResult.toolErrors).toMatchObject([
    { policyId: whitespace.id, phase: "visit", message: expect.stringMatching(/position token|authored token/i) },
  ]);
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

test("declared fact providers collect once over their own population and reset across re-entry", () => {
  const project = projectOf({
    "packages/client/src/a.ts": "export const client = 1;\n",
    "tooling/src/fact.ts": "export const fact = 1;\n",
  });
  let constructions = 0;
  let visits = 0;
  const seen = new Set<object>();
  const provider = defineFact({
    id: "fixture-fact",
    population: "@tooling",
    analysis: "syntax",
    resources: [],
    create: (ctx) => {
      constructions += 1;
      const value = { visits: 0 };
      return {
        visitors: [
          {
            kinds: [SyntaxKind.VariableDeclaration],
            visit: () => {
              value.visits += 1;
              visits += 1;
            },
          },
        ],
        finish: () => {
          ctx.receipt({ kind: "population", source: "fixture-fact", members: value.visits });
          return value;
        },
      };
    },
  });
  const consumer = (id: string): GatePolicy =>
    policy(id, {
      execution: "entire-population",
      facts: [provider],
      create: (ctx) => ({
        evaluate: () => {
          const value = ctx.fact(provider);
          seen.add(value);
          // A fact-declaring policy owes its OWN semantic receipt (#1966, `policyReceiptFailures`) — the
          // consumer half of the receipt law. It states what this consumer measured (one fact), never the census.
          ctx.receipt({ kind: "population", source: id, members: 1 });
          if (value.visits !== 1) {
            throw new Error("fact did not collect its exact independent population once");
          }
        },
      }),
    });
  const policies = [consumer("fact-consumer-a"), consumer("fact-consumer-b")];

  const first = run(policies, project);
  expect(first.factErrors).toEqual([]);
  expect(first.toolErrors).toEqual([]);
  expect(first.facts).toMatchObject([{ id: "fixture-fact", status: "success", population: { effectiveSourcePaths: ["tooling/src/fact.ts"] } }]);
  expect(constructions).toBe(1);
  expect(visits).toBe(1);
  expect(seen.size).toBe(1);

  const second = run(policies, project);
  expect(second.factErrors).toEqual([]);
  expect(second.toolErrors).toEqual([]);
  expect(constructions).toBe(2);
  expect(visits).toBe(2);
  expect(seen.size).toBe(2);

  const unused = policy("unused-fact-consumer", {
    execution: "entire-population",
    facts: [provider],
    create: () => ({ evaluate: () => undefined }),
  });
  expect(run([unused], project).toolErrors).toMatchObject([
    { policyId: "unused-fact-consumer", phase: "receipt", message: expect.stringMatching(/facts.*not consumed.*fixture-fact/i) },
  ]);
});

test("fact access is declared and post-finish while one provider failure withholds every consumer", () => {
  const project = projectOf({
    "packages/client/src/a.ts": "export const client = 1;\n",
    "tooling/src/fact.ts": "export const fact = 1;\n",
  });
  const failing = defineFact({
    id: "failing-fact",
    population: "@tooling",
    analysis: "syntax",
    resources: [],
    create: (ctx) => ({
      finish: () => {
        ctx.receipt({ kind: "population", source: "failing-fact", members: 1 });
        throw new Error("shared finish boom");
      },
    }),
  });
  const dependent = (id: string): GatePolicy =>
    policy(id, {
      execution: "entire-population",
      facts: [failing],
      create: (ctx) => ({ evaluate: () => void ctx.fact(failing) }),
    });
  const failed = run([dependent("dependent-a"), dependent("dependent-b")], project);

  expect(failed.factErrors).toEqual([{ factId: "failing-fact", phase: "finish", message: "shared finish boom" }]);
  expect(failed.toolErrors).toMatchObject([
    { policyId: "dependent-a", phase: "evaluate", message: expect.stringMatching(/failing-fact.*finish boom/i) },
    { policyId: "dependent-b", phase: "evaluate", message: expect.stringMatching(/failing-fact.*finish boom/i) },
  ]);
  expect(failed.authority.withheldPolicyIds).toEqual(["dependent-a", "dependent-b"]);

  const early = policy("early-fact-read", {
    execution: "entire-population",
    facts: [failing],
    create: (ctx) => {
      ctx.fact(failing);
      return { evaluate: () => undefined };
    },
  });
  expect(run([early], project).toolErrors).toMatchObject([{ policyId: "early-fact-read", phase: "create", message: expect.stringMatching(/not finished/i) }]);

  const undeclared = policy("undeclared-fact-read", {
    execution: "entire-population",
    create: (ctx) => ({ evaluate: () => void ctx.fact(failing) }),
  });
  expect(run([undeclared], project).toolErrors).toMatchObject([
    { policyId: "undeclared-fact-read", phase: "evaluate", message: expect.stringMatching(/undeclared fact/i) },
  ]);
});

test.each([
  ["population", 0, 0],
  ["population", 1, 1],
  ["resource", 0, 0],
  ["resource", 1, 1],
] as const)("a fact %s receipt with count %i and unresolved %i withholds every consumer without stale authority", (kind, count, unresolved) => {
  const resourceFact = kind === "resource";
  const provider = defineFact({
    id: "invalid-receipt-fact",
    population: resourceFact ? ({ of: "none", why: "resource receipt fixture" } as const) : "@tooling",
    analysis: resourceFact ? "resource" : "syntax",
    resources: resourceFact ? ([{ kind: "package-metadata", id: "root" }] as const) : [],
    create: (ctx) => ({
      finish: () => {
        if (resourceFact) {
          ctx.resources.packageMetadata("root");
          ctx.receipt({ kind: "resource", source: "invalid-receipt", resources: count, unresolved });
        } else {
          ctx.receipt({ kind: "population", source: "invalid-receipt", members: count, unresolved });
        }
        return "ready";
      },
    }),
  });
  const evaluated: string[] = [];
  const consumer = (id: string): GatePolicy =>
    policy(id, {
      authority: "reviewed-grant",
      mustFlag: [
        {
          mode: "source",
          files: { "packages/client/src/proof.ts": "export const planted = true;\n" },
          grant: { subject: "unused-subject", operation: "read" },
          why: "the provider refusal must withhold grant liveness",
        },
      ],
      execution: "entire-population",
      facts: [provider],
      create: (ctx) => ({
        evaluate: () => {
          evaluated.push(id);
          ctx.fact(provider);
        },
      }),
    });
  const consumers = [consumer("invalid-receipt-consumer-a"), consumer("invalid-receipt-consumer-b")];
  const reviewedGrants = consumers.map((gate) => ({
    id: `grant-${gate.id}`,
    policyId: gate.id,
    subject: "unused-subject",
    operation: "read",
    why: "fixture",
    endsWhen: "the incomplete owner becomes complete",
  }));
  const result = run(consumers, projectOf({ "packages/client/src/a.ts": "export const client = 1;\n", "tooling/src/fact.ts": "export const fact = 1;\n" }), {
    reviewedGrants,
    resourceOptions: { overlay: { "package.json": '{"name":"orb","private":true}\n' } },
  });

  expect(result.factErrors).toMatchObject([{ factId: provider.id, phase: "receipt", message: expect.stringMatching(/zero|unresolved/i) }]);
  expect(result.authority.withheldPolicyIds).toEqual(consumers.map(({ id }) => id));
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(evaluated).toEqual([]);
});

test("different provider objects cannot claim the same fact id", () => {
  const fact = (value: number): GateFact<number> =>
    defineFact({
      id: "duplicate-fact",
      population: "@tooling",
      analysis: "syntax",
      resources: [],
      create: (ctx) => ({
        finish: () => {
          ctx.receipt({ kind: "population", source: "duplicate-fact", members: 1 });
          return value;
        },
      }),
    });
  const first = fact(1);
  const second = fact(2);
  expect(first).not.toBe(second);
  const consumer = (id: string, provider: typeof first): GatePolicy =>
    policy(id, {
      execution: "entire-population",
      facts: [provider],
      create: (ctx) => ({ evaluate: () => void ctx.fact(provider) }),
    });
  const project = projectOf({
    "packages/client/src/a.ts": "export const client = 1;\n",
    "tooling/src/a.ts": "export const tooling = 1;\n",
  });

  expect(() => run([consumer("duplicate-consumer-a", first), consumer("duplicate-consumer-b", second)], project)).toThrow(
    /different fact descriptors.*duplicate-fact/i,
  );
});

test("a resource fact owns acquisition and receipts independently of its consumers", () => {
  const provider = defineFact({
    id: "package-fact",
    population: { of: "none", why: "package metadata is a resource" },
    analysis: "resource",
    resources: [{ kind: "package-metadata", id: "root" }],
    create: (ctx) => ({
      finish: () => {
        const resource = ctx.resources.packageMetadata("root");
        if (resource.status !== "ready") {
          throw new Error(resource.reason);
        }
        return resource.value.name;
      },
    }),
  });
  const consumer = policy("package-fact-consumer", {
    execution: "entire-population",
    facts: [provider],
    create: (ctx) => ({
      evaluate: () => {
        if (ctx.fact(provider) !== "orb") {
          throw new Error("consumer received the wrong package fact");
        }
        // The consumer's own receipt (#1966) — independent of the provider's resource receipt asserted below.
        ctx.receipt({ kind: "population", source: "package-fact-consumer", members: 1 });
      },
    }),
  });
  const result = run([consumer], projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" }), {
    resourceOptions: { overlay: { "package.json": JSON.stringify({ name: "orb", private: true }) } },
  });

  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.facts).toMatchObject([
    {
      id: "package-fact",
      status: "success",
      population: { effectiveSourcePaths: [], effectiveResourcePaths: ["package.json"] },
      receipts: [{ kind: "resource", source: "package:root", resources: 1, unresolved: 0 }],
    },
  ]);
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
    "packages/client/src/ordinary.ts": "// @orb-waive ordinary-policy(ordinary): fixture\nexport const ordinary = 1;\n",
    "packages/client/src/reviewed.ts": "export const reviewed = 1;\n",
  });
  const anchored = (id: string, file: string, overrides: Partial<GatePolicy> = {}): GatePolicy =>
    policy(id, { create: (ctx) => ({ evaluate: () => ctx.report.file(file, { subject: file, operation: "read" }) }), ...overrides });
  const hard = anchored("hard-policy", "packages/client/src/hard.ts");
  const ordinary = anchored("ordinary-policy", "packages/client/src/ordinary.ts", {
    authority: "ordinary",
    severity: "warning",
    workItem: 1584,
    create: (ctx) => ({
      evaluate: () => ctx.report.file("packages/client/src/ordinary.ts", { line: 2, column: 14, token: "ordinary" }),
    }),
  });
  const reviewed = anchored("reviewed-policy", "packages/client/src/reviewed.ts", {
    authority: "reviewed-grant",
    mustFlag: [
      {
        mode: "source",
        files: { "packages/client/src/reviewed.ts": "export const reviewed = 1;\n" },
        grant: { subject: "packages/client/src/reviewed.ts", operation: "read" },
        why: "the anchored finding binds the central grant",
      },
    ],
  });
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
  });

  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: hard.id, severity: "error" }]);
  expect(result.authority.waivedFindings).toMatchObject([
    { waiverId: "packages/client/src/ordinary.ts:1:1", finding: { policyId: ordinary.id, severity: "warning" } },
  ]);
  expect(result.authority.grantedFindings).toMatchObject([{ grantId: "grant-reviewed", finding: { policyId: reviewed.id } }]);
  expect(result.authority.verdict).toEqual({ errors: 1, warnings: 0, blocking: 1, failOnWarnings: true });

  const promotedProject = projectOf({ "packages/client/src/ordinary.ts": "// deliberately unwaived\nexport const ordinary = 1;\n" });
  const promoted = run([ordinary], promotedProject, { failOnWarnings: true });
  expect(promoted.authority.effectiveFindings).toMatchObject([{ policyId: ordinary.id, severity: "warning" }]);
  expect(promoted.authority.verdict).toEqual({ errors: 0, warnings: 1, blocking: 1, failOnWarnings: true });
});

test("final policy execution and waiver acquisition admit only authored .ts/.tsx sources", () => {
  const source = "// @orb-waive source-universe(forbidden): authored source only\nexport const forbidden = 1;\n";
  let creates = 0;
  const seen: string[] = [];
  const gate = policy("source-universe", {
    authority: "ordinary",
    population: "@tooling",
    create: (ctx) => {
      creates += 1;
      return {
        visitFile: (sourceFile) => {
          const path = ctx.relativePath(sourceFile);
          seen.push(path);
          ctx.report.file(path, { line: 2, column: 14, token: "forbidden" });
        },
      };
    },
  });

  const mtsOnly = run([gate], projectOf({ "tooling/src/only.mts": source }));
  expect(creates).toBe(0);
  expect(mtsOnly.policies[0]).toMatchObject({ owner: { status: "incomplete" }, population: { declaredSourcePaths: [] } });
  expect(mtsOnly.authority.authorityAlarms).toEqual([]);
  expect(mtsOnly.authority.ordinaryConsumption).toEqual([]);

  const mixed = run(
    [gate],
    projectOf({
      "tooling/src/live.ts": source,
      "tooling/src/ignored.mts": source,
      "tooling/src/ignored.cts": source,
      "tooling/src/ignored.mjs": source,
      "tooling/src/ignored.cjs": source,
      "tooling/src/ignored.js": source,
      "tooling/src/ignored.jsx": source,
    }),
  );
  expect(creates).toBe(1);
  expect(seen).toEqual(["tooling/src/live.ts"]);
  expect(mixed.policies[0]?.population).toMatchObject({
    declaredSourcePaths: ["tooling/src/live.ts"],
    effectiveSourcePaths: ["tooling/src/live.ts"],
  });
  expect(mixed.authority.waivedFindings).toMatchObject([{ waiverId: "tooling/src/live.ts:1:1" }]);
  expect(mixed.authority.ordinaryConsumption).toEqual([{ id: "tooling/src/live.ts:1:1", count: 1 }]);
  expect(mixed.authority.authorityAlarms).toEqual([]);
});

function resourceWaiverPolicy(input: {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly token: string;
  readonly createThrows?: boolean;
}): GatePolicy {
  return policy(input.id, {
    authority: "ordinary",
    population: { of: "none", why: "resource-only waiver fixture" },
    analysis: "resource",
    execution: "entire-population",
    facts: [],
    resources: [{ kind: "authored-tree", id: "client-source" }],
    create: (ctx) => ({
      evaluate: () => {
        ctx.resources.authoredTree("client-source");
        if (input.createThrows === true) {
          throw new Error("resource owner failed");
        }
        ctx.report.file(input.file, { line: input.line, column: input.column, token: input.token });
      },
    }),
  });
}

test.each([
  {
    label: "CSS block comments",
    file: "packages/client/src/styles/waived.css",
    source: ".a {\n  /* @orb-waive resource-format(#bad): exact CSS declaration */\n  color: #bad;\n}\n",
    line: 3,
    column: 10,
    token: "#bad",
  },
  {
    label: "Markdown HTML comments",
    file: "packages/client/src/waived.md",
    source: "<!-- @orb-waive resource-format(forbidden): exact prose token -->\nforbidden\n",
    line: 2,
    column: 1,
    token: "forbidden",
  },
  {
    label: "JSONC line comments",
    file: "packages/client/src/waived.jsonc",
    source: '{\n  // @orb-waive resource-format(forbidden): exact JSONC value\n  "value": "forbidden"\n}\n',
    line: 3,
    column: 13,
    token: "forbidden",
  },
  {
    label: "JSONC block comments",
    file: "packages/client/src/waived-block.jsonc",
    source: '{\n  /* @orb-waive resource-format(forbidden): exact JSONC value */\n  "value": "forbidden"\n}\n',
    line: 3,
    column: 13,
    token: "forbidden",
  },
  {
    label: "SQL line comments",
    file: "packages/client/src/waived.sql",
    source: "-- @orb-waive resource-format(forbidden): exact SQL token\nSELECT forbidden;\n",
    line: 2,
    column: 8,
    token: "forbidden",
  },
  {
    label: "SQL block comments",
    file: "packages/client/src/waived-block.sql",
    source: "/* @orb-waive resource-format(forbidden): exact SQL token */\nSELECT forbidden;\n",
    line: 2,
    column: 8,
    token: "forbidden",
  },
])("ordinary resource waivers bind through $label", ({ file, source, line, column, token }) => {
  const gate = resourceWaiverPolicy({ id: "resource-format", file, line, column, token });
  const result = run([gate], projectOf({}), { resourceOptions: { overlay: { [file]: source } } });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toMatchObject([{ finding: { file, token } }]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("plain JSON is a commentless carrier and marker-shaped strings cannot waive it", () => {
  const file = "packages/client/src/waived.json";
  const source = '{\n  "marker": "@orb-waive json-resource(forbidden): string is not a comment",\n  "value": "forbidden"\n}\n';
  const gate = resourceWaiverPolicy({ id: "json-resource", file, line: 3, column: 13, token: "forbidden" });
  const result = run([gate], projectOf({}), { resourceOptions: { overlay: { [file]: source } } });

  expect(result.authority.waivedFindings).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file, token: "forbidden" }]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.ordinaryConsumption).toEqual([]);
});

test("Markdown scans every HTML comment on a line for ordinary waiver markers", () => {
  const file = "packages/client/src/multiple-comments.md";
  const source = "<!-- ordinary note --> <!-- @orb-waive markdown-comments(forbidden): second comment marker -->\nforbidden\n";
  const gate = resourceWaiverPolicy({ id: "markdown-comments", file, line: 2, column: 1, token: "forbidden" });
  const result = run([gate], projectOf({}), { resourceOptions: { overlay: { [file]: source } } });

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toMatchObject([{ finding: { file, token: "forbidden" } }]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test.each([
  ["a blank line", "\n"],
  ["an intervening comment", "<!-- ordinary note -->\n"],
])("a Markdown resource marker does not bind across %s", (_label, intervening) => {
  const file = "packages/client/src/nonadjacent.md";
  const source = `<!-- @orb-waive markdown-adjacency(forbidden): marker must be adjacent -->\n${intervening}forbidden\n`;
  const gate = resourceWaiverPolicy({ id: "markdown-adjacency", file, line: 3, column: 1, token: "forbidden" });
  const result = run([gate], projectOf({}), { resourceOptions: { overlay: { [file]: source } } });

  expect(result.authority.effectiveFindings).toMatchObject([{ file, token: "forbidden" }]);
  expect(result.authority.waivedFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toMatchObject([{ policyId: gate.id, message: expect.stringMatching(/cannot bind|stale/i) }]);
});

test("malformed and stale CSS markers alarm while the live finding remains effective", () => {
  const file = "packages/client/src/styles/refused.css";
  const source = ".a {\n  /* @orb-waive */\n  /* @orb-waive css-refusal(missing): stale position */\n  color: #bad;\n}\n";
  const gate = resourceWaiverPolicy({ id: "css-refusal", file, line: 4, column: 10, token: "#bad" });
  const result = run([gate], projectOf({}), { resourceOptions: { overlay: { [file]: source } } });

  expect(result.authority.effectiveFindings).toMatchObject([{ file, token: "#bad" }]);
  expect(result.authority.waivedFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map(({ message }) => message)).toEqual([
    expect.stringMatching(/stale|dead position/i),
    expect.stringMatching(/malformed/i),
  ]);
});

test("undeclared resource files cannot contribute ordinary waiver markers", () => {
  const file = "packages/client/src/styles/declared.css";
  const source = ".a {\n  /* @orb-waive declared-css(#bad): exact CSS declaration */\n  color: #bad;\n}\n";
  const gate = policy("declared-css", {
    authority: "ordinary",
    population: { of: "none", why: "authored CSS only" },
    analysis: "resource",
    execution: "entire-population",
    facts: [],
    resources: [{ kind: "authored-css" }],
    create: (ctx) => ({
      evaluate: () => {
        ctx.resources.authoredCss();
        ctx.report.file(file, { line: 3, column: 10, token: "#bad" });
      },
    }),
  });
  const result = run([gate], projectOf({}), {
    resourceOptions: {
      overlay: {
        [file]: source,
        "packages/ui/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/client/src/undeclared.md": "<!-- @orb-waive declared-css(missing): undeclared marker -->\nclean\n",
      },
    },
  });

  expect(result.authority.waivedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.ordinaryConsumption).toHaveLength(1);
});

test("an incomplete resource owner withholds stale liveness but not malformed acquisition", () => {
  const file = "packages/client/src/incomplete.md";
  const source = "<!-- @orb-waive resource-incomplete(missing): stale while incomplete -->\n<!-- @orb-waive -->\nclean\n";
  const gate = resourceWaiverPolicy({ id: "resource-incomplete", file, line: 3, column: 1, token: "clean", createThrows: true });
  const result = run([gate], projectOf({}), { resourceOptions: { overlay: { [file]: source } } });

  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
  expect(result.authority.authorityAlarms).toMatchObject([{ policyId: "ordinary-waiver", message: expect.stringMatching(/malformed/i) }]);
  expect(result.authority.authorityAlarms).toHaveLength(1);
});

test("ordinary waiver acquisition alarms stay blocking while unselected liveness is withheld", () => {
  const selected = policy("ordinary-selected", { authority: "ordinary" });
  const unselected = policy("ordinary-unselected", { authority: "ordinary" });
  const hard = policy("hard-known");
  const project = projectOf({
    "packages/client/src/waivers.ts": [
      "// @orb-waive",
      "// @orb-waive missing-policy(value): unknown owner",
      "// @orb-waive hard-known(value): wrong authority",
      "// @orb-waive ordinary-unselected(value): liveness withheld",
      "export const value = 1;",
    ].join("\n"),
  });

  const result = run([selected], project, { knownPolicies: [selected, unselected, hard] });

  expect(result.authority.authorityAlarms).toHaveLength(3);
  expect(result.authority.authorityAlarms.map(({ message }) => message)).toEqual([
    expect.stringMatching(/non-ordinary|wrong.*authority/i),
    expect.stringMatching(/unknown policy/i),
    expect.stringMatching(/malformed/i),
  ]);
  expect(result.authority.verdict).toMatchObject({ errors: 3, blocking: 3 });
  expect(result.authority.authorityAlarms.some(({ policyId }) => policyId === unselected.id)).toBe(false);
});

test("reviewed grants validate against the full known roster without judging unselected liveness", () => {
  const selected = policy("selected-hard");
  const unselectedReviewed = policy("unselected-reviewed", {
    authority: "reviewed-grant",
    mustFlag: [
      {
        mode: "source",
        files: { "packages/client/src/proof.ts": "export const planted = true;\n" },
        grant: { subject: "subject", operation: "read" },
        why: "the unselected owner must withhold liveness",
      },
    ],
  });
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  const knownPolicies = [selected, unselectedReviewed];
  const grant = {
    id: "grant",
    policyId: unselectedReviewed.id,
    subject: "subject",
    operation: "read",
    why: "fixture",
    endsWhen: "the unselected owner runs",
  };

  const unknown = run([selected], project, { knownPolicies, reviewedGrants: [{ ...grant, policyId: "missing-policy" }] });
  expect(unknown.authority.toolErrors).toMatchObject([{ kind: "invalid-grant", policyId: "missing-policy" }]);

  const wrongAuthority = run([selected], project, { knownPolicies, reviewedGrants: [{ ...grant, policyId: selected.id }] });
  expect(wrongAuthority.authority.toolErrors).toMatchObject([{ kind: "invalid-grant-authority", policyId: selected.id }]);

  const unselected = run([selected], project, { knownPolicies, reviewedGrants: [grant] });
  expect(unselected.authority.toolErrors).toEqual([]);
  expect(unselected.authority.authorityAlarms).toEqual([]);
  expect(unselected.authority.reviewedGrantConsumption).toEqual([{ id: grant.id, count: 0 }]);
});

test("an incomplete ordinary owner withholds stale liveness but not malformed acquisition", () => {
  const incomplete = policy("ordinary-incomplete", {
    authority: "ordinary",
    create: () => {
      throw new Error("owner failed before reporting");
    },
  });
  const project = projectOf({
    "packages/client/src/incomplete.ts": ["// @orb-waive ordinary-incomplete(value): stale while incomplete", "// @orb-waive", "export const value = 1;"].join(
      "\n",
    ),
  });

  const result = run([incomplete], project);

  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.authority.withheldPolicyIds).toEqual([incomplete.id]);
  expect(result.authority.authorityAlarms).toMatchObject([{ policyId: "ordinary-waiver", message: expect.stringMatching(/malformed/i) }]);
  expect(result.authority.authorityAlarms).toHaveLength(1);
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
    receipt: expect.any(Number),
  });
  expect(result.timing.totalMs).toBeGreaterThanOrEqual(result.timing.policyMs);
});

test("the public context type and runtime surface expose neither Project nor root", () => {
  type Forbidden = Extract<keyof GatePolicyContext, "project" | "root">;
  const noForbiddenKeys: Forbidden extends never ? true : false = true;
  const project = projectOf({ "packages/client/src/a.ts": "export const a = 1;\n" });
  let keys: readonly string[] = [];
  let frozen: readonly boolean[] = [];
  let mutations: readonly boolean[] = [];
  const gate = policy("context-surface", {
    create: (ctx) => {
      keys = Object.keys(ctx).sort();
      frozen = [Object.isFrozen(ctx), Object.isFrozen(ctx.report), Object.isFrozen(ctx.files), Object.isFrozen(ctx.resourcePaths)];
      const originalNode = ctx.report.node;
      mutations = [Reflect.set(ctx as object, "extra", true), Reflect.set(ctx.report as object, "node", () => undefined), ctx.report.node === originalNode];
      return { evaluate: () => undefined } satisfies GatePolicyHooks;
    },
  });

  run([gate], project);

  expect(noForbiddenKeys).toBe(true);
  expect(keys).toEqual(["checker", "fact", "files", "receipt", "relativePath", "report", "resourcePaths", "resources", "sourceFile"]);
  expect(frozen).toEqual([true, true, true, true]);
  expect(mutations).toEqual([false, false, true]);
});

test("declared resources without acquisition receipts cannot complete or reconcile grants", () => {
  const gate = policy("unread-resource", {
    analysis: "resource",
    authority: "reviewed-grant",
    mustFlag: [
      {
        mode: "resource",
        files: { "package.json": "{}" },
        grant: { subject: "package.json", operation: "read" },
        why: "the missing receipt must withhold grant liveness",
      },
    ],
    population: { of: "none", why: "resource-only owner" },
  });
  const result = run([gate], projectOf({}), {
    resourceOptions: { overlay: { "package.json": '{"name":"orb"}' } },
    reviewedGrants: [{ id: "unread-grant", policyId: gate.id, subject: "package.json", operation: "read", why: "fixture grant", endsWhen: "fixture ends" }],
  });
  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.toolErrors).toMatchObject([{ phase: "receipt", message: expect.stringContaining("no resource receipt") }]);
  expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("resource contexts share one invocation host with injected overlays and own their receipts", () => {
  const overlay = { "package.json": '{"name":"fixture"}' };
  const facts: object[] = [];
  const resourceOwner = (id: string): GatePolicy =>
    policy(id, {
      analysis: "resource",
      population: { of: "none", why: "package metadata only" },
      create: (ctx) => ({
        evaluate: () => {
          facts.push(ctx.resources.packageMetadata("root"));
          ctx.resources.packageMetadata("root");
        },
      }),
    });
  const owners = [resourceOwner("resource-a"), resourceOwner("resource-b")];
  const result = run(owners, projectOf({}), {
    resourceOptions: { overlay },
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.policies.every(({ owner }) => owner.status === "success")).toBe(true);
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [{ kind: "resource", source: "package:root", resources: 1, unresolved: 0 }],
    [{ kind: "resource", source: "package:root", resources: 1, unresolved: 0 }],
  ]);
  expect(facts[0]).toBe(facts[1]);
});

test("resource injection cannot substitute a different root with the same relative paths", async ({ plantedTree }) => {
  const root = await plantedTree({ "package.json": '{"name":"root-a"}' });
  const otherRoot = await plantedTree({ "package.json": '{"name":"root-b"}' });
  const names: string[] = [];
  const gate = policy("root-identity", {
    analysis: "resource",
    population: { of: "none", why: "package metadata" },
    create: (ctx) => ({
      evaluate: () => {
        const fact = ctx.resources.packageMetadata("root");
        if (fact.status === "ready") {
          names.push(fact.value.name);
        }
      },
    }),
  });
  const result = run([gate], projectOf({}), {
    root,
    resourceOptions: { root: otherRoot } as never,
  });
  expect(names).toEqual(["root-a"]);
  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
});

// #1947 — the `native-config` resource kind observes the WHOLE authored transaction (deliberate:
// `ops/resource-native-config.ts` header — an executable config can read anything). A transaction that
// large always carries paths the reader refuses BY DESIGN (a tracked symlink, undecodable bytes), so the
// two arms below pin WHO may demand an ordinary-waiver text carrier and what happens when one cannot be
// built. Before the fix both arms died with a thrown pass: `no exact text carrier: bad.md`.
function nativeConfigTransaction(root: string): void {
  writeFileSync(join(root, "vitest.config.ts"), 'export default { test: { include: ["tests/a.test.ts"] } };\n');
  writeFileSync(join(root, "note.md"), "<!-- @orb-waive native-ordinary(forbidden): exact prose token -->\nforbidden\n");
  writeFileSync(join(root, "target.md"), "target\n");
  symlinkSync("target.md", join(root, "link.md"));
  writeFileSync(join(root, "bad.md"), Buffer.from([0xff, 0xfe, 0x41, 0x0a]));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
}

function nativeConfigPolicy(id: string, authority: GatePolicy["authority"]): GatePolicy {
  return policy(id, {
    authority,
    population: { of: "none", why: "the executable runner config and the authored transaction it observes" },
    analysis: "resource",
    execution: "entire-population",
    facts: [],
    resources: [{ kind: "native-config", id: "vitest" }],
    create: (ctx) => ({
      evaluate: () => {
        ctx.resources.nativeConfig("vitest");
        ctx.report.file("note.md", { line: 2, column: 1, token: "forbidden" });
      },
    }),
  });
}

test("a HARD owner's resource population demands no ordinary-waiver carrier", ({ scratch }) => {
  nativeConfigTransaction(scratch);
  const gate = nativeConfigPolicy("native-hard", "hard");
  const result = run([gate], projectOf({}), { root: scratch });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  expect(result.policies[0]?.population.effectiveResourcePaths).toEqual(expect.arrayContaining(["bad.md", "link.md", "note.md"]));
  expect(result.waiverCarrierRefusals).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: "note.md", token: "forbidden" }]);
  // A hard finding has no waiver door, so the marker sitting in this owner's population is never acquired.
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("an ORDINARY owner still gets its carriers, and a refused carrier is a receipted skip", ({ scratch }) => {
  nativeConfigTransaction(scratch);
  const gate = nativeConfigPolicy("native-ordinary", "ordinary");
  const result = run([gate], projectOf({}), { root: scratch });

  expect(result.toolErrors).toEqual([]);
  expect(result.waiverCarrierRefusals).toMatchObject([
    { path: "bad.md", format: "markdown", status: "unresolved" },
    { path: "link.md", format: "markdown", status: "unresolved" },
  ]);
  expect(result.authority.waivedFindings).toMatchObject([{ finding: { file: "note.md", token: "forbidden" } }]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE FACT-WIDENING DIAGNOSIS (#1976). A shared provider's population is the UNION of its consumers' by
// construction, so a policy routinely receives nodes from files it may not NAME — and `ctx.relativePath`
// refuses them. That refusal is correct and fail-closed; what it was not, until now, is SELF-EXPLAINING, and
// three modules on the tree already hand-roll their own way around it. The pins are both directions of the
// suffix, because a diagnosis that fires on every refusal explains nothing.
// ---------------------------------------------------------------------------------------------------
const WIDER_VOCABULARY: GateFact<SourceFile | undefined> = defineFact({
  id: "wider-vocabulary",
  population: ["@client", "@server"],
  analysis: "syntax",
  resources: [],
  create: (ctx) => ({
    finish: (): SourceFile | undefined => {
      ctx.receipt({ kind: "population", source: "wider-vocabulary", members: ctx.files.length });
      return ctx.files.find((file) => ctx.relativePath(file).startsWith("packages/server/"));
    },
  }),
});

function widenedConsumer(id: string, read: (ctx: GatePolicyContext, foreign: SourceFile | undefined) => void): GatePolicy {
  return policy(id, {
    population: "@client",
    execution: "entire-population",
    facts: [WIDER_VOCABULARY],
    create: (ctx): GatePolicyHooks => ({
      evaluate: () => {
        const foreign = ctx.fact(WIDER_VOCABULARY);
        ctx.receipt({ kind: "population", source: id, members: 1 });
        read(ctx, foreign);
      },
    }),
  });
}

const WIDENED_FILES = {
  "packages/client/src/proof.ts": "export const clean = true;\n",
  "packages/server/src/vocabulary.ts": "export const VOCAB = [] as const;\n",
  "packages/ui/src/elsewhere.ts": "export const elsewhere = true;\n",
};

test("a file refused by ctx.relativePath NAMES the declared fact whose population admits it, and the reader that answers it", () => {
  const gate = widenedConsumer("widened-relative-path", (ctx, foreign) => {
    if (foreign !== undefined) {
      ctx.relativePath(foreign);
    }
  });
  const result = run([gate], projectOf(WIDENED_FILES));

  const message = result.toolErrors[0]?.message ?? "";
  expect(result.toolErrors).toMatchObject([{ policyId: "widened-relative-path", phase: "evaluate" }]);
  expect(message).toContain("source file is outside the effective population");
  expect(message).toContain("wider-vocabulary");
  expect(message).toContain("declarationHome");
  expect(result.authority.withheldPolicyIds).toEqual(["widened-relative-path"]);
});

test("a file outside EVERY declared fact's population is refused WITHOUT a fact diagnosis — the suffix discriminates", () => {
  const gate = widenedConsumer("widened-elsewhere", (ctx) => {
    ctx.sourceFile("packages/ui/src/elsewhere.ts");
  });
  const result = run([gate], projectOf(WIDENED_FILES));

  const message = result.toolErrors[0]?.message ?? "";
  expect(message).toContain("sourceFile path is absent or outside the effective population: packages/ui/src/elsewhere.ts");
  expect(message).not.toContain("wider-vocabulary");
  expect(message).not.toContain("declarationHome");
});
