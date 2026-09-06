import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SyntaxKind } from "ts-morph";
import type { GatePolicy, GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SOURCE_FLAG: GatePolicyProof = {
  mode: "source",
  files: { "packages/client/src/proof.ts": "export const planted = true;\n" },
  why: "the founding defect",
};
const SOURCE_PASS: GatePolicyProof = {
  mode: "source",
  files: { "packages/client/src/proof.ts": "export const clean = true;\n" },
  why: "the nearest legal shape",
};

function sourcePolicy(id: string, overrides: Partial<GatePolicy> = {}): GatePolicy {
  return defineGate({
    id,
    family: id,
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: `${id} message`,
    create: (ctx) => ({
      visitFile: (sourceFile) => {
        if (sourceFile.getFullText().includes("planted")) {
          ctx.report.file(ctx.relativePath(sourceFile));
        }
      },
    }),
    mustFlag: [SOURCE_FLAG],
    mustPass: [SOURCE_PASS],
    ...overrides,
  } as GatePolicy);
}

test("source and types proofs receive their exact files and relative imports resolve", () => {
  const seen: string[][] = [];
  const source = sourcePolicy("source-population", {
    create: (ctx) => ({
      evaluate: () => {
        seen.push(ctx.files.map(ctx.relativePath));
        const current = ctx.files[0] as NonNullable<(typeof ctx.files)[number]>;
        if (current.getFullText().includes("planted")) {
          ctx.report.file(ctx.relativePath(current));
        }
      },
    }),
    mustPass: [
      {
        mode: "source",
        files: { "packages/client/src/pass.ts": "export const clean = true;\n" },
        why: "the second example has a different population",
      },
    ],
  });
  const typed = defineGate({
    id: "relative-type-identity",
    family: "relative-type-identity",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "types",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "the relative import resolves to the planted declaration",
    create: (ctx) => ({
      evaluate: () => {
        const main = ctx.sourceFile("packages/client/src/main.ts");
        const imported = main.getImportDeclarationOrThrow("./value.js").getModuleSpecifierSourceFileOrThrow();
        if (imported.getVariableDeclarationOrThrow("value").getInitializerOrThrow().getText() === '"bite"') {
          ctx.report.file(ctx.relativePath(main));
        }
      },
    }),
    mustFlag: [
      {
        mode: "types",
        files: {
          "packages/client/src/main.ts": 'import { value } from "./value.js";\nexport const result = value;\n',
          "packages/client/src/value.ts": 'export const value = "bite";\n',
        },
        why: "relative multi-file identity",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "packages/client/src/main.ts": 'import { value } from "./value.js";\nexport const result = value;\n',
          "packages/client/src/value.ts": 'export const value = "clean";\n',
        },
        why: "the same import with a legal declaration",
      },
    ],
  });

  expect(verifyPolicyProofs([source, typed])).toEqual([]);
  expect(seen).toEqual([["packages/client/src/proof.ts"], ["packages/client/src/pass.ts"]]);
});

test("mustFlag precision uses effective warnings and finding or descriptor messages", () => {
  const warning = sourcePolicy("warning-precision", {
    severity: "warning",
    workItem: 1584,
    message: "descriptor fallback message",
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node) => {
            if (node.getText().startsWith("bad")) {
              ctx.report.node(node, { token: "bad", offset: 0, message: "finding override detail" });
            } else if (node.getText().startsWith("fallback")) {
              ctx.report.node(node);
            }
          },
        },
      ],
    }),
    mustFlag: [
      {
        mode: "source",
        files: { "packages/client/src/proof.ts": "const ok = 1;\nconst bad = 2;\n" },
        expect: { count: 1, line: 2, token: "bad", messageIncludes: "override detail" },
        why: "exact warning precision",
      },
      {
        mode: "source",
        files: { "packages/client/src/proof.ts": "const fallback = 1;\n" },
        expect: { messageIncludes: "fallback message" },
        why: "descriptor message fallback",
      },
    ],
  });

  expect(verifyPolicyProofs([warning])).toEqual([]);

  const wrongCount = sourcePolicy("wrong-count", {
    mustFlag: [{ ...SOURCE_FLAG, expect: { count: 2 } }],
  });
  expect(verifyPolicyProofs([wrongCount])).toEqual([
    {
      policyId: "wrong-count",
      arm: "mustFlag",
      exampleIndex: 0,
      why: "the founding defect",
      detail: "expected effective finding count=2 but got 1",
    },
  ]);
});

test("mustFlag identity predicates must match the same effective finding", () => {
  const unrelated = sourcePolicy("unrelated-findings", {
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node) => {
            const first = node.getText().startsWith("first");
            const needle = node.getText().startsWith("needle");
            if (first) {
              ctx.report.node(node, { token: "first", offset: 0, message: "wrong message" });
            } else if (needle) {
              ctx.report.node(node, { token: "needle", offset: 0, message: "target message" });
            }
          },
        },
      ],
    }),
    mustFlag: [
      {
        mode: "source",
        files: { "packages/client/src/proof.ts": "const first = 1;\nconst needle = 2;\n" },
        expect: { line: 1, token: "needle", messageIncludes: "target" },
        why: "unrelated findings cannot jointly satisfy one expected identity",
      },
    ],
  });

  expect(verifyPolicyProofs([unrelated])).toEqual([
    {
      policyId: "unrelated-findings",
      arm: "mustFlag",
      exampleIndex: 0,
      why: "unrelated findings cannot jointly satisfy one expected identity",
      detail: 'expected one effective finding matching line=1, token="needle", messageIncludes="target" but no single finding matched',
    },
  ]);
});

test("the invocation boundary refuses invalid policy sets before any example runs", () => {
  let creates = 0;
  const counted = sourcePolicy("a-counted", {
    create: (ctx) => {
      creates += 1;
      return { evaluate: () => ctx.report.file("packages/client/src/proof.ts") };
    },
  });
  const duplicate = sourcePolicy("a-counted");
  const unbranded = { ...counted, id: "z-unbranded", family: "z-unbranded" } as GatePolicy;
  const invalid = defineGate({ ...counted, id: "z-invalid", family: "z-invalid", mustFlag: [] } as never);

  expect(() => verifyPolicyProofs([])).toThrow(/nonempty|policy/i);
  expect(() => verifyPolicyProofs([counted, duplicate])).toThrow(/duplicate.*a-counted/i);
  expect(() => verifyPolicyProofs([counted, unbranded])).toThrow(/defineGate|brand/i);
  expect(() => verifyPolicyProofs([counted, invalid])).toThrow(/invalid.*policy|mustFlag/i);
  expect(creates).toBe(0);
});

test("source and types proofs reject compiler module extensions outside .ts and .tsx", () => {
  for (const extension of ["mts", "cts", "mjs", "cjs"] as const) {
    for (const mode of ["source", "types"] as const) {
      const invalid = sourcePolicy(`${mode}-${extension}`, {
        analysis: mode === "source" ? "syntax" : "types",
        mustFlag: [{ mode, files: { [`packages/client/src/proof.${extension}`]: "export const proof = true;\n" }, why: "source fence" }],
      });
      expect(() => verifyPolicyProofs([invalid])).toThrow(/only \.ts\/\.tsx|only \.ts|source paths/i);
    }
  }
});

test("tool failures, authority failures, bad receipts, and population mismatch fail distinctly", () => {
  const thrown = sourcePolicy("hook-throw", {
    create: () => ({
      evaluate: () => {
        throw new Error("provider exploded");
      },
    }),
  });
  const badReceipt = sourcePolicy("bad-receipt", {
    create: (ctx) => ({ evaluate: () => ctx.receipt({ kind: "population", source: "subjects", members: 0 }) }),
  });
  const reviewed = sourcePolicy("bad-reviewed-finding", {
    authority: "reviewed-grant",
    create: (ctx) => ({ evaluate: () => ctx.report.file("packages/client/src/proof.ts") }),
  });
  const mismatch = sourcePolicy("population-mismatch", { population: "@server" });

  const failures = verifyPolicyProofs([mismatch, reviewed, badReceipt, thrown]);

  expect(failures.map(({ policyId, arm, exampleIndex }) => `${policyId}:${arm}[${exampleIndex}]`)).toEqual([
    "bad-receipt:mustFlag[0]",
    "bad-receipt:mustPass[0]",
    "bad-reviewed-finding:mustFlag[0]",
    "bad-reviewed-finding:mustPass[0]",
    "hook-throw:mustFlag[0]",
    "hook-throw:mustPass[0]",
    "population-mismatch:mustFlag[0]",
    "population-mismatch:mustPass[0]",
  ]);
  expect(failures.find(({ policyId }) => policyId === "hook-throw")?.detail).toMatch(/^PASS TOOL ERROR .*provider exploded/u);
  expect(failures.find(({ policyId }) => policyId === "bad-receipt")?.detail).toMatch(/^PASS TOOL ERROR .*resolved zero members/u);
  expect(failures.find(({ policyId }) => policyId === "bad-reviewed-finding")?.detail).toMatch(/^AUTHORITY TOOL ERROR /u);
  expect(failures.find(({ policyId }) => policyId === "population-mismatch")?.detail).toMatch(/OWNER .*incomplete|PASS TOOL ERROR/u);
});

test("resource proofs materialize exact content and clean temp roots after success and throw", () => {
  const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("orb-policy-conformance-")));
  const roots: string[] = [];
  const observed: unknown[] = [];
  const resource = defineGate({
    id: "resource-substrate",
    family: "resource-substrate",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "resource",
    execution: "selected-files",
    facts: [],
    resources: [{ kind: "package-metadata", id: "root" }],
    message: "resource content is planted",
    create: (ctx) => ({
      evaluate: () => {
        const source = ctx.sourceFile("packages/client/src/provider.ts");
        const root = source.getFilePath().slice(0, -"packages/client/src/provider.ts".length);
        roots.push(root);
        const content = readFileSync(join(root, "package.json"), "utf8");
        const fact = ctx.resources.packageMetadata("root");
        if (fact.status !== "ready") {
          throw new Error(fact.reason);
        }
        observed.push({
          source: source.getFullText(),
          resources: ctx.resourcePaths,
          content,
        });
        if (fact.value.name === "bite" && ctx.resourcePaths.length === 1) {
          ctx.report.file(ctx.resourcePaths[0] as string);
        }
      },
    }),
    mustFlag: [
      {
        mode: "resource",
        files: {
          "packages/client/src/provider.ts": "export const provider = true;\n",
          "package.json": '{ "name": "bite", "private": true }\n',
        },
        why: "resource identity and content",
      },
    ],
    mustPass: [
      {
        mode: "resource",
        files: {
          "packages/client/src/provider.ts": "export const provider = false;\n",
          "package.json": '{ "name": "clean", "private": true }\n',
        },
        why: "the clean resource",
      },
    ],
  });

  expect(verifyPolicyProofs([resource])).toEqual([]);
  expect(observed).toEqual([
    {
      source: "export const provider = true;\n",
      resources: ["package.json"],
      content: '{ "name": "bite", "private": true }\n',
    },
    {
      source: "export const provider = false;\n",
      resources: ["package.json"],
      content: '{ "name": "clean", "private": true }\n',
    },
  ]);
  expect(roots).toHaveLength(2);
  expect(roots.every((root) => !existsSync(root))).toBe(true);

  const unconsumed = defineGate({
    ...resource,
    id: "unconsumed-resource",
    family: "unconsumed-resource",
    create: (ctx) => ({
      evaluate: () => {
        if (ctx.sourceFile("packages/client/src/provider.ts").getFullText().includes("true")) {
          ctx.report.file("package.json");
        }
      },
    }),
  });
  const unconsumedFailures = verifyPolicyProofs([unconsumed]);
  expect(unconsumedFailures.map(({ arm }) => arm)).toEqual(["mustFlag", "mustPass"]);
  expect(unconsumedFailures.every(({ detail }) => detail.includes("declared resource population produced no resource receipt"))).toBe(true);

  for (const mode of ["forged", "partial"] as const) {
    const incomplete = defineGate({
      ...resource,
      id: `${mode}-resource`,
      family: `${mode}-resource`,
      resources: [...resource.resources, { kind: "authored-tree", id: "client-source" }],
      mustFlag: resource.mustFlag.map((proof) => ({
        ...proof,
        files: { ...proof.files, "packages/client/src/support.txt": "declared but unread" },
      })),
      mustPass: resource.mustPass.map((proof) => ({
        ...proof,
        files: { ...proof.files, "packages/client/src/support.txt": "declared but unread" },
      })),
      create: (ctx) => ({
        evaluate: () => {
          if (mode === "forged") {
            ctx.receipt({ kind: "resource", source: "claimed", resources: 2 });
          } else {
            ctx.resources.packageMetadata("root");
          }
          if (ctx.sourceFile("packages/client/src/provider.ts").getFullText().includes("true")) {
            ctx.report.file("package.json");
          }
        },
      }),
    });
    const failures = verifyPolicyProofs([incomplete]);
    expect(failures.map(({ arm }) => arm)).toEqual(["mustFlag", "mustPass"]);
    expect(failures.every(({ detail }) => detail.includes("unconsumed paths:") && detail.includes("packages/client/src/support.txt"))).toBe(true);
  }

  const throwingResource = defineGate({
    ...resource,
    id: "resource-throw",
    family: "resource-throw",
    create: (ctx) => ({
      evaluate: () => {
        roots.push(dirname(dirname(dirname(dirname(ctx.files[0]?.getFilePath() ?? "")))));
        throw new Error("resource provider exploded");
      },
    }),
  });
  expect(verifyPolicyProofs([throwingResource])).toHaveLength(2);
  expect(roots.every((root) => !existsSync(root))).toBe(true);
  const after = readdirSync(tmpdir()).filter((name) => name.startsWith("orb-policy-conformance-") && !before.has(name));
  expect(after).toEqual([]);
});

test("typed authored-tree declarations keep resource-only TS proofs off source dispatch", () => {
  const sourceCounts: number[] = [];
  const resources = defineGate({
    id: "resource-only-ts-proof",
    family: "resource-only-ts-proof",
    authority: "hard",
    severity: "error",
    population: { of: "none", why: "the TS file is raw authored-tree data, not syntax input" },
    analysis: "resource",
    execution: "entire-population",
    facts: [],
    resources: [{ kind: "authored-tree", id: "client-source" }],
    message: "resource-only TS proof",
    create: (ctx) => ({
      visitFile: () => {
        throw new Error("resource-only TS proof reached source dispatch");
      },
      evaluate: () => {
        sourceCounts.push(ctx.files.length);
        const tree = ctx.resources.authoredTree("client-source");
        if (tree.status !== "ready") {
          throw new Error(tree.reason);
        }
        const bad = tree.value.find((entry) => entry.kind === "file" && entry.path.endsWith("/bad.mts"));
        if (bad !== undefined) {
          ctx.report.file(bad.path);
        }
      },
    }),
    mustFlag: [
      {
        mode: "resource",
        files: { "packages/client/src/bad.mts": "export const rawResource = true;\n" },
        why: "a TypeScript extension does not opt a resource-only policy into source dispatch",
      },
    ],
    mustPass: [
      {
        mode: "resource",
        files: { "packages/client/src/good.cjs": "export const rawResource = false;\n" },
        why: "the clean raw TypeScript resource",
      },
    ],
  });

  expect(verifyPolicyProofs([resources])).toEqual([]);
  expect(sourceCounts).toEqual([0, 0]);
});

test("hybrid TS proofs share one identity across source and resource manifests", () => {
  const populations: { readonly sources: readonly string[]; readonly resources: readonly string[] }[] = [];
  const hybrid = defineGate({
    id: "hybrid-ts-proof",
    family: "hybrid-ts-proof",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "resource",
    execution: "selected-files",
    facts: [],
    resources: [{ kind: "authored-tree", id: "client-source" }],
    message: "hybrid TS proof",
    create: (ctx) => ({
      evaluate: () => {
        const tree = ctx.resources.authoredTree("client-source");
        if (tree.status !== "ready") {
          throw new Error(tree.reason);
        }
        populations.push({ sources: ctx.files.map(ctx.relativePath), resources: ctx.resourcePaths });
        const source = ctx.files[0];
        if (source === undefined) {
          throw new Error("hybrid proof requires one source candidate");
        }
        if (source.getFullText().includes("planted")) {
          ctx.report.file(ctx.relativePath(source));
        }
      },
    }),
    mustFlag: [
      {
        mode: "resource",
        files: { "packages/client/src/hybrid.ts": "export const planted = true;\n" },
        why: "one authored TS path is legitimately both syntax and raw resource",
      },
    ],
    mustPass: [
      {
        mode: "resource",
        files: { "packages/client/src/hybrid.tsx": "export const clean = true;\n" },
        why: "the same hybrid identity with legal content",
      },
    ],
  });

  expect(verifyPolicyProofs([hybrid])).toEqual([]);
  expect(populations).toEqual([
    { sources: ["packages/client/src/hybrid.ts"], resources: ["packages/client/src/hybrid.ts"] },
    { sources: ["packages/client/src/hybrid.tsx"], resources: ["packages/client/src/hybrid.tsx"] },
  ]);
});

test("reused projects isolate every example and repeated invocations are deterministic", () => {
  const populations: string[][] = [];
  const absolutePaths: string[] = [];
  const isolating = sourcePolicy("isolation-proof", {
    create: (ctx) => ({
      evaluate: () => {
        populations.push(ctx.files.map(ctx.relativePath));
        absolutePaths.push(ctx.files[0]?.getFilePath() ?? "");
        if (ctx.files.some((file) => file.getFullText().includes("planted"))) {
          ctx.report.file(ctx.relativePath(ctx.files[0] as NonNullable<(typeof ctx.files)[number]>));
        }
      },
    }),
    mustFlag: [SOURCE_FLAG, { ...SOURCE_FLAG, files: { "packages/client/src/second.ts": "export const planted = 2;\n" }, why: "second bite" }],
    mustPass: [{ ...SOURCE_PASS, files: { "packages/client/src/final.ts": "export const clean = true;\n" } }],
  });
  const failing = sourcePolicy("repeatable-failure", { mustFlag: [{ ...SOURCE_FLAG, expect: { count: 2 } }] });

  expect(verifyPolicyProofs([isolating])).toEqual([]);
  expect(populations).toEqual([["packages/client/src/proof.ts"], ["packages/client/src/second.ts"], ["packages/client/src/final.ts"]]);
  expect(verifyPolicyProofs([failing])).toEqual(verifyPolicyProofs([failing]));
  expect(verifyPolicyProofs([isolating])).toEqual([]);
  expect(absolutePaths.slice(0, 3)).toEqual(absolutePaths.slice(3));
});

test("thrown path details are stable and retain only repo-relative proof identities", () => {
  const sourceThrow = sourcePolicy("source-path-throw", {
    create: (ctx) => ({
      evaluate: () => {
        throw new Error(`failed at ${ctx.files[0]?.getFilePath() ?? "missing"}`);
      },
    }),
  });
  const resourceThrow = defineGate({
    id: "resource-path-throw",
    family: "resource-path-throw",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "resource",
    execution: "selected-files",
    facts: [],
    resources: [{ kind: "authored-tree", id: "client-source" }],
    message: "resource path throw",
    create: (ctx) => ({
      evaluate: () => {
        throw new Error(`failed at ${ctx.files[0]?.getFilePath() ?? "missing"}`);
      },
    }),
    mustFlag: [
      {
        mode: "resource",
        files: { "packages/client/src/provider.ts": "export const provider = true;\n", "resources/config.json": "{}\n" },
        why: "resource path failure",
      },
    ],
    mustPass: [
      {
        mode: "resource",
        files: { "packages/client/src/provider.ts": "export const provider = false;\n", "resources/config.json": "{}\n" },
        why: "resource path failure",
      },
    ],
  });

  const first = verifyPolicyProofs([sourceThrow, resourceThrow]);
  const second = verifyPolicyProofs([sourceThrow, resourceThrow]);

  expect(second).toEqual(first);
  expect(first.map(({ detail }) => detail).join("\n")).toContain("packages/client/src/");
  expect(first.map(({ detail }) => detail).join("\n")).not.toMatch(/\/orb-policy-conformance-|\/tmp\/orb-policy-conformance-/u);
});

test("failure order is policy, arm, then example index", () => {
  const alwaysWrong = (id: string): GatePolicy =>
    sourcePolicy(id, {
      create: (ctx) => ({
        visitFile: (sourceFile) => {
          if (sourceFile.getFullText().includes("REPORT")) {
            ctx.report.file(ctx.relativePath(sourceFile));
          }
        },
      }),
      mustFlag: [
        { ...SOURCE_FLAG, files: { "packages/client/src/a.ts": "const CLEAN = 1;\n" }, why: "flag zero" },
        { ...SOURCE_FLAG, files: { "packages/client/src/b.ts": "const CLEAN = 2;\n" }, why: "flag one" },
      ],
      mustPass: [{ ...SOURCE_PASS, files: { "packages/client/src/c.ts": "const REPORT = 3;\n" }, why: "pass zero" }],
    });

  expect(
    verifyPolicyProofs([alwaysWrong("policy-b"), alwaysWrong("policy-a")]).map(({ policyId, arm, exampleIndex }) => [policyId, arm, exampleIndex]),
  ).toEqual([
    ["policy-a", "mustFlag", 0],
    ["policy-a", "mustFlag", 1],
    ["policy-a", "mustPass", 0],
    ["policy-b", "mustFlag", 0],
    ["policy-b", "mustFlag", 1],
    ["policy-b", "mustPass", 0],
  ]);
});
