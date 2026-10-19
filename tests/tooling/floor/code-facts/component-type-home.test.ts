import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { captureComponentTypeHomeView, componentTypeHome, registeredComponentTypeHomeView } from "@orb/tooling/floor/code-facts/component-type-home";
import type { ComponentTypeHomeResult, ComponentTypeHomeView } from "@orb/tooling/floor/code-facts/component-type-home-contract";
import { beginReferencePass, endReferencePass } from "@orb/tooling/floor/code-facts/reference-fact";
import { readNativeGenericArgumentContribution } from "@orb/tooling/floor/code-facts/shape-derivation";
import { judgeTypeHomeDeclaration } from "@orb/tooling/floor/code-facts/type-home-declaration";
import { readReturnedDictionary } from "@orb/tooling/floor/code-facts/value-dependency";
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { canonicalCompilerPath, createSemanticWorkspace, registeredSemanticSourceView } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import type { SemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace-contract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reportTypeHomeDeclaration } from "../../../../tooling/src/verify/lib/type-home-policy.ts";
import { scaledBudget } from "../../_load-budget.ts";

interface ComponentHomeFixture {
  readonly path: string;
  readonly workspace: SemanticWorkspace;
  readonly sourceFile: SourceFile;
  readonly view: ComponentTypeHomeView;
  readonly read: (name: string) => ComponentTypeHomeResult;
}

function writeFixture(root: string, repoRoot: string): string {
  const write = (relativePath: string, text: string): void => {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  write(".gitignore", "node_modules\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const path = "packages/client/src/panel.tsx";
  mkdirSync(join(root, "packages/client"), { recursive: true });
  symlinkSync(join(repoRoot, "packages/ui/node_modules"), join(root, "packages/client/node_modules"), "dir");
  write("packages/contracts/src/wire.ts", "export interface Wire { id: string; label: string; enabled: boolean; order: number; }");
  write(
    path,
    `import { z } from "zod";
import { useRender as nativeUseRender } from "@base-ui/react/use-render";
import type { ReactNode, Ref } from "react";
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
export interface ConditionalApi { caption: string; }
export function Conditional(props: ConditionalApi) {
  const content = <div>{props.caption}</div>;
  return props.caption === "" ? null : content;
}
export interface StringBranchApi { label: string; }
export function StringBranch(props: StringBranchApi) { return props.label === "" ? props.label : <div />; }
export type InlineDimension = "small" | "large";
export function Inline(props: { dimension: InlineDimension }) { return <div>{props.dimension}</div>; }
export type InlineErased = { ignored: string };
export function InlineOpaque(props: { label: Ignore<InlineErased> }) { return <div>{props.label}</div>; }
export type ErasedHeritage = { ignored: string };
interface EmptyBase<T> { caption: string; }
export interface HeritageCarrier extends EmptyBase<ErasedHeritage> {}
export function Heritage(props: HeritageCarrier) { return <div>{props.caption}</div>; }
export const META_KEYS = ["side", "theme"] as const;
export type DisplayKeys = (typeof META_KEYS)[number];
export type UnusedDisplayKeys = (typeof META_KEYS)[number];
export type DisplayedMap = Partial<Record<\`data-\${DisplayKeys}\`, string>>;
function makeDisplayedMap(source: Readonly<Record<string, string | undefined>>): DisplayedMap { const attrs: Record<string, string> = {}; for (const axis of META_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export type KeptMap = Partial<Record<\`data-\${DisplayKeys}\`, string>>;
function makeKeptMap(source: Readonly<Record<string, string | undefined>>): KeptMap { const attrs: Record<string, string> = {}; for (const axis of META_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export type DroppedMap = Partial<Record<\`data-\${DisplayKeys}\`, string>>;
function makeDroppedMap(source: Readonly<Record<string, string | undefined>>): DroppedMap { const attrs: Record<string, string> = {}; for (const axis of META_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export type UnknownMap = Partial<Record<\`data-\${DisplayKeys}\`, string>>;
function makeUnknownMap(source: Readonly<Record<string, string | undefined>>): UnknownMap { const attrs: Record<string, string> = {}; for (const axis of META_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export type UnusedMap = Partial<Record<\`data-\${DisplayKeys}\`, string>>;
function makeUnusedMap(source: Readonly<Record<string, string | undefined>>): UnusedMap { const attrs: Record<string, string> = {}; for (const axis of META_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export type TvShapedUnused = DisplayedMap;
function fakeNativeTv(source: object): TvShapedUnused { return {}; }
export function FakeMetadataNative(props: ActualApi) { return <div {...fakeNativeTv(props)} />; }
export type ErasedDisplayKeys = (typeof META_KEYS)[number];
export type MixedDisplayKeys = (typeof META_KEYS)[number];
type IgnoreMetadataKey<T> = "side";
export type ErasedKeyMap = Partial<Record<\`data-\${IgnoreMetadataKey<ErasedDisplayKeys>}\`, string>>;
export type MixedKeyMap = Partial<Record<\`data-\${DisplayKeys | MixedDisplayKeys}\`, string>>;
export type WrongKeyMap = Partial<{ unrelated: string }>;
function makeErasedKeyMap(source: Readonly<Record<string, string | undefined>>): ErasedKeyMap { const attrs: Record<string, string> = {}; for (const axis of META_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function ShowErasedKeyMap(props: ActualApi) { return <div {...makeErasedKeyMap({side: props.caption})} />; }
function makeMixedKeyMap(source: Readonly<Record<string, string | undefined>>): MixedKeyMap { const attrs: Record<string, string> = {}; for (const axis of META_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function ShowMixedKeyMap(props: ActualApi) { return <div {...makeMixedKeyMap({side: props.caption})} />; }
function makeWrongKeyMap(source: Readonly<Record<string, string | undefined>>): WrongKeyMap { const attrs: Record<string, string> = {}; for (const axis of META_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function ShowWrongKeyMap(props: ActualApi) { return <div {...makeWrongKeyMap({side: props.caption})} />; }
export interface MetadataRootApi { caption: string; extra: Readonly<Record<string, string>>; }
export function MetadataDisplay(props: MetadataRootApi) { return <div {...makeDisplayedMap({side: props.caption})} />; }
export function MetadataKept(props: MetadataRootApi) { return <div {...makeKeptMap({side: props.caption})} {...{title: props.caption}} />; }
export function MetadataDropped(props: MetadataRootApi) { return <div {...makeDroppedMap({side: props.caption})} data-side="overwritten" data-theme="overwritten" />; }
export function MetadataUnknown(props: MetadataRootApi) { return <div {...makeUnknownMap({side: props.caption})} {...props.extra} />; }
export function MetadataUnused(props: MetadataRootApi) { makeUnusedMap({side: props.caption}); return <div />; }
export interface Handle { focus(): void; }
export interface RefApi { ref?: Ref<Handle>; }
export function RefSurface(props: RefApi) { return <div />; }
export interface Box<T> { value: T; }
export interface Payload { payloadText: string; }
export interface BoxApi { box: Box<Payload>; }
export function BoxSurface(props: BoxApi) { return <div />; }
export interface HeritagePayload { heritageCaption: string; }
export interface HeritageApi extends Box<HeritagePayload> {}
export function HeritageSurface(props: HeritageApi) { return <div />; }
export interface MappedPayload { title: string; }
export interface MappedApi { value: Readonly<MappedPayload>; }
export function MappedSurface(props: MappedApi) { return <div />; }
export interface NestedErased { ignored: string; }
export interface NestedApi { value: Readonly<Box<Ignore<NestedErased>>>; }
export function NestedSurface(props: NestedApi) { return <div />; }
export const nativeSchema = z.object({ nativeCaption: z.string() });
export type NativeSchemaOutput = z.infer<typeof nativeSchema>;
const nativeAnySchema = z.any();
const nativeNeverSchema = z.never();
export type NativeAnySchemaOutput = z.infer<typeof nativeAnySchema>;
export type NativeNeverSchemaOutput = z.infer<typeof nativeNeverSchema>;
type ErasedOutput<T> = string;
export type NativeErasedSchemaOutput = ErasedOutput<typeof nativeSchema>;
export interface NativeRenderApi { message: string; }
export function NativeRender(props: NativeRenderApi) { return nativeUseRender({ defaultTagName: "div", props: { children: <span>{props.message}</span> } }); }
export interface FakeRenderApi { message: string; }
function useRender(value: object) { return "no DOM"; }
export function FakeRender(props: FakeRenderApi) { return useRender({ defaultTagName: "div", props }); }
export interface DisabledRenderApi { message: string; }
export function DisabledRender(props: DisabledRenderApi) { return nativeUseRender({ defaultTagName: "div", enabled: false, props }); }
export interface UnusedRenderApi { message: string; }
export function UnusedRender(props: UnusedRenderApi) { nativeUseRender({ defaultTagName: "div", props }); return "unused"; }
export type ConstrainedOnly = { ignored: string };
export interface Phantom<T extends ConstrainedOnly> { caption: string; }
export function Constraint(props: Phantom<ConstrainedOnly>) { return <div>{props.caption}</div>; }
`,
  );
  write("packages/client/src/support.ts", "export interface Supported { caption: string; } export interface UnusedSupport { value: string; }");
  write("packages/client/src/support-barrel.ts", 'export type { Supported as Api } from "./support.ts";');
  write(
    "packages/client/src/support-surface.tsx",
    'import type { Api } from "./support-barrel.ts"; export function Supporting(props: Api) { return <div>{props.caption}</div>; }',
  );
  write(
    "packages/ui/src/foreign.tsx",
    'import type { Supported } from "../../client/src/support.ts"; export function Foreign(props: Supported) { return <div />; }',
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
  write(
    "packages/ui/src/native-panel.tsx",
    'export interface Actual { caption: string; } export interface UnusedProps { text: string; } export interface Copy { id: string; label: string; enabled: boolean; order: number; } export function Copied(props: Copy) { return <div>{props.label}</div>; } export function Surface(props: Actual) { const rendered = <div>{props.caption}</div>; return props.caption === "" ? null : rendered; }',
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
        files: [
          "../client/src/panel.tsx",
          "../client/src/barrel.ts",
          "../client/src/generic.ts",
          "../client/src/mixed.tsx",
          "../client/src/support.ts",
          "../client/src/support-barrel.ts",
          "../client/src/support-surface.tsx",
          "../ui/src/foreign.tsx",
          "../ui/src/native-panel.tsx",
        ],
      }),
    );
  }
  execFixtureGit(root, ["init", "-q"]);
  return path;
}

function fixture(root: string, repoRoot: string): ComponentHomeFixture {
  const path = writeFixture(root, repoRoot);
  const workspace = createSemanticWorkspace({ root });
  const owner = workspace.program("packages/client/tsconfig.json");
  const sourceFile = owner?.sourceFile(path);
  if (owner === undefined || sourceFile === undefined) {
    throw new Error("missing browser fixture");
  }
  const view = captureComponentTypeHomeView({ program: owner, sourceFile, canonicalPath: canonicalCompilerPath(root, path) });
  const lower = sourceFile
    .getImportDeclarations()
    .find((imported) => imported.getModuleSpecifierValue().endsWith("/wire.ts"))
    ?.getModuleSpecifierSourceFile()
    ?.getInterfaceOrThrow("Wire");
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

// Production reads every declaration inside one reference pass; outside it each read rebuilds the pass-scoped caches (about 1 s per read).
function inReferencePass(run: () => void): void {
  beginReferencePass();
  try {
    run();
  } finally {
    endReferencePass();
  }
}

test("native DOM origins establish arbitrary names, supporting variants, render callbacks, generic and aliased/default APIs", ({ scratch, repoRoot }) => {
  const { read } = fixture(scratch, repoRoot);
  inReferencePass(() => {
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
});

test("names, unused declarations, wrappers and known lower-data overlaps never manufacture ownership", ({ scratch, repoRoot }) => {
  beginReferencePass();
  try {
    const { read } = fixture(scratch, repoRoot);
    for (const name of ["UnusedProps", "ImpostorProps", "WrappedApi", "MutatedApi"]) {
      expect(read(name), name).toMatchObject({ kind: "unqualified", component: null });
    }
    for (const name of ["ErasedVocabulary", "ShadowVocabulary", "NativeNeverVocabulary"]) {
      expect(read(name), name).toMatchObject({ kind: "unqualified", reason: expect.stringContaining("opaque generic") });
    }
    expect(read("CopyProps")).toMatchObject({
      kind: "unqualified",
      lowerData: { kind: "unqualified", comparisons: [{ shared: 4, agreeing: 4, exact: true }] },
    });
    expect(read("Derived")).toMatchObject({ kind: "owned", lowerData: { kind: "derived" } });
  } finally {
    endReferencePass();
  }
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

function readRealComponentHome(
  root: string,
  workspace: SemanticWorkspace,
  input: { readonly config: string; readonly path: string; readonly name: string; readonly supportPath?: string },
): ComponentTypeHomeResult {
  const owner = workspace.program(input.config);
  const sourceFile = owner?.sourceFile(input.path);
  if (owner === undefined || sourceFile === undefined) {
    throw new Error(`missing native source ${input.path}`);
  }
  const support = input.supportPath === undefined ? undefined : owner.sourceFile(input.supportPath);
  if (input.supportPath !== undefined && support === undefined) {
    throw new Error(`missing native supporting source ${input.supportPath}`);
  }
  beginReferencePass();
  try {
    return componentTypeHome({
      declaration: sourceFile.getInterface(input.name) ?? sourceFile.getTypeAliasOrThrow(input.name),
      path: input.path,
      view: captureComponentTypeHomeView({ program: owner, sourceFile, canonicalPath: canonicalCompilerPath(root, input.path) }),
      lowerDeclarations: [],
      ...(support === undefined
        ? {}
        : {
            supportingViews: [
              captureComponentTypeHomeView({ program: owner, sourceFile: support, canonicalPath: canonicalCompilerPath(root, support.getFilePath()) }),
            ],
          }),
    });
  } finally {
    endReferencePass();
  }
}

test(
  "real native component APIs preserve installed derivation and prove conditional, inline and imported support",
  ({ repoRoot }) => {
    const configs = ["packages/ui/tsconfig.json", "packages/client/tsconfig.json"] as const;
    const workspace = createSemanticWorkspace({
      root: repoRoot,
      programs: readCompilerPrograms(repoRoot).filter(({ config }) => configs.some((allowed) => allowed === config)),
    });
    for (const [config, path, name, supportPath] of [
      [configs[0], "packages/ui/src/primitives/button/button.tsx", "IconOnlyButtonSize"],
      [configs[0], "packages/ui/src/primitives/media-grid/media-grid.tsx", "MediaGridHandle"],
      [configs[0], "packages/ui/src/layout/action-bar.tsx", "ActionBarProps"],
      [configs[0], "packages/ui/src/primitives/autocomplete/autocomplete.tsx", "AutocompleteGroup"],
      [configs[0], "packages/ui/src/content/message-media/message-media.tsx", "MessageMediaProps"],
      [configs[0], "packages/ui/src/primitives/field/field.tsx", "FieldAlign"],
      [configs[0], "packages/ui/src/primitives/list-row/parts.tsx", "ListRowDescriptors"],
      [configs[0], "packages/ui/src/charts/chart/contract.ts", "ChartProps", "packages/ui/src/charts/chart/chart.tsx"],
      [configs[0], "packages/ui/src/content/theme-scope/clamp.ts", "ThemeScopeTokens", "packages/ui/src/content/theme-scope/theme-scope.tsx"],
      [configs[1], "packages/client/src/components/content-dialog.tsx", "ContentDialogProps"],
    ] as const) {
      const result = readRealComponentHome(repoRoot, workspace, { config, path, name, ...(supportPath === undefined ? {} : { supportPath }) });
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

test("actual conditional and immutable bound rendering plus inline parameter origins prove support without granting string or erased branches", ({
  scratch,
  repoRoot,
}) => {
  const { read } = fixture(scratch, repoRoot);
  inReferencePass(() => {
    for (const name of ["ConditionalApi", "InlineDimension"]) {
      expect(read(name), name).toMatchObject({ kind: "owned" });
    }
    for (const name of ["StringBranchApi", "InlineErased", "ErasedHeritage", "ConstrainedOnly"]) {
      expect(read(name), name).toMatchObject({ kind: "unqualified" });
    }
  });
});

test("cross-source support follows actual native alias origins only within the delivered owner boundary", ({ scratch, repoRoot }) => {
  const { view } = fixture(scratch, repoRoot);
  const path = "packages/client/src/support.ts";
  const sourceFile = view.program.sourceFile(path);
  const surface = view.program.sourceFile("packages/client/src/support-surface.tsx");
  const foreign = view.program.sourceFile("packages/ui/src/foreign.tsx");
  if (sourceFile === undefined || surface === undefined || foreign === undefined) {
    throw new Error("missing native supporting sources");
  }
  const capture = (source: SourceFile): ComponentTypeHomeView =>
    captureComponentTypeHomeView({
      program: view.program,
      sourceFile: source,
      canonicalPath: canonicalCompilerPath(scratch, source.getFilePath()),
    });
  const supportView = capture(sourceFile);
  const surfaceView = capture(surface);
  const read = (name: string): ComponentTypeHomeResult => {
    const input = {
      declaration: sourceFile.getInterfaceOrThrow(name),
      path,
      view: supportView,
      lowerDeclarations: [],
      supportingViews: [surfaceView],
    };
    return componentTypeHome(input);
  };
  const result = read("Supported");
  expect(result.kind).toBe("owned");
  if (result.kind !== "owned") {
    throw new Error("missing imported component origin");
  }
  expect(result.component.callable.getSourceFile()).toBe(surface);
  expect(result.component.supportingDeclarations).toContain(sourceFile.getInterfaceOrThrow("Supported"));
  expect(read("UnusedSupport").kind).toBe("unqualified");
  const foreignInput = {
    declaration: sourceFile.getInterfaceOrThrow("Supported"),
    path,
    view: supportView,
    lowerDeclarations: [],
    supportingViews: [capture(foreign)],
  };
  expect(componentTypeHome(foreignInput)).toMatchObject({ kind: "refused" });
  surface.replaceWithText("export function Changed() { return <div />; }");
  const staleInput = {
    declaration: sourceFile.getInterfaceOrThrow("Supported"),
    path,
    view: capture(sourceFile),
    lowerDeclarations: [],
    supportingViews: [surfaceView],
  };
  expect(componentTypeHome(staleInput)).toMatchObject({ kind: "refused" });
});

test("registered view delivery reads only the existing source owner and contextual declaration judgment never invents a fallback", ({ scratch, repoRoot }) => {
  const { view, sourceFile, workspace } = fixture(scratch, repoRoot);
  const server = workspace.program("packages/server/tsconfig.json");
  if (server === undefined) {
    throw new Error("missing unopened Node owner");
  }
  const unopened = vi.spyOn(server, "project").mockImplementation(() => {
    throw new Error("unrequested native program materialized");
  });
  try {
    expect(registeredSemanticSourceView(sourceFile)?.program).toBe(view.program);
    expect(registeredComponentTypeHomeView(sourceFile)?.nativeSource).toBe(view.nativeSource);
    expect(
      componentTypeHome({
        declaration: sourceFile.getInterfaceOrThrow("Arbitrary"),
        path: "packages/client/src/panel.tsx",
        view: { ...view, program: server },
        lowerDeclarations: [],
      }),
    ).toMatchObject({ kind: "refused" });
    expect(unopened).not.toHaveBeenCalled();
    const syntax = new Project({ useInMemoryFileSystem: true }).createSourceFile("/syntax/packages/ui/src/panel.tsx", "export interface Props {}");
    expect(registeredSemanticSourceView(syntax)).toBeUndefined();
    expect(registeredComponentTypeHomeView(syntax)).toBeUndefined();
    const path = "packages/ui/src/native-panel.tsx";
    const source = view.program.sourceFile(path);
    const native = source === undefined ? undefined : registeredComponentTypeHomeView(source);
    if (source === undefined || native === undefined) {
      throw new Error("missing delivered UI context");
    }
    const actual = source.getInterfaceOrThrow("Actual");
    expect(judgeTypeHomeDeclaration(actual, { path, claim: "interface" })).toMatchObject({ kind: "subject", ownership: { kind: "unqualified" } });
    expect(judgeTypeHomeDeclaration(actual, { path, claim: "interface", component: { view: native, lowerDeclarations: [] } })).toMatchObject({
      kind: "subject",
      ownership: { kind: "component-owned" },
    });
    expect(
      judgeTypeHomeDeclaration(source.getInterfaceOrThrow("UnusedProps"), { path, claim: "interface", component: { view: native, lowerDeclarations: [] } }),
    ).toMatchObject({ kind: "subject", ownership: { kind: "unqualified" } });
    expect(unopened).not.toHaveBeenCalled();
  } finally {
    unopened.mockRestore();
  }
});

test("ordinary reporting accepts only delivered component ownership and preserves missing-context and lower-data findings", ({ scratch, repoRoot }) => {
  const { view } = fixture(scratch, repoRoot);
  const path = "packages/ui/src/native-panel.tsx";
  const source = view.program.sourceFile(path);
  const lower = view.program.sourceFile("packages/contracts/src/wire.ts")?.getInterfaceOrThrow("Wire");
  if (source === undefined || lower === undefined) {
    throw new Error("missing native placement subjects");
  }
  const unqualified = defineGate({
    id: "component-placement-fixture",
    family: "no-inline-types",
    authority: "ordinary",
    severity: "error",
    population: { in: ["@ui"], under: [path] },
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "fixture placement",
    fix: "retain actual ownership; a deliberate keep waives with `@orb-waive component-placement-fixture(<position>): <reason>`",
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration],
          visit: (node): void => {
            reportTypeHomeDeclaration(ctx, node, "interface", { message: "fixture placement", fix: "retain actual ownership" });
          },
        },
      ],
    }),
    mustFlag: [
      {
        mode: "source",
        files: { [path]: "export interface Actual { caption: string; }" },
        expect: { count: 1 },
        why: "missing native context retains the ordinary placement finding",
      },
    ],
    mustPass: [{ mode: "source", files: { [path]: "export const anchor = 1;" }, why: "values are not declaration placement subjects" }],
  });
  const delivered = defineGate({
    ...unqualified,
    analysis: "types",
    mustFlag: unqualified.mustFlag.map((proof) => ({ ...proof, mode: "types" as const })),
    mustPass: unqualified.mustPass.map((proof) => ({ ...proof, mode: "types" as const })),
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration],
          visit: (node): void => {
            const native = registeredComponentTypeHomeView(node.getSourceFile());
            reportTypeHomeDeclaration(ctx, node, "interface", {
              message: "fixture placement",
              fix: "retain actual ownership",
              ...(native === undefined ? {} : { component: { view: native, lowerDeclarations: [lower] } }),
            });
          },
        },
      ],
    }),
  });
  const run = (policy: GatePolicy): readonly string[] => {
    const result = runPolicyPass({
      root: scratch,
      project: view.program.project(),
      knownPolicies: [policy],
      policies: [policy],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    return result.authority.effectiveFindings
      .map(({ token }) => {
        if (token === undefined) {
          throw new Error("fixture placement finding lost its authored token");
        }
        return token;
      })
      .toSorted((left, right) => left.localeCompare(right));
  };
  expect(run(unqualified)).toEqual(["Actual", "Copy", "UnusedProps"]);
  expect(run(delivered)).toEqual(["Copy", "UnusedProps"]);
});

test(
  "native substituted members and callable slots prove binding-specific Ref, authored and mapped support without erased grants",
  ({ scratch, repoRoot }) => {
    const { read } = fixture(scratch, repoRoot);
    for (const name of ["Handle", "Payload", "MappedPayload", "HeritagePayload"]) {
      expect(read(name), name).toMatchObject({ kind: "owned" });
    }
    for (const name of ["NestedErased", "ErasedVocabulary", "ConstrainedOnly", "ErasedHeritage"]) {
      expect(read(name), name).toMatchObject({ kind: "unqualified" });
    }
  },
  scaledBudget(15_000),
);

test("actual returned installed BaseUI rendering contributes a native DOM root, unlike shadow, disabled or unused calls", ({ scratch, repoRoot }) => {
  const { read } = fixture(scratch, repoRoot);
  inReferencePass(() => {
    expect(read("NativeRenderApi").kind).toBe("owned");
    for (const name of ["FakeRenderApi", "DisabledRenderApi", "UnusedRenderApi"]) {
      expect(read(name).kind, name).toBe("unqualified");
    }
  });
});

test("schema generic output effect follows the actual selected native formal property projection", ({ scratch, repoRoot }) => {
  const { sourceFile, view } = fixture(scratch, repoRoot);
  const reference = sourceFile.getTypeAliasOrThrow("NativeSchemaOutput").getTypeNodeOrThrow();
  if (!Node.isTypeReference(reference)) {
    throw new Error("missing schema generic");
  }
  const argument = reference.getTypeArguments()[0];
  if (argument === undefined || !Node.isTypeQuery(argument)) {
    throw new Error("missing schema query");
  }
  const fact = readNativeGenericArgumentContribution({
    reference,
    argument,
    binding: argument.getExprName(),
    program: view.nativeProgram,
    source: view.nativeSource,
  });
  expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "native output effect").toBe("resolved");
  if (fact.kind !== "resolved") {
    throw new Error("missing actual native output effect");
  }
  expect(fact.value.contributes).toBe(true);
  expect(fact.trace.declarations).toContain(sourceFile.getVariableDeclarationOrThrow("nativeSchema"));
});

test("schema output projection refuses opaque any, never and an erased generic instead of manufacturing ownership", ({ scratch, repoRoot }) => {
  const { sourceFile, view } = fixture(scratch, repoRoot);
  for (const name of ["NativeAnySchemaOutput", "NativeNeverSchemaOutput", "NativeErasedSchemaOutput"]) {
    const reference = sourceFile.getTypeAliasOrThrow(name).getTypeNodeOrThrow();
    if (!Node.isTypeReference(reference)) {
      throw new Error("missing schema generic");
    }
    const argument = reference.getTypeArguments()[0];
    if (argument === undefined || !Node.isTypeQuery(argument)) {
      throw new Error("missing schema query");
    }
    expect(
      readNativeGenericArgumentContribution({ reference, argument, binding: argument.getExprName(), program: view.nativeProgram, source: view.nativeSource })
        .kind,
      name,
    ).toBe("unresolved");
  }
});

test(
  "real metadata-only returned attribute API and finite key vocabulary belong to the consuming native render root",
  ({ repoRoot }) => {
    const config = "packages/ui/tsconfig.json";
    const workspace = createSemanticWorkspace({ root: repoRoot, programs: readCompilerPrograms(repoRoot).filter((program) => program.config === config) });
    const source = workspace.program(config)?.sourceFile("packages/ui/src/lib/variant-attrs.ts");
    if (source === undefined) {
      throw new Error("missing actual metadata source");
    }
    const helper = source.getFunctionOrThrow("variantAttrs");
    const value = helper.getDescendantsOfKind(SyntaxKind.ReturnStatement).at(-1)?.getExpression();
    if (value === undefined) {
      throw new Error("missing actual metadata return");
    }
    beginReferencePass();
    try {
      const observations = observeCallReturns(helper.getDescendantsOfKind(SyntaxKind.CallExpression), undefined, { explicitAbsentReturns: true });
      const dictionary = readReturnedDictionary({ value, observations });
      expect(dictionary.kind, dictionary.kind === "unqualified" ? dictionary.reason : "actual native metadata map").toBe("qualified");
    } finally {
      endReferencePass();
    }
    for (const name of ["VariantAxisAttrs", "StampedVariantAxis"]) {
      const result = readRealComponentHome(repoRoot, workspace, {
        config,
        path: "packages/ui/src/lib/variant-attrs.ts",
        name,
        supportPath: "packages/ui/src/primitives/status-chip/status-chip.tsx",
      });
      expect(result.kind, name).toBe("owned");
      if (result.kind !== "owned") {
        throw new Error(`missing returned-map ownership ${name}`);
      }
      expect(result.lowerData.kind).toBe("unqualified");
      expect(result.component.primitiveAttributes?.[0]?.dictionary.dataTrust.kind).toBe("unqualified");
      const owner = workspace.program(config);
      const support = owner?.sourceFile("packages/ui/src/primitives/status-chip/status-chip.tsx");
      if (owner === undefined || support === undefined) {
        throw new Error("missing actual primitive owner");
      }
      const judgment = judgeTypeHomeDeclaration(source.getTypeAliasOrThrow(name), {
        path: "packages/ui/src/lib/variant-attrs.ts",
        claim: "alias-or-schema",
        component: {
          view: captureComponentTypeHomeView({ program: owner, sourceFile: source, canonicalPath: canonicalCompilerPath(repoRoot, source.getFilePath()) }),
          supportingViews: [
            captureComponentTypeHomeView({ program: owner, sourceFile: support, canonicalPath: canonicalCompilerPath(repoRoot, support.getFilePath()) }),
          ],
          lowerDeclarations: [],
        },
      });
      expect(judgment.kind === "subject" ? judgment.ownership.kind : judgment.kind).toBe("component-owned");
      const overwritten = readRealComponentHome(repoRoot, workspace, {
        config,
        path: "packages/ui/src/lib/variant-attrs.ts",
        name,
        supportPath: "packages/ui/src/primitives/avatar/avatar.tsx",
      });
      expect(overwritten.kind, "actual Avatar has a later unknown rest spread").toBe("unqualified");
    }
    for (const name of ["VariantClassRecipe", "VariantStampProps"]) {
      expect(
        readRealComponentHome(repoRoot, workspace, {
          config,
          path: "packages/ui/src/lib/variant-attrs.ts",
          name,
          supportPath: "packages/ui/src/primitives/status-chip/status-chip.tsx",
        }).kind,
        "dynamic class chain remains unsupported",
      ).toBe("unqualified");
    }
  },
  scaledBudget(60_000),
);

test("returned attribute API follows exact producer and final JSX spread, not overwrite, unknown spreads or unused calls", ({ scratch, repoRoot }) => {
  const { read, sourceFile, view } = fixture(scratch, repoRoot);
  const outer = sourceFile.getTypeAliasOrThrow("DisplayedMap").getTypeNodeOrThrow();
  if (!Node.isTypeReference(outer)) {
    throw new Error("missing native optional reference");
  }
  const argument = outer.getTypeArguments()[0];
  const binding = argument?.getDescendantsOfKind(SyntaxKind.Identifier).find((identifier) => identifier.getText() === "DisplayKeys");
  if (argument === undefined || binding === undefined) {
    throw new Error("missing exact mapped key fixture binding");
  }
  const contribution = readNativeGenericArgumentContribution({ reference: outer, argument, binding, program: view.nativeProgram, source: view.nativeSource });
  expect(contribution.kind, contribution.kind === "unresolved" ? contribution.detail : "actual key contribution").toBe("resolved");
  inReferencePass(() => {
    for (const name of ["DisplayedMap", "KeptMap", "DisplayKeys"]) {
      expect(read(name).kind, name).toBe("owned");
    }
    for (const name of [
      "DroppedMap",
      "UnknownMap",
      "UnusedMap",
      "TvShapedUnused",
      "UnusedDisplayKeys",
      "ErasedDisplayKeys",
      "MixedDisplayKeys",
      "WrongKeyMap",
    ]) {
      expect(read(name).kind, name).toBe("unqualified");
    }
  });
});

test(
  "actual cached search API owns its supplied options while the unresolved smooth lifetime stays explicit",
  ({ repoRoot }) => {
    const config = "packages/ui/tsconfig.json";
    const workspace = createSemanticWorkspace({ root: repoRoot, programs: readCompilerPrograms(repoRoot).filter((program) => program.config === config) });
    const result = readRealComponentHome(repoRoot, workspace, { config, path: "packages/ui/src/fuzzy-search/fuzzy-search.ts", name: "FuzzySearchOptions" });
    expect(result.kind, result.kind !== "owned" ? result.reason : "actual supplied native search API").toBe("owned");
    if (result.kind !== "owned") {
      throw new Error("missing actual search API ownership");
    }
    expect(result.component.primitiveSearches?.length).toBe(1);
    expect(result.lowerData.kind).toBe("unqualified");
    const smooth = readRealComponentHome(repoRoot, workspace, {
      config,
      path: "packages/ui/src/stream/use-smooth-text.ts",
      name: "UseSmoothTextOptions",
      supportPath: "packages/ui/src/stream/stream-text.tsx",
    });
    expect(smooth.kind).toBe("unqualified");
  },
  scaledBudget(60_000),
);

test("native search ownership follows the actual options member and returned lookup, not names or an unused native call", async ({ plantedTree, repoRoot }) => {
  const config = "packages/ui/tsconfig.json";
  const path = "packages/ui/src/lookup.ts";
  const body = (name: string, parameter: string, fields: string, returned: string): string =>
    `export function ${name}(items:readonly {id:string,label:string}[],query:string,options:${parameter}) { const ms = new MiniSearch({fields:${fields} as string[]}); const hits = ms.search(query); const byId = new Map(items.map(it=>[it.id,it] as const)); const out:{id:string,label:string}[]=[]; for(const hit of hits) {const item=byId.get(hit.id as string); if(item!==undefined) {out.push(item);} } return ${returned}; }`;
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    [config]: JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "DOM"], types: [] },
      files: ["src/lookup.ts"],
    }),
    "packages/ui/src/engine.ts": 'export {default as Engine} from "minisearch";',
    [path]: `import MiniSearch from "minisearch";
import {Engine as ForwardedEngine} from "./engine.js";
export interface ArbitraryInput {readonly fields:readonly string[];}
export interface CosmeticProps {readonly fields:readonly string[];}
export interface DiscardedApi {readonly fields:readonly string[];}
export type ForwardedOptions = {readonly fields:readonly string[]};
export interface LiveSearchApi {fields:string[];}
export interface DeadSearchApi {fields:string[];}
export function LiveSearch(query:string,options:LiveSearchApi) { const ms=new MiniSearch({fields:options.fields}); return ms.search(query); }
export function DeadSearch(query:string,options:DeadSearchApi) { return []; const ms=new MiniSearch({fields:options.fields}); return ms.search(query); }
${body("Live", "ArbitraryInput", "options.fields", "out")}
${body("UnusedInput", "CosmeticProps", '["label"]', "out")}
${body("Discarded", "DiscardedApi", "options.fields", "items")}
${body("Forwarded", "ForwardedOptions", "options.fields", "out").replace("new MiniSearch", "new ForwardedEngine")}
`,
  });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  symlinkSync(join(repoRoot, "packages/ui/node_modules"), join(root, "packages/ui/node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const workspace = createSemanticWorkspace({ root });
  const source = workspace.program(config)?.sourceFile(path);
  if (source === undefined) {
    throw new Error("missing actual native search fixture");
  }
  expect(source.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  expect(readRealComponentHome(root, workspace, { config, path, name: "ArbitraryInput" }).kind).toBe("owned");
  expect(readRealComponentHome(root, workspace, { config, path, name: "ForwardedOptions" }).kind).toBe("owned");
  expect(readRealComponentHome(root, workspace, { config, path, name: "LiveSearchApi" }).kind).toBe("owned");
  for (const name of ["CosmeticProps", "DiscardedApi", "DeadSearchApi"]) {
    expect(readRealComponentHome(root, workspace, { config, path, name }).kind, name).toBe("unqualified");
  }
});

test(
  "component lower-data preserves overlap and derivation through run-owned native pair facts",
  ({ scratch, repoRoot }) => {
    writeFixture(scratch, repoRoot);
    const entry = fileURLToPath(new URL("../compiler/native-component-shape-case.ts", import.meta.url));
    const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
    const result = join(scratch, "component-shape-result.json");
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, scratch, result]);
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(readFileSync(result, "utf8"))).toMatchObject({
      copy: { kind: "unqualified", lowerData: { kind: "unqualified", comparisons: [{ shared: 4, agreeing: 4, exact: true }] } },
      derived: { kind: "owned", lowerData: { kind: "derived" } },
    });
  },
  scaledBudget(60_000),
);
