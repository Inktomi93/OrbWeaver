import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { createWrappedNode, Node, Project, SyntaxKind } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { vi } from "vitest";
import { serverFactoryTypeHome } from "../../../../tooling/src/floor/code-facts/server-factory-type-home.ts";
import {
  nativeGenericReferenceContributes,
  parserGenericReferenceContributes,
  readNativeGenericArgumentContribution,
  readParserGenericArgumentContribution,
} from "../../../../tooling/src/floor/code-facts/shape-derivation.ts";
import { TYPE_HOME_NATIVE_POLICY_ID } from "../../../../tooling/src/floor/code-facts/type-home.ts";
import { parserTypeOperations } from "../../../../tooling/src/floor/code-facts/type-member-origin-core.ts";
import { gate as interfaces } from "../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as aliases } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const PATH = "packages/server/src/foundation/observability/factory.ts";
const TIERS = ["entry", "transport", "infra", "foundation"] as const;
function declaredShape(source: ts.SourceFile, name: string): ts.InterfaceDeclaration | ts.TypeAliasDeclaration {
  const declaration = source.statements.find(
    (node): node is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text === name,
  );
  if (declaration === undefined) {
    throw new Error(`native fixture declaration ${name} missing`);
  }
  return declaration;
}
const SOURCE = `export interface Options {readonly enabled:boolean}
export interface Dependency {readonly run:()=>void}
export interface Handle {readonly stop:()=>void}
export interface Supporting {readonly limit:number}
interface Dependencies {readonly operation:Dependency;readonly support:Supporting}
export interface Unused {readonly run:()=>void}
export interface Shadow {readonly run:()=>void}
export interface BodyOnly {readonly run:()=>void}
export interface Erased {readonly run:()=>void}
type Ignore<T>={readonly kind:"ignored"};
export interface PayloadResponse {readonly value:string}
export type DataResponse={readonly value:string};
export interface Result {readonly value:string}
interface LocalOptions {readonly enabled:boolean}
export {LocalOptions as LocalAlias};
interface LocalUnused {readonly n:number}
export {LocalUnused as PublicUnused};
type LocalWireResponse={readonly value:string};
export {LocalWireResponse};
export type NestedOptions=Readonly<Options>;
export interface InferredHandle {readonly close:()=>void}
export interface AsyncHandle {readonly finish:()=>void}
export interface MethodHandle {readonly finish:()=>void}
export interface AnnotatedAsyncHandle {readonly finish:()=>void}
export interface MapPayload {readonly n:number}
export interface MapHandle {readonly entries:Map<string,MapPayload>}
export interface MergedErased {readonly finish:()=>void}
interface Merged<T>{readonly label:string}
interface RecursiveIgnored<T>{readonly next:RecursiveIgnored<readonly [T]>}
export interface RecursiveErased {readonly finish:()=>void}
export function recursive(value:RecursiveIgnored<RecursiveErased>):void{}
interface Merged<T>{readonly finish:()=>void}
declare const Merged:{new<T>():T};
export interface ConstructorOptions {readonly n:number}
export interface AmbientOptions {readonly n:number}
declare class Ambient {constructor(options:AmbientOptions)}
class Local {constructor(options:ConstructorOptions){}}
export function merged(value:Merged<MergedErased>):void{}
export function mapped():MapHandle{return {entries:new Map()}}
export function create(options:Options,deps:Dependencies):Handle{return {stop:deps.operation.run}}
export function nested(value:NestedOptions):void{}
export function inferred(){const handle:InferredHandle={close(){}};return handle}
export async function inferredAsync(){const handle:AsyncHandle={finish(){}};return handle}
export const objectMethod={method():MethodHandle{return {finish(){}}}};
export async function annotatedAsync():Promise<AnnotatedAsyncHandle>{return {finish(){}}}
export function local(value:LocalOptions):void{}
export function localWire():LocalWireResponse{return {value:"wire"}}
export function bareWire():Result{return {value:"wire"}}
export function data():DataResponse{return {value:"wire"}}
export function wire():PayloadResponse{return {value:"wire"}}
export function shadow<Shadow>(value:Shadow):Shadow{return value}
export function body():void{const unused:BodyOnly|undefined=undefined}
export function ignored(value:Ignore<Erased>):void{}
`;

test("factory ownership computes once per actual source, preserves query population and refuses changed checker/source or predicate epochs", async ({
  scratch,
}) => {
  const shapeDerivation = await import("../../../../tooling/src/floor/code-facts/shape-derivation.ts");
  const origins = await import("../../../../tooling/src/floor/code-facts/type-member-origin.ts");
  const path = join(scratch, PATH);
  mkdirSync(dirname(path), { recursive: true });
  const text = `export interface Options {readonly enabled:boolean}
export interface Handle {readonly close:()=>void}
export interface DataResponse {readonly value:string}
export function create(options:Options):Handle{return {close(){}}}
export function wire():DataResponse{return {value:"wire"}}
`;
  writeFileSync(path, text);
  const options = { noLib: true, strict: true, types: [] };
  const program = ts.createProgram([path], options);
  const source = program.getSourceFile(path);
  if (source === undefined) {
    throw new Error("factory source epoch missing");
  }
  const parser = { kind: "parser" as const, program, source, checker: program.getTypeChecker() };
  const signatures = vi.spyOn(parser.checker, "getSignatureFromDeclaration");
  const predicate = vi.spyOn(shapeDerivation, "parserGenericReferenceContributes");
  const returned = vi.spyOn(origins, "readParserReturnedTypeIdentities");
  try {
    expect(serverFactoryTypeHome(declaredShape(source, "Options"), PATH, parser)).toBe(true);
    const first = signatures.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    expect(serverFactoryTypeHome(declaredShape(source, "Handle"), PATH, parser)).toBe(true);
    expect(serverFactoryTypeHome(declaredShape(source, "DataResponse"), PATH, parser)).toBe(false);
    expect(serverFactoryTypeHome(declaredShape(source, "Options"), "packages/server/src/primitives/other.ts", parser)).toBe(false);
    expect(signatures).toHaveBeenCalledTimes(first);
    predicate.mockRestore();
    expect(serverFactoryTypeHome(declaredShape(source, "Options"), PATH, parser)).toBe(true);
    expect(signatures.mock.calls.length).toBeGreaterThan(first);
    const rebound = signatures.mock.calls.length;
    expect(returned).toHaveBeenCalled();
    returned.mockRestore();
    expect(serverFactoryTypeHome(declaredShape(source, "Options"), PATH, parser)).toBe(true);
    expect(signatures.mock.calls.length).toBeGreaterThan(rebound);
    writeFileSync(path, text.replace("options:Options", "options:number"));
    const changed = ts.createProgram([path], options);
    const changedSource = changed.getSourceFile(path);
    if (changedSource === undefined) {
      throw new Error("changed factory source missing");
    }
    const current = { kind: "parser" as const, program: changed, source: changedSource, checker: changed.getTypeChecker() };
    expect(serverFactoryTypeHome(declaredShape(changedSource, "Options"), PATH, current)).toBe(false);
    expect(() => serverFactoryTypeHome(declaredShape(source, "Options"), PATH, current)).toThrow("foreign or stale");
    expect(() => serverFactoryTypeHome(declaredShape(source, "Options"), PATH, { ...parser, checker: current.checker })).toThrow("foreign or stale");
  } finally {
    returned.mockRestore();
    predicate.mockRestore();
    signatures.mockRestore();
  }
});

test("native factory placement uses the parser Program and retains direct/export-list wire, erased, shadowed, body-only and unused accusations", async ({
  scratch,
  repoRoot,
}) => {
  const paths = TIERS.map((tier) => `packages/server/src/${tier}/factory.ts`);
  for (const path of paths) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), SOURCE);
  }
  const program = ts.createProgram(
    paths.map((path) => join(scratch, path)),
    { strict: true, types: [], target: ts.ScriptTarget.ES2022, lib: ["lib.es2022.d.ts"] },
  );
  const eslint = new ESLint({ cwd: repoRoot });
  const configs = await Promise.all(paths.map((path) => eslint.calculateConfigForFile(join(repoRoot, path))));
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("native factory placement acquired a morph Project");
  });
  try {
    for (const [index, path] of paths.entries()) {
      const config = configs[index];
      if (config === undefined) {
        throw new Error("native type-home configuration missing");
      }
      const messages = new Linter({ cwd: scratch }).verify(
        SOURCE,
        {
          files: ["**/*.ts"],
          plugins: config.plugins,
          languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
          rules: { [`orb/${TYPE_HOME_NATIVE_POLICY_ID}`]: "error" },
        },
        { filename: join(scratch, path) },
      );
      expect(
        messages
          .map((message) => SOURCE.split("\n")[message.line - 1]?.slice(message.column - 1, (message.endColumn ?? message.column) - 1))
          .toSorted((left, right) => String(left).localeCompare(String(right))),
        path,
      ).toEqual([
        "AmbientOptions",
        "BodyOnly",
        "DataResponse",
        "Erased",
        "LocalUnused",
        "LocalWireResponse",
        "MergedErased",
        "PayloadResponse",
        "RecursiveErased",
        "Result",
        "Shadow",
        "Unused",
      ]);
    }
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
}, 30_000);

test("parser generic observations retain canonical substitution while refusing foreign source, stale nodes and mismatched checker owners", ({ scratch }) => {
  const path = join(scratch, PATH);
  mkdirSync(dirname(path), { recursive: true });
  const genericSource = `${SOURCE}\ntype RetainedOptions=NonNullable<Options>;`;
  writeFileSync(path, genericSource);
  const options = { strict: true, types: [], target: ts.ScriptTarget.ES2022, lib: ["lib.es2022.d.ts"] };
  const program = ts.createProgram([path], options);
  const foreign = ts.createProgram([path], options);
  const source = program.getSourceFile(path);
  const other = foreign.getSourceFile(path);
  if (source === undefined || other === undefined) {
    throw new Error("native parser sources missing");
  }
  const parser = { kind: "parser" as const, program, source, checker: program.getTypeChecker() };
  const alias = declaredShape(source, "RetainedOptions");
  if (!(ts.isTypeAliasDeclaration(alias) && ts.isTypeReferenceNode(alias.type))) {
    throw new Error("native fixture alias missing");
  }
  const reference = alias.type;
  const argument = reference.typeArguments?.[0];
  if (argument === undefined || !ts.isTypeReferenceNode(argument) || !ts.isIdentifier(argument.typeName)) {
    throw new Error("generic argument binding missing");
  }
  const binding = argument.typeName;
  const input = { reference, argument, binding };
  const morphProject = new Project({ useInMemoryFileSystem: true });
  const morphSource = morphProject.createSourceFile(path, genericSource);
  const morphProgram = morphProject.getProgram().compilerObject;
  const morphReference = morphSource.getTypeAliasOrThrow("RetainedOptions").getTypeNodeOrThrow().asKindOrThrow(SyntaxKind.TypeReference);
  const morphArgument = morphReference.getTypeArguments()[0];
  if (morphArgument === undefined) {
    throw new Error("Morph fixture argument missing");
  }
  const morphContribution = readNativeGenericArgumentContribution({
    reference: morphReference,
    argument: morphArgument,
    binding: morphArgument.asKindOrThrow(SyntaxKind.TypeReference).getTypeName(),
    program: morphProgram,
    source: morphSource.compilerNode,
  });
  expect(morphContribution).toMatchObject({ kind: "resolved", value: { contributes: true } });
  expect(morphContribution.trace.declarations.some((node) => node === morphSource.getInterfaceOrThrow("Options"))).toBe(true);
  const mappedReference = morphSource.getTypeAliasOrThrow("NestedOptions").getTypeNodeOrThrow().asKindOrThrow(SyntaxKind.TypeReference);
  const mappedArgument = mappedReference.getTypeArguments()[0];
  if (mappedArgument === undefined) {
    throw new Error("Morph mapped fixture argument missing");
  }
  expect(
    readNativeGenericArgumentContribution({ reference: mappedReference, argument: mappedArgument, program: morphProgram, source: morphSource.compilerNode }),
  ).toMatchObject({ kind: "resolved", value: { contributes: true } });
  const morphBinding = morphArgument.asKindOrThrow(SyntaxKind.TypeReference).getTypeName().asKindOrThrow(SyntaxKind.Identifier);
  const otherMorph = morphProject.createSourceFile("/other-native-epoch.ts", "export interface Options {readonly enabled:boolean}");
  expect(nativeGenericReferenceContributes(morphBinding, { program: morphProgram, source: otherMorph.compilerNode })).toBe(false);
  const standalone = createWrappedNode(morphSource.compilerNode, { sourceFile: morphSource.compilerNode, typeChecker: morphProgram.getTypeChecker() });
  const standaloneReference = standalone.getTypeAliasOrThrow("RetainedOptions").getTypeNodeOrThrow().asKindOrThrow(SyntaxKind.TypeReference);
  const standaloneArgument = standaloneReference.getTypeArguments()[0];
  if (standaloneArgument === undefined) {
    throw new Error("standalone Morph argument missing");
  }
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("standalone wrapper has no morph Project");
  });
  try {
    expect(() =>
      readNativeGenericArgumentContribution({
        reference: standaloneReference,
        argument: standaloneArgument,
        program: morphProgram,
        source: morphSource.compilerNode,
      }),
    ).toThrow("standalone wrapper has no morph Project");
    project.mockClear();
    const parserContribution = readParserGenericArgumentContribution({ ...input, parser });
    expect(parserContribution).toMatchObject({ kind: "resolved", value: { contributes: true } });
    expect(parserContribution.trace.declarations.some((node) => node === declaredShape(source, "Options"))).toBe(true);
    const mappedAlias = declaredShape(source, "NestedOptions");
    if (!(ts.isTypeAliasDeclaration(mappedAlias) && ts.isTypeReferenceNode(mappedAlias.type))) {
      throw new Error("parser mapped reference missing");
    }
    const mappedInput = mappedAlias.type.typeArguments?.[0];
    if (mappedInput === undefined) {
      throw new Error("parser mapped argument missing");
    }
    expect(readParserGenericArgumentContribution({ reference: mappedAlias.type, argument: mappedInput, parser })).toMatchObject({
      kind: "resolved",
      value: { contributes: true },
    });
    expect(parserGenericReferenceContributes(binding, parser)).toBe(true);
    expect(readParserGenericArgumentContribution({ ...input, parser: { ...parser, checker: foreign.getTypeChecker() } })).toMatchObject({ kind: "unresolved" });
    expect(readParserGenericArgumentContribution({ ...input, parser: { ...parser, source: other } })).toMatchObject({ kind: "unresolved" });
    expect(() => serverFactoryTypeHome(alias, PATH, { ...parser, checker: foreign.getTypeChecker() })).toThrow("foreign or stale");
    const stale = ts.createSourceFile(path, SOURCE, ts.ScriptTarget.ES2022, true);
    expect(() => serverFactoryTypeHome(declaredShape(stale, "NestedOptions"), PATH, parser)).toThrow("foreign or stale");
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
});

test("the qualified native population preserves founding tier findings, nonserver direct-only admission and exact line authority", async ({
  scratch,
  repoRoot,
}) => {
  const files = {
    "packages/server/src/entry/compose/chat.ts": "export interface ChatComposeResult {readonly a:string}",
    "packages/server/src/infra/storage/cas.ts": "export interface PutResult {readonly hash:string}",
    "packages/server/src/foundation/env/bind.ts": "export interface BindPosture {readonly host:string}",
    "packages/server/src/transport/trpc/x.ts": "export interface Frame {readonly n:number}",
    "packages/server/src/entry/contract/wrong.ts":
      "export interface EntryDirect {readonly n:number}\ninterface EntryList {readonly n:number}\nexport {EntryList};",
    "packages/server/src/foundation/arbitrary/contract.ts":
      "export interface FoundationDirect {readonly n:number}\ninterface FoundationList {readonly n:number}\nexport {FoundationList};",
    "packages/inference/src/backends/other.ts": "export interface Direct {readonly n:number}\ninterface Local{readonly n:number}\nexport {Local};",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const program = ts.createProgram(
    Object.keys(files).map((path) => join(scratch, path)),
    { strict: true, types: [], noLib: true },
  );
  const eslint = new ESLint({ cwd: repoRoot });
  const rule = `orb/${TYPE_HOME_NATIVE_POLICY_ID}`;
  const names: (string | undefined)[] = [];
  for (const [path, text] of Object.entries(files)) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    expect(config.rules[rule]).toEqual([2]);
    const messages = new Linter({ cwd: scratch }).verify(
      text,
      {
        files: ["**/*.ts"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
        rules: { [rule]: "error" },
      },
      { filename: join(scratch, path) },
    );
    names.push(...messages.map((message) => text.split("\n")[message.line - 1]?.slice(message.column - 1, (message.endColumn ?? message.column) - 1)));
  }
  expect(names.toSorted((left, right) => String(left).localeCompare(String(right)))).toEqual([
    "BindPosture",
    "ChatComposeResult",
    "Direct",
    "EntryDirect",
    "EntryList",
    "FoundationDirect",
    "FoundationList",
    "Frame",
    "PutResult",
  ]);
  for (const path of [
    "packages/server/src/primitives/other.ts",
    "packages/server/src/infra/storage/contract.ts",
    "packages/server/src/transport/trpc/contract/other.ts",
    "packages/server/src/foundation/env/contract.ts",
    "packages/server/src/entry/other.gen.ts",
    "packages/server/src/domain/probe/other.test.ts",
  ]) {
    expect((await eslint.calculateConfigForFile(join(repoRoot, path)))?.rules?.[rule], path).toBeUndefined();
  }
  for (const path of [
    "packages/server/src/infra/contract.ts",
    "packages/server/src/entry/contract/other.ts",
    "packages/server/src/transport/contract/other.ts",
    "packages/server/src/foundation/other/contract.ts",
  ]) {
    expect((await eslint.calculateConfigForFile(join(repoRoot, path)))?.rules?.[rule], path).toEqual([2]);
  }
  const subject = "packages/server/src/infra/authority.ts";
  const text = `// eslint-disable-next-line ${rule} -- Parsed positional-authority control.\nexport interface First {readonly n:number}\nexport interface Adjacent {readonly n:number}`;
  const authorityPath = join(scratch, subject);
  writeFileSync(authorityPath, text);
  const config = await eslint.calculateConfigForFile(join(repoRoot, subject));
  const check = (source: string): readonly Linter.LintMessage[] => {
    writeFileSync(authorityPath, source);
    const owner = ts.createProgram([authorityPath], { noLib: true, types: [], strict: true });
    return new Linter({ cwd: scratch }).verify(
      source,
      {
        files: ["**/*.ts"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [owner], projectService: false } },
        linterOptions: { reportUnusedDisableDirectives: "error" },
        rules: { [rule]: "error" },
      },
      { filename: authorityPath },
    );
  };
  expect(check(text)).toMatchObject([{ line: 3, ruleId: rule }]);
  expect(check(text.replace("export interface First", "interface First"))).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    { line: 3, ruleId: rule },
  ]);
  expect(check(text.replace(rule, `${rule}-wrong`))).toHaveLength(3);
  expect(() =>
    new Linter({ cwd: scratch }).verify(
      "export interface First{}",
      {
        files: ["**/*.ts"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
        rules: { [rule]: "error" },
      },
      { filename: authorityPath },
    ),
  ).toThrow("owning TypeScript Program");
}, 30_000);

test("custom declaration owners delegate only covered server alias/interface populations without consulting the syntax checker", () => {
  const root = "/factory-custom-delegation";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const tier of TIERS) {
    project.createSourceFile(`${root}/packages/server/src/${tier}/factory.ts`, SOURCE);
  }
  project.createSourceFile(`${root}/packages/server/src/infra/retained.gen.ts`, "export interface Retained {readonly n:number}");
  project.createSourceFile(`${root}/packages/inference/src/backends/retained.ts`, "interface Local {readonly n:number};export {Local};");
  const checker = vi.spyOn(project, "getTypeChecker").mockImplementation(() => {
    throw new Error("custom factory ownership consulted a syntax checker");
  });
  try {
    const policies = [aliases, interfaces];
    const result = runPolicyPass({ root, project, knownPolicies: policies, policies, reviewedGrants: [], failOnWarnings: false });
    expect(result.toolErrors).toEqual([]);
    expect(
      result.authority.effectiveFindings.map((finding) => [finding.policyId, finding.token]).toSorted((left, right) => left.join().localeCompare(right.join())),
    ).toEqual([
      ["no-inline-package-interface", "Local"],
      ["no-inline-package-interface", "Retained"],
    ]);
    expect(checker).not.toHaveBeenCalled();
  } finally {
    checker.mockRestore();
  }
});

test("native indexed and mapped projections qualify while installed Hono retains refusal and erased or transformed mappings grant no ownership", ({
  scratch,
  repoRoot,
}) => {
  symlinkSync(join(repoRoot, "packages/server/node_modules"), join(scratch, "node_modules"), "dir");
  const relative = "packages/server/src/entry/registrar.ts";
  const path = join(scratch, relative);
  mkdirSync(dirname(path), { recursive: true });
  const text = `import type {Hono} from "hono";
export interface PrincipalEnv {Variables:{readonly principal:string}}
export interface DirectEnv {Variables:{readonly direct:string}}
export interface InheritedEnv {Variables:{readonly inherited:number}}
export interface MappedEnv {Variables:{readonly mapped:boolean}}
export interface IntersectionEnv {Variables:{readonly intersection:string}}
interface AmbientVariables {}
class IntersectionMapped<T extends {Variables:object}>{readonly values!:Readonly<AmbientVariables & T["Variables"]>}
export function intersection(value:IntersectionMapped<IntersectionEnv>):void{}
class Mapped<T extends {Variables:object}>{readonly values!:Readonly<T["Variables"]>}
export function mapped(value:Mapped<MappedEnv>):void{}
class Projected<T extends {Variables:object}>{readonly values!:T["Variables"]}
class InheritedProjection<T extends {Variables:object}> extends Projected<T>{}
export function projected(value:Projected<DirectEnv>):void{}
export function inheritedProjection(value:InheritedProjection<InheritedEnv>):void{}
export function register(app:Hono<PrincipalEnv>):void{}
export interface DirectErased {readonly close:()=>void}
export interface InheritedErased {readonly close:()=>void}
export interface ConstraintOnly {readonly close:()=>void}
export interface BodyOnly {readonly close:()=>void}
export interface RemappedEnv {Variables:{readonly remapped:string}}
export interface ChangedFieldEnv {Variables:{readonly changed:string}}
export interface ErasedMappedEnv {Variables:{readonly erased:string}}
type Remap<T>={[P in keyof T as \`renamed-\${P & string}\`]:T[P]};
type Changed<T>={[P in keyof T]:number};
type ErasedMap<T>={readonly label:string};
class Remapped<T extends {Variables:object}>{readonly values!:Remap<T["Variables"]>}
class ChangedField<T extends {Variables:object}>{readonly values!:Changed<T["Variables"]>}
class ErasedMapped<T extends {Variables:object}>{readonly values!:ErasedMap<T["Variables"]>}
export function remapped(value:Remapped<RemappedEnv>):void{}
export function changedField(value:ChangedField<ChangedFieldEnv>):void{}
export function erasedMapped(value:ErasedMapped<ErasedMappedEnv>):void{}
class Empty<T>{readonly label="empty"}
class Inherited<T> extends Empty<T>{}
class Constraint<T extends ConstraintOnly>{readonly label="constraint"}
class Body<T>{run():void{const unused:T|undefined=undefined}}
export function direct(value:Empty<DirectErased>):void{}
export function inherited(value:Inherited<InheritedErased>):void{}
export function constrained(value:Constraint<ConstraintOnly>):void{}
export function body(value:Body<BodyOnly>):void{}
`;
  writeFileSync(path, text);
  const program = ts.createProgram([path], {
    strict: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  });
  const source = program.getSourceFile(path);
  if (source === undefined) {
    throw new Error("Hono registrar fixture missing");
  }
  const parser = { kind: "parser" as const, program, source, checker: program.getTypeChecker() };
  const registrar = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "register");
  const reference = registrar?.parameters[0]?.type;
  if (reference === undefined || !ts.isTypeReferenceNode(reference)) {
    throw new Error("Hono reference missing");
  }
  expect(parserTypeOperations(parser).flags(parser.checker.getTypeAtLocation(reference)).any).toBe(false);
  const symbol = parser.checker.getSymbolAtLocation(reference.typeName);
  const origin = symbol === undefined ? undefined : parser.checker.getAliasedSymbol(symbol).declarations?.[0];
  expect(origin?.getSourceFile().fileName).toMatch(/hono\/dist\/types\/hono\.d\.ts$/u);
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("native class contribution acquired Project");
  });
  try {
    const argument = reference.typeArguments?.[0];
    if (argument === undefined || !ts.isTypeReferenceNode(argument) || !ts.isIdentifier(argument.typeName)) {
      throw new Error("Hono env argument missing");
    }
    for (const name of ["DirectEnv", "InheritedEnv", "MappedEnv", "IntersectionEnv"]) {
      expect(serverFactoryTypeHome(declaredShape(source, name), relative, parser), name).toBe(true);
    }
    for (const name of ["DirectErased", "InheritedErased", "ConstraintOnly", "BodyOnly", "RemappedEnv", "ChangedFieldEnv", "ErasedMappedEnv", "PrincipalEnv"]) {
      expect(serverFactoryTypeHome(declaredShape(source, name), relative, parser), name).toBe(false);
    }
    const contribution = readParserGenericArgumentContribution({ reference, argument, binding: argument.typeName, parser });
    expect(contribution).toMatchObject({
      kind: "unresolved",
      detail: "native formal has no substituted member/signature contribution to this binding",
    });
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
}, 15_000);
