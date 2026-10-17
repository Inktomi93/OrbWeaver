// Matched controls for shape-reader consumers: discovery modes, provenance, and existing gate judgments.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { resolveModuleMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import { exportedShapeDeclarations, handWrittenShapeDeclarations, inlineShapeNames } from "@orb/tooling/floor/code-facts/shape-declaration";
import { isFactoryCallFromPackage, ZOD_PACKAGE } from "@orb/tooling/floor/code-facts/zod-origin";
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, SyntaxKind } from "ts-morph";
import { assignabilityChecker, respellHitsFor, shapesUnder } from "../../../../tooling/src/ast/lib/respell-shapes.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as derives } from "../../../../tooling/src/verify/gates/contract-derives-not-respells.ts";
import { gate as copies } from "../../../../tooling/src/verify/gates/contract-structural-copy.ts";
import { gate as domainInterfaces } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as packageInterfaces } from "../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as inlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as wireInterfaces } from "../../../../tooling/src/verify/gates/no-inline-wire-interface.ts";
import { gate as fabrication } from "../../../../tooling/src/verify/gates/no-test-fabrication.ts";
import { gate as handShapes } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { gate as zodIssues } from "../../../../tooling/src/verify/gates/zod-error-issues-home.ts";
import { candidateFields, contractFields } from "../../../../tooling/src/verify/lib/contract-structural-copy.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("factory identity recognizes installed named aliases, stable bindings, destructuring and transparent wrappers", ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { module: ModuleKind.ESNext, moduleResolution: ModuleResolutionKind.Bundler, target: ScriptTarget.ESNext, strict: true },
  });
  const source = project.createSourceFile(
    join(scratch, "factory.ts"),
    `import { z, object as shape } from "zod";
import * as namespace from "zod";
const stable = shape;
const { object: destructured } = z;
export const Direct = z.object({});
export const Named = shape({});
export const Stable = stable({});
export const Destructured = destructured({});
export const Namespace = namespace.z["object"]({});
export const Parenthesized = (shape({}));
export const Asserted = shape({}) as object;
export const Satisfied = shape({}) satisfies object;
export const NonNull = shape({})!;
export const WrappedCallee = ((shape))({});
export const AssertedCallee = (z.object as typeof z.object)({});
const Published = shape({});
const Private = shape({});
export { Published as SchemaA, Published as SchemaB };
`,
  );
  const imported = source.getImportDeclarations()[0]?.getModuleSpecifierSourceFile();
  expect(imported?.getFilePath()).toContain("node_modules/zod/");
  const named = source.getVariableDeclarationOrThrow("Named").getInitializerOrThrow();
  const call = named.asKindOrThrow(SyntaxKind.CallExpression);
  const origin = resolveModuleMemberOrigin(call.getExpression());
  expect(origin).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project" } } });
  if (origin.kind === "unresolved" || origin.value.canonical.kind !== "project") {
    throw new Error("the installed factory declaration did not resolve");
  }
  expect(origin.value.canonical.declaration.getSourceFile().getFilePath()).toContain("/zod/");
  expect(isFactoryCallFromPackage(named, "object", ZOD_PACKAGE)).toBe(true);
  expect(
    source
      .getVariableStatements()
      .flatMap(inlineShapeNames)
      .map((name) => name.getText()),
  ).toEqual([
    "Direct",
    "Named",
    "Stable",
    "Destructured",
    "Namespace",
    "Parenthesized",
    "Asserted",
    "Satisfied",
    "NonNull",
    "WrappedCallee",
    "AssertedCallee",
    "Published",
  ]);
});

test("factory identity rejects installed nonfactories, local shadows, written bindings, cycles and unresolved package exports", ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { module: ModuleKind.ESNext, moduleResolution: ModuleResolutionKind.Bundler, target: ScriptTarget.ESNext, strict: true },
  });
  project.createSourceFile(join(scratch, "local.ts"), "export const object = (value: object): object => value;\n");
  const cases = [
    ["nonfactory", 'import { string as shape } from "zod"; export const Value = shape();'],
    ["foreign", 'import { object } from "./local.ts"; export const Value = object({});'],
    ["shadow", 'import { z } from "zod"; { const z = { object: (value: object) => value }; const Value = z.object({}); }'],
    ["mutable", 'import { object } from "zod"; let shape = object; export const Value = shape({});'],
    ["written", 'import { object } from "zod"; const shape = object; shape = () => ({}); export const Value = shape({});'],
    ["member-write", 'import { z } from "zod"; z.object = () => ({}); export const Value = z.object({});'],
    ["cycle", "const first = second; const second = first; export const Value = first({});"],
    ["missing-member", 'import { nonexistent as shape } from "zod"; export const Value = shape({});'],
    ["unresolved-member", 'import { z } from "zod"; const shape = z.nonexistent.object; export const Value = shape({});'],
    ["unresolved-destructure", 'import { z } from "zod"; const { object: shape } = z.nonexistent; export const Value = shape({});'],
    ["asserted-missing-member", 'import { z } from "zod"; export const Value = (z.nonexistent.object as typeof z.object)({});'],
    ["asserted-missing-receiver", 'import { z } from "zod"; export const Value = (z.nonexistent as typeof z).object({});'],
    ["missing-package", 'import { object } from "missing-zod-package"; export const Value = object({});'],
    ["missing-relative", 'import { object } from "./missing.ts"; export const Value = object({});'],
    ["composed", 'import { z } from "zod"; export const Value = z.object({}).strict();'],
    ["extended", 'import { z } from "zod"; export const Value = z.object({}).extend({});'],
  ] as const;
  for (const [name, text] of cases) {
    const source = project.createSourceFile(join(scratch, `${name}.ts`), text);
    const declaration = source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((node) => node.getName() === "Value");
    if (declaration === undefined) {
      throw new Error(`the ${name} control contains no Value declaration`);
    }
    expect(isFactoryCallFromPackage(declaration.getInitializerOrThrow(), "object", ZOD_PACKAGE), name).toBe(false);
    expect(source.getVariableStatements().flatMap(inlineShapeNames), name).toEqual([]);
  }
  const unresolved = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    "/unresolved/use.ts",
    'import { object } from "zod"; export const Value = object({});',
  );
  expect(unresolved.getImportDeclarations()[0]?.getModuleSpecifierSourceFile()).toBeUndefined();
  expect(isFactoryCallFromPackage(unresolved.getVariableDeclarationOrThrow("Value").getInitializerOrThrow(), "object", ZOD_PACKAGE)).toBe(false);
});

test("export visibility judges each declaring local origin once across public aliases and excludes foreign and missing origins", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/owner.ts", "export interface Owner { readonly own: string; }\n");
  const source = project.createSourceFile(
    "/repo/use.ts",
    `import type { Owner } from "./owner.ts";
type Alias = { readonly n: number };
interface Local { readonly value: string; }
type Hidden = string;
export type { Alias as First, Alias as Second, Owner as Imported, Missing };
export { Local as PublicLocal };
export type { Owner as Republished } from "./owner.ts";
`,
  );
  expect(inlineShapeNames(source.getTypeAliasOrThrow("Alias")).map((name) => name.getText())).toEqual(["Alias"]);
  expect(inlineShapeNames(source.getInterfaceOrThrow("Local")).map((name) => name.getText())).toEqual(["Local"]);
  expect(inlineShapeNames(source.getTypeAliasOrThrow("Hidden"))).toEqual([]);
  expect(exportedShapeDeclarations(source).map(([name, declaration]) => [name, declaration.getName()])).toEqual([
    ["First", "Alias"],
    ["PublicLocal", "Local"],
  ]);
  expect(handWrittenShapeDeclarations(source).map((declaration) => declaration.getName())).toEqual(["Local", "Alias"]);
});

test("factory identity keeps native program resolution separate for the same physical source", ({ scratch, repoRoot }) => {
  const write = (path: string, text: string): void => {
    const target = join(scratch, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  write(".gitignore", "node_modules\n");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  write("packages/contracts/src/factory.ts", 'import { object as shape } from "zod"; export const Value = shape({});\n');
  write("packages/client/src/local.ts", "export const object = (value: object): object => value;\n");
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
  const views = workspace.sourceViews("packages/contracts/src/factory.ts");
  expect(views).toHaveLength(2);
  const answers = views.map(({ program, sourceFile }) => ({
    config: program.descriptor.config,
    factory: isFactoryCallFromPackage(sourceFile.getVariableDeclarationOrThrow("Value").getInitializerOrThrow(), "object", ZOD_PACKAGE),
    names: sourceFile
      .getVariableStatements()
      .flatMap(inlineShapeNames)
      .map((node) => node.getText()),
  }));
  expect(answers).toEqual([
    { config: "packages/client/tsconfig.json", factory: false, names: [] },
    { config: "packages/server/tsconfig.json", factory: true, names: ["Value"] },
  ]);
});

test("respell and copy retain distinct intersection and class field populations", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "/repo/packages/contracts/src/chat/shapes.ts",
    `
interface Parent { inherited: string; }
export class Row implements Parent {
  inherited = "base";
  a = "a";
  b = 1;
  static ignored = true;
  method(): void {}
  constructor(public c: boolean) {}
}
export type Joined = { a: string; b: number } & { c: boolean; d: string };
export type Own = { a: string; b: number; c: boolean; d: string; derived: Parent["inherited"]; run: () => void; method(): void };
`,
  );
  expect(shapesUnder(project, "/packages/contracts/src/chat/").map(({ name, fields }) => [name, fields.map((field) => field.name)])).toEqual([
    ["Row", ["inherited", "a", "b", "c"]],
    ["Own", ["a", "b", "c", "d", "derived", "run", "method"]],
  ]);
  expect([...(contractFields(file.getTypeAliasOrThrow("Joined")) ?? [])]).toEqual(["a", "b", "c", "d"]);
  const literal = file.getTypeAliasOrThrow("Own").getTypeNodeOrThrow().asKindOrThrow(SyntaxKind.TypeLiteral);
  expect([...(candidateFields(literal) ?? [])]).toEqual(["a", "b", "c", "d"]);
});

test("respell distinguishes alias provenance from a same-named or nested divergent type", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    "/repo/packages/contracts/src/chat/shapes.ts",
    `
export interface Owner { a: string; b: number; meta: { tags: string[] }; }
export interface Coincidental { a: string; b: number; meta: { tags: string[] }; }
`,
  );
  project.createSourceFile(
    "/repo/packages/server/src/domain/chat/contract/shapes.ts",
    `
import type { Owner } from "../../../../../contracts/src/chat/shapes.ts";
export type Derived = Owner;
export interface Copy { a: string; b: number; meta: { tags: string[] }; }
export interface Divergent { a: string; b: number; meta: { tags: number[] }; }
`,
  );
  expect(respellHitsFor(project, assignabilityChecker(project), "chat").map(({ text }) => text)).toEqual([
    "Derived  ≡  @orb/contracts/chat::Coincidental",
    "Copy  ≡  @orb/contracts/chat::Owner",
    "Copy  ≡  @orb/contracts/chat::Coincidental",
  ]);
});

test(
  "migrated shape policy consumers retain their catch, near-miss and refusal rows",
  () => {
    expect(verifyPolicyProofs([copies, derives, handShapes, fabrication, inlineTypes, domainInterfaces, packageInterfaces, wireInterfaces, zodIssues])).toEqual(
      [],
    );
  },
  scaledBudget(120_000),
);
