import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { captureComponentTypeHomeView, componentTypeHome } from "@orb/tooling/floor/code-facts/component-type-home";
import type { ComponentTypeHomeResult, ComponentTypeHomeView } from "@orb/tooling/floor/code-facts/component-type-home-contract";
import { readNativeGenericArgumentContribution } from "@orb/tooling/floor/code-facts/shape-derivation";
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { canonicalCompilerPath, createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import type { SemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace-contract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

interface ComponentHomeFixture {
  readonly path: string;
  readonly workspace: SemanticWorkspace;
  readonly sourceFile: SourceFile;
  readonly view: ComponentTypeHomeView;
  readonly read: (name: string) => ComponentTypeHomeResult;
}

function fixture(root: string, repoRoot: string): ComponentHomeFixture {
  const write = (relativePath: string, text: string): void => {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  write(".gitignore", "node_modules\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const path = "packages/client/src/panel.tsx";
  write("packages/contracts/src/wire.ts", "export interface Wire { id: string; label: string; enabled: boolean; order: number; }");
  write(
    path,
    `import type { ReactNode } from "react";
import type { Wire } from "../../contracts/src/wire.ts";
export type Dimension = "small" | "large";
export type Renderer = (value: Dimension) => ReactNode;
export interface Arbitrary { size: Dimension; render: Renderer; }
export function Surface(props: Arbitrary) { return <div>{props.render(props.size)}</div>; }
export interface UnusedProps { text: string; }
export interface ImpostorProps { value: string; }
export function StringFactory(props: ImpostorProps) { return props.value; }
export interface GenericApi<T> { value: T; }
export function Generic<T>(props: GenericApi<T>) { return <div />; }
export interface AliasApi { caption: string; }
function Implementation(props: AliasApi) { return <div>{props.caption}</div>; }
export const Published = Implementation;
export interface DefaultApi { caption: string; }
export default function Default(props: DefaultApi) { return <div>{props.caption}</div>; }
export interface CopyProps { id: string; label: string; enabled: boolean; order: number; }
export function Copy(props: CopyProps) { return <div>{props.label}</div>; }
export interface Derived extends Wire {}
export function Derive(props: Derived) { return <div>{props.label}</div>; }
export interface MutatedApi { caption: string; }
export function Mutated(props: MutatedApi) { return <div>{props.caption}</div>; }
Mutated = (props: MutatedApi) => <div />;
export type ErasedVocabulary = { ignored: string };
type Ignore<T> = string;
export interface OpaqueCarrier { caption: Ignore<ErasedVocabulary>; }
export function Opaque(props: OpaqueCarrier) { return <div>{props.caption}</div>; }
export type ShadowVocabulary = { ignored: string };
type Extract<T, U> = string;
export interface ShadowCarrier { caption: Extract<ShadowVocabulary, never>; }
export function Shadow(props: ShadowCarrier) { return <div>{props.caption}</div>; }
export type NativeNeverVocabulary = { ignored: string };
type NativeEmpty = Exclude<never, NativeNeverVocabulary>;
export interface NeverCarrier { caption: NativeEmpty; }
export function Empty(props: NeverCarrier) { return <div />; }
export interface WrappedApi { label: string; }
declare function wrap<T>(value: T): T;
export const Wrapped = wrap((props: WrappedApi) => <div>{props.label}</div>);
`,
  );
  write("packages/client/src/barrel.ts", 'export { Arbitrary, Surface } from "./panel.tsx";');
  write(
    "packages/client/src/mixed.tsx",
    `
export type Unrelated = { ignored: string };
export interface Api { caption: Exclude<"a" | "b", Unrelated | "a">; }
export function Surface(props: Api) { return <div>{props.caption}</div>; }
export type Contributing = "a";
export interface ContributingApi { caption: Exclude<"a" | "b", Contributing | Unrelated>; }
export function ContributingSurface(props: ContributingApi) { return <div>{props.caption}</div>; }
`,
  );
  write(
    "packages/client/src/generic.ts",
    `
type Input = "a" | "b";
type Cut = "a";
export type Live = Exclude<Input, Cut>;
export type Selected = Extract<Input, Cut>;
export type Present = NonNullable<Input | undefined>;
export type Empty = Exclude<never, Cut>;
export type Any = Exclude<any, Cut>;
export type NoWitness = Exclude<Input, "z">;
type Ignore<T> = string;
export type Custom = Ignore<Cut>;
`,
  );
  for (const owner of ["client", "server"] as const) {
    write(
      `packages/${owner}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          jsx: "react-jsx",
          types: [],
          lib: owner === "client" ? ["ES2022", "DOM", "DOM.Iterable"] : ["ES2022"],
          strict: true,
        },
        files: ["../client/src/panel.tsx", "../client/src/barrel.ts", "../client/src/generic.ts", "../client/src/mixed.tsx"],
      }),
    );
  }
  execFixtureGit(root, ["init", "-q"]);
  const workspace = createSemanticWorkspace({ root });
  const owner = workspace.program("packages/client/tsconfig.json");
  const sourceFile = owner?.sourceFile(path);
  if (owner === undefined || sourceFile === undefined) {
    throw new Error("missing browser fixture");
  }
  const view = captureComponentTypeHomeView({ program: owner, sourceFile, canonicalPath: canonicalCompilerPath(root, path) });
  const lower = sourceFile.getImportDeclarations()[1]?.getModuleSpecifierSourceFile()?.getInterfaceOrThrow("Wire");
  if (lower === undefined) {
    throw new Error("wire fixture did not resolve");
  }
  const read = (name: string): ComponentTypeHomeResult =>
    componentTypeHome({
      declaration: sourceFile.getInterface(name) ?? sourceFile.getTypeAliasOrThrow(name),
      path,
      view,
      lowerDeclarations: [lower],
    });
  return { path, workspace, sourceFile, view, read };
}

test("native DOM origins establish arbitrary names, supporting variants, render callbacks, generic and aliased/default APIs", ({ scratch, repoRoot }) => {
  const { read } = fixture(scratch, repoRoot);
  for (const name of ["Arbitrary", "Dimension", "Renderer", "GenericApi", "AliasApi", "DefaultApi"]) {
    const result = read(name);
    expect(result.kind, name).toBe("owned");
    if (result.kind !== "owned") {
      throw new Error("missing render origin");
    }
    expect(result.component.parameter.getSourceFile(), name).toBe(result.component.callable.getSourceFile());
    expect(
      result.component.supportingDeclarations.map((declaration) => declaration.getName()),
      name,
    ).toContain(name);
    expect(result.lowerData.kind, name).toBe("unqualified");
  }
});

test("names, unused declarations, wrappers and known lower-data overlaps never manufacture ownership", ({ scratch, repoRoot }) => {
  const { read } = fixture(scratch, repoRoot);
  for (const name of ["UnusedProps", "ImpostorProps", "WrappedApi", "MutatedApi"]) {
    expect(read(name), name).toMatchObject({ kind: "unqualified", component: null });
  }
  for (const name of ["ErasedVocabulary", "ShadowVocabulary", "NativeNeverVocabulary"]) {
    expect(read(name), name).toMatchObject({ kind: "unqualified", reason: expect.stringContaining("opaque generic") });
  }
  expect(read("CopyProps")).toMatchObject({ kind: "unqualified", lowerData: { kind: "unqualified", comparisons: [{ shared: 4, agreeing: 4, exact: true }] } });
  expect(read("Derived")).toMatchObject({ kind: "owned", lowerData: { kind: "derived" } });
});

test("Node React fallback, foreign/barrel views, and forgotten source identities refuse", ({ scratch, repoRoot }) => {
  const { path, sourceFile, workspace, view } = fixture(scratch, repoRoot);
  const declaration = sourceFile.getInterfaceOrThrow("Arbitrary");
  const server = workspace.program("packages/server/tsconfig.json");
  const fallback = server?.sourceFile(path);
  if (server === undefined || fallback === undefined) {
    throw new Error("missing Node control");
  }
  expect(
    componentTypeHome({
      declaration: fallback.getInterfaceOrThrow("Arbitrary"),
      path,
      view: captureComponentTypeHomeView({ program: server, sourceFile: fallback, canonicalPath: view.canonicalPath }),
      lowerDeclarations: [],
    }),
  ).toMatchObject({ kind: "refused", reason: expect.stringContaining("native DOM") });
  expect(componentTypeHome({ declaration: fallback.getInterfaceOrThrow("Arbitrary"), path, view, lowerDeclarations: [] })).toMatchObject({ kind: "refused" });
  const barrelPath = "packages/client/src/barrel.ts";
  const barrel = view.program.sourceFile(barrelPath);
  if (barrel === undefined) {
    throw new Error("missing barrel");
  }
  expect(
    componentTypeHome({
      declaration,
      path: barrelPath,
      view: captureComponentTypeHomeView({ program: view.program, sourceFile: barrel, canonicalPath: canonicalCompilerPath(scratch, barrelPath) }),
      lowerDeclarations: [],
    }),
  ).toMatchObject({ kind: "refused" });
  declaration.replaceWithText("export interface Changed { value: string }");
  expect(componentTypeHome({ declaration, path, view, lowerDeclarations: [] })).toMatchObject({
    kind: "refused",
    reason: expect.stringContaining("stale"),
  });
});

test(
  "the real Button supporting variant and sealed ContentDialog API have native browser render origins",
  ({ repoRoot }) => {
    const configs = ["packages/ui/tsconfig.json", "packages/client/tsconfig.json"];
    const workspace = createSemanticWorkspace({ root: repoRoot, programs: readCompilerPrograms(repoRoot).filter(({ config }) => configs.includes(config)) });
    for (const [config, path, name] of [
      [configs[0], "packages/ui/src/primitives/button/button.tsx", "IconOnlyButtonSize"],
      [configs[1], "packages/client/src/components/content-dialog.tsx", "ContentDialogProps"],
    ] as const) {
      if (config === undefined) {
        throw new Error("missing compiler config");
      }
      const owner = workspace.program(config);
      const sourceFile = owner?.sourceFile(path);
      if (owner === undefined || sourceFile === undefined) {
        throw new Error(`missing native source ${path}`);
      }
      const declaration = sourceFile.getInterface(name) ?? sourceFile.getTypeAliasOrThrow(name);
      const result = componentTypeHome({
        declaration,
        path,
        view: captureComponentTypeHomeView({ program: owner, sourceFile, canonicalPath: canonicalCompilerPath(repoRoot, path) }),
        lowerDeclarations: [],
      });
      expect(result.kind, name).toBe("owned");
      if (result.kind !== "owned") {
        throw new Error(`unproven ${name}`);
      }
      expect(
        result.component.supportingDeclarations.map((node) => node.getName()),
        name,
      ).toContain(name);
      expect(result.lowerData.kind).toBe("unqualified");
    }
  },
  scaledBudget(60_000),
);

test("canonical native generic contribution distinguishes actual effects, never, any, opaque and foreign epochs", ({ scratch, repoRoot }) => {
  const { view } = fixture(scratch, repoRoot);
  const source = view.program.sourceFile("packages/client/src/generic.ts");
  if (source === undefined) {
    throw new Error("missing generic source");
  }
  const program = source.getProject().getProgram().compilerObject;
  const read = (name: string, index: number): ReturnType<typeof readNativeGenericArgumentContribution> => {
    const reference = source.getTypeAliasOrThrow(name).getTypeNodeOrThrow();
    if (!Node.isTypeReference(reference)) {
      throw new Error("missing reference carrier");
    }
    const argument = reference.getTypeArguments()[index];
    if (argument === undefined) {
      throw new Error("missing argument carrier");
    }
    return readNativeGenericArgumentContribution({ reference, argument, program, source: source.compilerNode });
  };
  for (const [name, index] of [
    ["Live", 1],
    ["Selected", 1],
    ["Present", 0],
  ] as const) {
    const fact = read(name, index);
    expect(fact, name).toMatchObject({ kind: "resolved", value: { contributes: true } });
    if (fact.kind !== "resolved") {
      throw new Error("missing native effect");
    }
    expect(fact.value.witnesses.length, name).toBeGreaterThan(0);
    expect(program.isSourceFileDefaultLibrary(fact.value.utility.getSourceFile().compilerNode), name).toBe(true);
  }
  expect(read("Empty", 1)).toMatchObject({ kind: "resolved", value: { contributes: false, witnesses: [] } });
  for (const [name, index] of [
    ["Any", 1],
    ["NoWitness", 1],
    ["Custom", 0],
  ] as const) {
    expect(read(name, index), name).toMatchObject({ kind: "unresolved" });
  }
  const reference = source.getTypeAliasOrThrow("Live").getTypeNodeOrThrow();
  if (!Node.isTypeReference(reference)) {
    throw new Error("missing reference");
  }
  const argument = reference.getTypeArguments()[1];
  if (argument === undefined) {
    throw new Error("missing argument");
  }
  const other = view.program.project().getSourceFileOrThrow(view.canonicalPath);
  expect(readNativeGenericArgumentContribution({ reference, argument, program, source: other.compilerNode })).toMatchObject({
    kind: "unresolved",
    detail: expect.stringContaining("foreign world"),
  });
  reference.replaceWithText("Exclude<Input, never>");
  expect(readNativeGenericArgumentContribution({ reference, argument, program, source: source.compilerNode })).toMatchObject({ kind: "unresolved" });
});

test("a whole mixed utility argument never grants every nested authored declaration ownership", ({ scratch, repoRoot }) => {
  const { view } = fixture(scratch, repoRoot);
  const path = "packages/client/src/mixed.tsx";
  const sourceFile = view.program.sourceFile(path);
  if (sourceFile === undefined) {
    throw new Error("missing mixed native source");
  }
  expect(sourceFile.getPreEmitDiagnostics()).toEqual([]);
  const mixedView = captureComponentTypeHomeView({ program: view.program, sourceFile, canonicalPath: canonicalCompilerPath(scratch, path) });
  const read = (name: string): ComponentTypeHomeResult =>
    componentTypeHome({
      declaration: sourceFile.getInterface(name) ?? sourceFile.getTypeAliasOrThrow(name),
      path,
      view: mixedView,
      lowerDeclarations: [],
    });
  expect(read("Api").kind).toBe("owned");
  expect(read("ContributingApi").kind).toBe("owned");
  expect(read("Contributing").kind).toBe("owned");
  expect(read("Unrelated")).toMatchObject({ kind: "unqualified" });
  const boundFacts = (
    [
      ["Api", "Unrelated"],
      ["ContributingApi", "Contributing"],
    ] as const
  ).map(([api, bindingName]) => {
    const reference = sourceFile.getInterfaceOrThrow(api).getPropertyOrThrow("caption").getTypeNodeOrThrow();
    if (!Node.isTypeReference(reference)) {
      throw new Error("missing utility reference");
    }
    const argument = reference.getTypeArguments()[1];
    const binding = argument?.getDescendantsOfKind(SyntaxKind.Identifier).find((identifier) => identifier.getText() === bindingName);
    if (argument === undefined || binding === undefined) {
      throw new Error("missing authored binding");
    }
    const input = { reference, argument, program: mixedView.nativeProgram, source: mixedView.nativeSource };
    expect(readNativeGenericArgumentContribution(input)).toMatchObject({ kind: "resolved", value: { contributes: true } });
    return { bound: readNativeGenericArgumentContribution({ ...input, binding }), binding, bindingName };
  });
  expect(boundFacts.map(({ bound }) => bound.kind)).toEqual(["unresolved", "resolved"]);
  const positive = boundFacts.find(({ bindingName }) => bindingName === "Contributing");
  if (positive === undefined || positive.bound.kind !== "resolved") {
    throw new Error("missing binding-specific positive witness");
  }
  expect(positive.bound.value.binding).toBe(positive.binding);
  expect(positive.bound.value.witnesses.length).toBeGreaterThan(0);
  expect(positive.bound.trace.declarations).toContain(sourceFile.getTypeAliasOrThrow("Contributing"));
});
