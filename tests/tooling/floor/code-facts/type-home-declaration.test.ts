import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { judgeTypeHomeDeclaration } from "@orb/tooling/floor/code-facts/type-home-declaration";
import { Project } from "ts-morph";
import ts from "typescript";
import { serverFactoryTypeHome } from "../../../../tooling/src/floor/code-facts/server-factory-type-home.ts";
import type { TypeHomeNativeSource } from "../../../../tooling/src/floor/code-facts/type-home-contract.ts";
import { createSemanticWorkspace, registeredSemanticSourceView } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { TOKEN_GENERATION_INPUT_PATHS } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import { gate as domainInterfaces } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as packageInterfaces } from "../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as inlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as wireInterfaces } from "../../../../tooling/src/verify/gates/no-inline-wire-interface.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { prepareTokenTypeGeneration, tokenTypeGenerationOwner } from "../../../../tooling/src/verify/ops/gen/theme-css.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { loadTokenGeneratedTypes } from "../../../../tooling/src/verify/ops/resource-artifact.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
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
  expect(judgments.slice(0, 3).map((judgment) => (judgment.kind === "subject" ? judgment.names.map((name) => name.getText()) : []))).toEqual([
    ["Direct"],
    ["Local"],
    ["Default"],
  ]);
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

test("server factory ownership follows local signatures without admitting wire data or shadowed names", ({ scratch }) => {
  const paths: { readonly path: string; readonly target: string }[] = [];
  for (const tier of ["entry", "transport", "infra", "foundation"]) {
    const path = `packages/server/src/${tier}/factory.ts`;
    const target = join(scratch, path);
    paths.push({ path, target });
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      `
export interface Options { readonly enabled: boolean; }
export interface Dependency { readonly run: () => void; }
export interface Handle { readonly stop: () => void; }
export interface Supporting { readonly limit: number; }
interface Dependencies { readonly operation: Dependency; readonly support: Supporting; }
export interface Unused { readonly run: () => void; }
export interface Shadow { readonly run: () => void; }
export interface BodyOnly { readonly run: () => void; }
export interface Erased { readonly run: () => void; }
type Ignore<T> = { readonly kind: "ignored" };
export interface PayloadResponse { readonly value: string; }
export interface CallableResult { readonly run: () => void; }
export interface InferredHandle { readonly close: () => void; }
export interface AsyncHandle { readonly finish: () => void; }
export type NestedOptions = Readonly<Options>;
export type DataResponse = { readonly value: string };
export interface Recursive { readonly next?: Recursive; readonly run: () => void; }
export function create(options: Options, deps: Dependencies): Handle { return { stop: deps.operation.run }; }
export const createResult = (): CallableResult => ({ run() {} });
export function inferred() { const handle: InferredHandle = { close() {} }; return handle; }
export async function inferredAsync() { const handle: AsyncHandle = { finish() {} }; return handle; }
export function nested(value: NestedOptions): Recursive { return { run() {} }; }
export function data(): DataResponse { return { value: "wire" }; }
export function wire(): PayloadResponse { return { value: "wire" }; }
export function shadow<Shadow>(value: Shadow): Shadow { return value; }
export function body(): void { const unused: BodyOnly | undefined = undefined; }
export function ignored(value: Ignore<Erased>): void {}
export function ignoredReturn() { const value: Ignore<Erased> = { kind: "ignored" }; return value; }
`,
    );
  }
  const program = ts.createProgram(
    paths.map(({ target }) => target),
    { target: ts.ScriptTarget.ES2022, types: [] },
  );
  for (const { path, target } of paths) {
    const source = program.getSourceFile(target);
    if (source === undefined) {
      throw new Error("native factory source missing");
    }
    const declaration = (name: string): ts.InterfaceDeclaration | ts.TypeAliasDeclaration => {
      const found = source.statements.find(
        (node): node is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
          (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text === name,
      );
      if (found === undefined) {
        throw new Error(`native fixture declaration ${name} missing`);
      }
      return found;
    };
    const factory = {
      kind: "parser" as const,
      program,
      source,
      checker: program.getTypeChecker(),
    };
    for (const name of ["Options", "Dependency", "Handle", "Supporting", "CallableResult", "InferredHandle", "AsyncHandle", "Recursive"]) {
      expect(serverFactoryTypeHome(declaration(name), path, factory), `${path}/${name}`).toBe(true);
    }
    expect(serverFactoryTypeHome(declaration("NestedOptions"), path, factory)).toBe(true);
    expect(serverFactoryTypeHome(declaration("DataResponse"), path, factory)).toBe(false);
    for (const name of ["Unused", "Shadow", "BodyOnly", "PayloadResponse", "Erased"]) {
      expect(serverFactoryTypeHome(declaration(name), path, factory), `${path}/${name}`).toBe(false);
    }
  }
});

test("the custom adapters keep their accusations, authored positions and waiver consumption on judged paths, and the native-admitted server domain draws none", () => {
  const root = "/type-home-declarations";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of [
    [
      "packages/client/src/features/chat/lists.ts",
      `type Direct = string;
export { Direct };
type Local = number;
export { Local as A, Local as B };
// @orb-waive no-inline-types(Waived): this control retains its exact authored position.
export type Waived = string;
`,
    ],
    // The whole server domain is native-admitted, so the domain-interface arm judges no path and owes no finding.
    ["packages/server/src/domain/chat/verbs/read.ts", "interface Default { readonly value: string; }\nexport { Default as default };\n"],
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
      ["no-inline-types", "ComponentApi"],
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
        return judgment.kind === "subject" ? judgment.names.map((name) => name.getText()) : [];
      }),
    })),
  ).toEqual([
    { config: "packages/client/tsconfig.json", shapes: [] },
    {
      config: "packages/server/tsconfig.json",
      shapes: ["Direct", "Published"],
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

test("UI token authoring has one structural Node contract home without granting browser or generated ownership", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, expected] of [
    ["packages/ui/token-contract.ts", "owned"],
    ["packages/ui/tokens.build.ts", "misplaced"],
    ["packages/ui/tokens.near-duplicate.ts", "misplaced"],
    ["packages/ui/not-token-contract.ts", "misplaced"],
    ["packages/ui/src/token-contract.ts", "unqualified"],
    ["packages/ui/src/tokens/index.ts", "unqualified"],
  ] as const) {
    const source = project.createSourceFile(`/repo/${path}`, "export interface TokenInput { readonly value:string; }");
    const result = judgeTypeHomeDeclaration(source.getInterfaceOrThrow("TokenInput"), { path, claim: "interface" });
    expect(result.kind).toBe("subject");
    if (result.kind !== "subject") {
      throw new Error("missing authoring declaration");
    }
    expect(result.ownership.kind, path).toBe(expected);
  }
});

test("ordinary placement exposes misplaced authoring types but preserves its single contract and type reexport doors", () => {
  const root = "/ui-authoring-placement";
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${root}/packages/server/src/infra/anchor.ts`, "export const anchor=1;");
  project.createSourceFile(`${root}/packages/ui/token-contract.ts`, "export interface Owned { readonly value:string; }");
  project.createSourceFile(
    `${root}/packages/ui/tokens.build.ts`,
    "export interface Misplaced { readonly value:string; } export type Extra=number; export type { Owned } from './token-contract.ts';",
  );
  project.createSourceFile(`${root}/packages/ui/src/ordinary.tsx`, "export type BrowserProps={readonly children:string};");
  const policies = [inlineTypes, packageInterfaces];
  const result = runPolicyPass({ root, project, knownPolicies: policies, policies, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ fix }) => fix)).toEqual([
    expect.stringContaining("packages/ui/token-contract.ts"),
    expect.stringContaining("packages/ui/token-contract.ts"),
  ]);
  expect(result.authority.effectiveFindings.map(({ policyId, token }) => [policyId, token]).toSorted((a, b) => a.join(":").localeCompare(b.join(":")))).toEqual(
    [
      ["no-inline-package-interface", "Misplaced"],
      ["no-inline-types", "Extra"],
    ],
  );
});

test("generated vocabulary requires current producer bytes and the local native value binding", async ({ scratch }) => {
  const outputPath = "packages/ui/src/tokens/index.ts";
  const producerPath = "packages/ui/tokens.build.ts";
  const themesPath = "packages/ui/src/tokens/themes.gen.ts";
  const themesText = "export const FOREIGN={foreign:1};";
  const text =
    'import { FOREIGN } from "./themes.gen.ts"; export const TOKENS={a:"a"} as const; export type TokenPath=keyof typeof TOKENS; export type Borrowed=keyof typeof FOREIGN; const COPIED={...TOKENS}; export type Spread=keyof typeof COPIED;';
  const write = (path: string, value: string): void => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), value);
  };
  write("tsconfig.json", JSON.stringify({ compilerOptions: { types: [] }, files: [producerPath] }));
  write(
    "packages/ui/tsconfig.json",
    JSON.stringify({ compilerOptions: { types: [], lib: ["es2022", "dom"] }, files: ["src/tokens/index.ts", "src/tokens/themes.gen.ts"] }),
  );
  write(producerPath, "export async function generateArtifacts(){return {tokensTs:''};}");
  write(outputPath, text);
  write(themesPath, themesText);
  execFixtureGit(scratch, ["init", "-q"]);
  const workspace = createSemanticWorkspace({ root: scratch });
  const sources = new Map<string, TypeHomeNativeSource>();
  for (const path of [producerPath, outputPath, themesPath]) {
    const source = workspace.sourceCorpus().getSourceFile(path);
    if (source === undefined) {
      throw new Error(`missing native source ${path}`);
    }
    const view = registeredSemanticSourceView(source);
    if (view === undefined) {
      throw new Error("unregistered native source");
    }
    sources.set(path, { view, program: source.getProject().getProgram().compilerObject, source: source.compilerNode, text: source.getFullText() });
  }
  const syntax = new Project({ useInMemoryFileSystem: true }).createSourceFile(`/syntax/${outputPath}`, text);
  const declaration = syntax.getTypeAliasOrThrow("TokenPath");
  const input = {
    path: outputPath,
    claim: "alias-or-schema" as const,
    generated: {
      sources,
      outputs: new Map([
        [outputPath, text],
        [themesPath, themesText],
      ]),
    },
  };
  for (const name of ["Borrowed", "Spread"]) {
    expect(judgeTypeHomeDeclaration(syntax.getTypeAliasOrThrow(name), input)).toMatchObject({ kind: "subject", ownership: { kind: "unqualified" } });
  }
  expect(judgeTypeHomeDeclaration(declaration, input)).toMatchObject({ kind: "subject", ownership: { kind: "generated-owned" } });
  expect(judgeTypeHomeDeclaration(declaration, { ...input, generated: { ...input.generated, outputs: new Map([[outputPath, `${text}\n`]]) } })).toMatchObject({
    kind: "refused",
  });
  expect(judgeTypeHomeDeclaration(declaration, { ...input, generated: { ...input.generated, sources: new Map() } })).toMatchObject({ kind: "refused" });
  const observed = new Map(TOKEN_GENERATION_INPUT_PATHS.map((path) => [path, "{}"]));
  for (const [path, capture] of sources) {
    observed.set(path, capture.text);
  }
  const reader = createResourceReader({ root: scratch, overlay: Object.fromEntries(observed) });
  const prepared = { status: "ready" as const, paths: [...observed.keys()], members: observed.size, value: { context: input.generated, observed } };
  expect(loadTokenGeneratedTypes(reader, prepared).status).toBe("ready");
  expect(loadTokenGeneratedTypes(reader, { ...prepared, value: { ...prepared.value, observed: new Map() } })).toMatchObject({
    status: "unresolved",
    reason: expect.stringContaining("not observed"),
  });
  expect(
    loadTokenGeneratedTypes(reader, {
      ...prepared,
      value: {
        ...prepared.value,
        context: {
          ...input.generated,
          outputs: new Map([
            [outputPath, text],
            [themesPath, `${themesText}\n`],
          ]),
        },
      },
    }),
  ).toMatchObject({ status: "unresolved" });
  expect(
    loadTokenGeneratedTypes(createResourceReader({ root: scratch, overlay: { ...Object.fromEntries(observed), [producerPath]: "changed" } }), prepared),
  ).toMatchObject({ status: "unresolved", reason: expect.stringContaining("changed after preparation") });
  const copiedPath = "packages/ui/src/tokens/copied.gen.ts";
  const copied = syntax.getProject().createSourceFile(`/syntax/${copiedPath}`, text);
  expect(judgeTypeHomeDeclaration(copied.getTypeAliasOrThrow("TokenPath"), { ...input, path: copiedPath })).toMatchObject({
    kind: "subject",
    ownership: { kind: "unqualified" },
  });
  const producer = sources.get(producerPath);
  if (producer === undefined) {
    throw new Error("missing producer capture");
  }
  const foreignSources = new Map(sources);
  foreignSources.set(outputPath, producer);
  expect(judgeTypeHomeDeclaration(declaration, { ...input, generated: { ...input.generated, sources: foreignSources } })).toMatchObject({ kind: "refused" });
  for (const [path, contents] of observed) {
    write(path, contents);
  }
  expect(
    await prepareTokenTypeGeneration(
      { root: scratch, project: syntax.getProject(), files: [syntax], nativeSourceView: (path) => sources.get(path)?.view },
      tokenTypeGenerationOwner({
        root: "/syntax",
        project: syntax.getProject(),
        policies: [inlineTypes],
        knownPolicies: [inlineTypes],
        requestedPaths: [outputPath],
        reviewedGrants: [],
        failOnWarnings: false,
      }),
    ),
  ).toMatchObject({ status: "unresolved", reason: expect.stringContaining("token producer preparation failed") });
  const nativeOutput = sources.get(outputPath);
  if (nativeOutput === undefined) {
    throw new Error("missing captured output");
  }
  nativeOutput.view.sourceFile.replaceWithText(`${text}\n`);
  expect(judgeTypeHomeDeclaration(declaration, input)).toMatchObject({ kind: "refused" });
});
