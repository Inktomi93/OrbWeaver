import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { judgeTypeHomeDeclaration } from "@orb/tooling/floor/code-facts/type-home-declaration";
import { Project } from "ts-morph";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as domainInterfaces } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as packageInterfaces } from "../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as inlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as wireInterfaces } from "../../../../tooling/src/verify/gates/no-inline-wire-interface.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("declaration judgment preserves local origins and separates direct syntax from semantic exports", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const path = "packages/server/src/domain/chat/verbs/read.ts";
  const file = project.createSourceFile(
    `/repo/${path}`,
    `
export type Direct = string;
type Local = number;
export type { Local as First, Local as Second };
export default interface Default { readonly n: number; }
interface Hidden {}
`,
  );
  const judgments = [
    ...file.getTypeAliases().map((node) => judgeTypeHomeDeclaration(node, { path, claim: "alias-or-schema" })),
    ...file.getInterfaces().map((node) => judgeTypeHomeDeclaration(node, { path, claim: "interface" })),
  ];
  expect(judgments.map((judgment) => judgment.kind)).toEqual(["subject", "subject", "subject", "not-subject"]);
  expect(
    judgments.slice(0, 3).map((judgment) => (judgment.kind === "subject" ? judgment.shapes.map(({ name, plane }) => [name.getText(), plane]) : [])),
  ).toEqual([[["Direct", "direct-export"]], [["Local", "local-export"]], [["Default", "direct-export"]]]);
});

test("ownership evidence does not turn package categories or false paths into permission", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, expected] of [
    ["packages/inference/src/contract/result.ts", "owned"],
    ["packages/inference/src/backends/result.ts", "misplaced"],
    ["packages/default-content/src/contract/result.ts", "owned"],
    ["packages/plugin-toolchain/src/contract/result.ts", "owned"],
    ["packages/kit/src/result.ts", "unqualified"],
    ["packages/contracts/src/result.ts", "unqualified"],
    ["packages/db/src/result.ts", "unqualified"],
    ["packages/server/src/domain/chat/result.ts", "unqualified"],
    ["packages/ui/src/primitives/result.tsx", "unqualified"],
    ["packages/client/src/components/result.tsx", "unqualified"],
    ["packages/plugin-sdk/shared.d.ts", "unqualified"],
    ["packages/showcase-plugins/src/result.ts", "unqualified"],
    ["tooling/src/ast/result.ts", "unqualified"],
    ["tests/server/result.test.ts", "unqualified"],
  ] as const) {
    const file = project.createSourceFile(`/repo/${path}`, "export interface ResultProps { readonly value: string; }");
    const judgment = judgeTypeHomeDeclaration(file.getInterfaceOrThrow("ResultProps"), { path, claim: "interface" });
    expect(judgment.kind).toBe("subject");
    if (judgment.kind !== "subject") {
      throw new Error("missing subject");
    }
    expect(judgment.ownership.kind, path).toBe(expected);
  }
  const file = project.createSourceFile("/repo/packages/client/src/copy.tsx", "export interface CopyProps { readonly id: string; }");
  const node = file.getInterfaceOrThrow("CopyProps");
  expect(judgeTypeHomeDeclaration(node, { path: "packages/inference/src/contract/copy.tsx", claim: "interface" })).toMatchObject({ kind: "refused" });
});

const POLICIES = [inlineTypes, domainInterfaces, packageInterfaces, wireInterfaces];

test("the four adapters preserve exact accusations, authored positions and ordinary waiver consumption", () => {
  const root = "/type-home-declarations";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of [
    [
      "packages/server/src/domain/chat/verbs/read.ts",
      `export type Direct = string;
type Local = number;
export { Local as A, Local as B };
export default interface Default { readonly value: string; }
// @orb-waive no-inline-domain-interface(Waived): this control retains its exact authored position.
export interface Waived { readonly value: string; }
`,
    ],
    ["packages/server/src/infra/read.ts", "export interface Infra { readonly value: string; }"],
    ["packages/inference/src/backends/read.ts", "export type Alias = string; export interface Backend { readonly value: string; }"],
    [
      "packages/client/src/features/chat/read.tsx",
      `export interface HandView { readonly value: string; }
export interface HookResult { readonly run: () => void; }
export interface NamedProps { readonly value: string; }
export type ComponentApi = { readonly children: string };
`,
    ],
    ["packages/client/src/data/read.ts", "export interface DataRow { readonly value: string; }"],
    ["packages/server/src/domain/chat/contract/owner.ts", "export interface Owner { readonly value: string; }"],
    ["packages/server/src/domain/chat/barrel.ts", 'export { Owner as Alias } from "./contract/owner.ts";'],
    ["packages/plugin-toolchain/src/read.ts", "export type Pilot = string; export interface PilotInterface {}"],
  ] as const) {
    project.createSourceFile(`${root}/${path}`, source);
  }
  const result = runPolicyPass({ root, project, knownPolicies: POLICIES, policies: POLICIES, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(
    result.authority.effectiveFindings.map(({ policyId, token }) => [policyId, token]).toSorted((left, right) => left.join(":").localeCompare(right.join(":"))),
  ).toEqual(
    [
      ["no-inline-types", "Direct"],
      ["no-inline-types", "Local"],
      ["no-inline-types", "Alias"],
      ["no-inline-types", "ComponentApi"],
      ["no-inline-domain-interface", "Default"],
      ["no-inline-package-interface", "Infra"],
      ["no-inline-package-interface", "Backend"],
      ["no-inline-wire-interface", "HandView"],
      ["no-inline-wire-interface", "DataRow"],
    ].toSorted((left, right) => left.join(":").localeCompare(right.join(":"))),
  );
  expect(result.authority.waivedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("schema-origin judgment retains the importing native world's meaning and rejects foreign or unresolved factories", ({ scratch, repoRoot }) => {
  const write = (relativePath: string, text: string): void => {
    const target = join(scratch, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  write(".gitignore", "node_modules\n");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const path = "packages/contracts/src/factory.ts";
  write(
    path,
    `import { object as shape } from "zod";
export const Direct = shape({});
const Published = shape({});
export { Published as A, Published as B };
`,
  );
  write("packages/client/src/local.ts", "export const object = (value: object): object => value;");
  for (const name of ["server", "client"] as const) {
    write(
      `packages/${name}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          types: [],
          paths: { zod: [name === "server" ? "../../node_modules/zod/index.d.ts" : "./src/local.ts"] },
        },
        files: ["../contracts/src/factory.ts"],
      }),
    );
  }
  execFixtureGit(scratch, ["init", "-q"]);
  const workspace = createSemanticWorkspace({ root: scratch });
  expect(
    workspace.sourceViews(path).map(({ program, sourceFile }) => ({
      config: program.descriptor.config,
      shapes: sourceFile.getVariableStatements().flatMap((node) => {
        const judgment = judgeTypeHomeDeclaration(node, { path, claim: "alias-or-schema" });
        return judgment.kind === "subject" ? judgment.shapes.map(({ name, plane }) => [name.getText(), plane]) : [];
      }),
    })),
  ).toEqual([
    { config: "packages/client/tsconfig.json", shapes: [] },
    {
      config: "packages/server/tsconfig.json",
      shapes: [
        ["Direct", "schema-origin"],
        ["Published", "schema-origin"],
      ],
    },
  ]);
  const unknown = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    "/repo/packages/server/src/read.ts",
    'import { object } from "missing"; export const Value = object({});',
  );
  expect(
    judgeTypeHomeDeclaration(unknown.getVariableDeclarationOrThrow("Value").getVariableStatementOrThrow(), {
      path: "packages/server/src/read.ts",
      claim: "alias-or-schema",
    }),
  ).toEqual({ kind: "not-subject" });
});

test(
  "all existing placement policy proof rows retain their findings, near misses and authority",
  () => {
    expect(verifyPolicyProofs(POLICIES)).toEqual([]);
  },
  scaledBudget(60_000),
);

test("an accidentally admitted sanctioned contract withholds the owner instead of granting a silent pass", () => {
  const root = "/type-home-accidental-admission";
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${root}/packages/inference/src/contract/result.ts`, "export type Result = string;");
  const accidental = defineGate({ ...inlineTypes, population: "@inference" });
  const result = runPolicyPass({ root, project, knownPolicies: [accidental], policies: [accidental], reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors.map(({ message }) => message)).toEqual([expect.stringContaining("admitted a sanctioned package contract home")]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([inlineTypes.id]);
});
