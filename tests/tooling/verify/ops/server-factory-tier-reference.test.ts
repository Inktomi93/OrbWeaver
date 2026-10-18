import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Node } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { vi } from "vitest";
import { readParserSignatureTypeExposures } from "../../../../tooling/src/floor/code-facts/shape-derivation.ts";
import {
  readParserReturnedTypeIdentities,
  readParserSignatureTypeIdentities,
  readParserTransparentAliasOrigin,
} from "../../../../tooling/src/floor/code-facts/type-member-origin.ts";
import type { NativeTypeIdentityGraphInput } from "../../../../tooling/src/floor/code-facts/type-member-origin-contract.ts";
import { withProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import { TYPED_NATIVE_COMPILER_CONTEXT_ENV } from "../../../../tooling/src/verify/lib/typed-native-inputs.ts";

const RULE = "orb/server-factory-tier-reference";
const FACTORY = `import type {Handle as Canonical} from "./contract.ts";
import type * as Shared from "./contract.ts";
type CanonicalAlias=Canonical;
type NamespaceAlias=Shared.Handle;
type VendorAlias=ArrayBuffer;
type Transformed=Readonly<Canonical>;
type Structural={readonly nested:Canonical};
export function canonical():CanonicalAlias{return {close(){}}}
export function namespaced():NamespaceAlias{return {close(){}}}
export function vendor(value:VendorAlias):void{}
export function transformed():Transformed{return {close(){}}}
export function structural():Structural{return {nested:{close(){}}}}
export interface LocalHandle {readonly close:()=>void}
export function create():LocalHandle{return {close(){}}}
export function nested(){return {slot:[create()]}}
export type LocalName=string;
export function named(value:LocalName):void{}
export function overloaded(value:LocalHandle):void;
export function overloaded(value:number):void;
export function overloaded(value:LocalHandle|number):void{}
export function union():LocalHandle|undefined{return undefined}
export async function awaited(){return {slot:create()}}
export function callbacks(){return {load:():LocalHandle=>create()}}
interface HiddenHandle {readonly close:()=>void}
type HiddenAlias=HiddenHandle;
export function aliasedPrivate():HiddenAlias{return {close(){}}}
export function privateCreate():HiddenHandle{return {close(){}}}
export function privateNested(){const value:HiddenHandle={close(){}};return {slot:value}}
interface BodyOnly {readonly close:()=>void}
export function bodyOnly():void{const unused:BodyOnly|undefined=undefined}
interface Unrelated {readonly close:()=>void}
type Phantom<T>={readonly stamp:number};
export function erased():Phantom<Unrelated>{return {stamp:1}}
`;

test("native importer ownership catches aliases, reexports, namespace and inferred nested signature exposure without rejecting erased or same-tier uses", async ({
  scratch,
  repoRoot,
}) => {
  const factory = "packages/server/src/infra/adapter/factory.ts";
  const bridge = "packages/server/src/transport/bridge.ts";
  const contract = "packages/server/src/infra/adapter/contract.ts";
  const contextHome = "packages/server/src/transport/trpc/context.ts";
  const envHome = "packages/server/src/foundation/env/contract.ts";
  const observabilityHome = "packages/server/src/foundation/observability/contract/logging.ts";
  const arbitraryEntry = "packages/server/src/entry/contract/wrong.ts";
  const arbitraryFoundation = "packages/server/src/foundation/arbitrary/contract.ts";
  const cases = [
    [
      "packages/server/src/entry/direct.ts",
      'import type {LocalHandle as Renamed} from "../infra/adapter/factory.ts";export function use(value:Renamed){return value}',
      true,
    ],
    ["packages/server/src/entry/nested.ts", 'import {nested as renamed} from "../transport/bridge.ts";export const value=renamed();', true],
    ["packages/server/src/entry/namespace.ts", 'import * as api from "../transport/bridge.ts";export const value=api.nested();', true],
    ["packages/server/src/entry/callback.ts", 'import {callbacks} from "../infra/adapter/factory.ts";export const value=callbacks();', true],
    ["packages/server/src/entry/name.ts", 'import {named} from "../infra/adapter/factory.ts";export const value=named;', true],
    ["packages/server/src/entry/overloaded.ts", 'import {overloaded} from "../infra/adapter/factory.ts";export const value=overloaded;', true],
    ["packages/server/src/entry/union.ts", 'import {union} from "../infra/adapter/factory.ts";export const value=union();', true],
    ["packages/server/src/entry/awaited.ts", 'import {awaited} from "../infra/adapter/factory.ts";export const value=awaited();', true],
    ["packages/server/src/entry/export-star.ts", 'export * from "../transport/bridge.ts";', true],
    ["packages/server/src/entry/export-namespace.ts", 'export * as api from "../transport/bridge.ts";', true],
    ["packages/server/src/entry/type-import.ts", 'export type Handle=import("../infra/adapter/factory.ts").LocalHandle;', true],
    ["packages/server/src/entry/contract.ts", 'import {create} from "../infra/adapter/contract.ts";export const value=create();', false],
    ["packages/server/src/entry/context.ts", 'import {create} from "../transport/trpc/context.ts";export const value=create();', false],
    ["packages/server/src/entry/env.ts", 'import {create} from "../foundation/env/contract.ts";export const value=create();', false],
    [
      "packages/server/src/entry/observability.ts",
      'import {create} from "../foundation/observability/contract/logging.ts";export const value=create();',
      false,
    ],
    ["packages/server/src/transport/arbitrary-entry.ts", 'import {create} from "../entry/contract/wrong.ts";export const value=create();', true],
    ["packages/server/src/entry/arbitrary-foundation.ts", 'import {create} from "../foundation/arbitrary/contract.ts";export const value=create();', true],
    ["packages/server/src/entry/missing.ts", 'import {missing} from "../infra/missing.ts";export const value=missing();', "unreadableFactoryExposure"],
    ["packages/server/src/entry/canonical-alias.ts", 'import {canonical} from "../infra/adapter/factory.ts";export const value=canonical();', false],
    ["packages/server/src/entry/namespace-alias.ts", 'import {namespaced} from "../infra/adapter/factory.ts";export const value=namespaced();', false],
    ["packages/server/src/entry/vendor-alias.ts", 'import {vendor} from "../infra/adapter/factory.ts";export const value=vendor;', false],
    ["packages/server/src/entry/transformed.ts", 'import {transformed} from "../infra/adapter/factory.ts";export const value=transformed();', true],
    ["packages/server/src/entry/structural.ts", 'import {structural} from "../infra/adapter/factory.ts";export const value=structural();', true],
    ["packages/server/src/entry/hidden-alias.ts", 'import {aliasedPrivate} from "../infra/adapter/factory.ts";export const value=aliasedPrivate();', 2],
    ["packages/server/src/entry/private.ts", 'import {privateCreate} from "../infra/adapter/factory.ts";export const value=privateCreate();', true],
    ["packages/server/src/entry/private-nested.ts", 'import {privateNested} from "../infra/adapter/factory.ts";export const value=privateNested();', true],
    ["packages/server/src/entry/body-only.ts", 'import {bodyOnly} from "../infra/adapter/factory.ts";bodyOnly();', false],
    ["packages/server/src/entry/erased.ts", 'import {erased} from "../infra/adapter/factory.ts";export const value=erased();', 1],
    ["packages/server/src/infra/local.ts", 'import {create} from "./adapter/factory.ts";export const value=create();', false],
  ] as const;
  const files: readonly (readonly [string, string])[] = [
    [factory, FACTORY],
    [bridge, 'export {nested} from "../infra/adapter/factory.ts";'],
    ...[contract, contextHome, envHome, observabilityHome, arbitraryEntry, arbitraryFoundation].map(
      (path) => [path, "export interface Handle {readonly close:()=>void};export function create():Handle{return {close(){}}}"] as const,
    ),
    ...cases.map(([path, text]) => [path, text] as const),
  ];
  for (const [path, text] of files) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const program = ts.createProgram(
    files.map(([path]) => join(scratch, path)),
    { strict: true, types: [], target: ts.ScriptTarget.ES2022, lib: ["lib.es2022.d.ts"] },
  );
  const eslint = new ESLint({ cwd: repoRoot });
  const config = await eslint.calculateConfigForFile(join(repoRoot, cases[0][0]));
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("native exposure acquired a Project");
  });
  try {
    const observations = new Map<string, readonly Linter.LintMessage[]>();
    for (const [path, text, flag] of cases) {
      const messages = new Linter({ cwd: scratch }).verify(
        text,
        {
          files: ["**/*.ts"],
          plugins: config.plugins,
          languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
          rules: { [RULE]: "error" },
        },
        { filename: join(scratch, path) },
      );
      observations.set(path, messages);
      expect(messages.filter((message) => message.messageId === "crossTierFactoryType").length, `${path}: ${JSON.stringify(messages)}`).toBe(
        typeof flag === "number" ? flag : Number(flag === true),
      );
      expect(messages.filter((message) => message.messageId === "unreadableFactoryExposure").length, path).toBe(flag === "unreadableFactoryExposure" ? 1 : 0);
      expect(
        messages.every((message) => message.messageId === "crossTierFactoryType" || (flag === "unreadableFactoryExposure" && message.messageId === flag)),
        path,
      ).toBe(true);
    }
    expect(observations.get("packages/server/src/entry/erased.ts")?.map((message) => message.message)).toEqual([
      expect.stringContaining("Factory type Phantom is local"),
    ]);
    expect([...observations.values()].flat().some((message) => message.message.includes("Unrelated"))).toBe(false);
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
}, 30_000);

test("isolated private inferred return carriers establish ownership without borrowing another factory signature", async ({ scratch, repoRoot }) => {
  const cases = [
    ["direct", "export function create():PrivateHandle{return {close(){}}}", "entry", 1],
    ["root", "export function create(){const value:PrivateHandle={close(){}};return value}", "entry", 1],
    ["nested", "export function create(){const value:PrivateHandle={close(){}};return {slot:value}}", "entry", 1],
    ["container", "export function create(){const value:PrivateHandle={close(){}};return {slot:[value]}}", "entry", 1],
    ["body", "export function create():void{const unused:PrivateHandle={close(){}}}", "entry", 0],
    ["constraint", "export function create<T extends PrivateHandle>():void{}", "entry", 0],
    ["erased", "export function create():Ignore<PrivateHandle>{return {stamp:1}}", "entry", 0],
    ["same-tier", "export function create(){const value:PrivateHandle={close(){}};return {slot:value}}", "infra", 0],
  ] as const;
  const contract = "packages/server/src/infra/adapter/contract.ts";
  const files: (readonly [string, string])[] = [[contract, "export type Ignore<T>={readonly stamp:number}"]];
  for (const [name, body, tier] of cases) {
    files.push([
      `packages/server/src/infra/adapter/${name}.ts`,
      `import type {Ignore} from "./contract.ts";interface PrivateHandle {readonly close:()=>void}\n${body}`,
    ]);
    files.push([
      `packages/server/src/${tier}/consumer-${name}.ts`,
      `import {create} from "${tier === "entry" ? "../infra" : "."}/adapter/${name}.ts";export const value=create();`,
    ]);
  }
  for (const [path, text] of files) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const program = ts.createProgram(
    files.map(([path]) => join(scratch, path)),
    { strict: true, types: [], target: ts.ScriptTarget.ES2022 },
  );
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, "packages/server/src/entry/consumer.ts"));
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("private returned-data ownership acquired a Project");
  });
  try {
    for (const [name, , tier, count] of cases) {
      const path = `packages/server/src/${tier}/consumer-${name}.ts`;
      const messages = new Linter({ cwd: scratch }).verify(
        readFileSync(join(scratch, path), "utf8"),
        {
          files: ["**/*.ts"],
          plugins: config.plugins,
          languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
          rules: { [RULE]: "error" },
        },
        { filename: join(scratch, path) },
      );
      expect(messages, name).toHaveLength(count);
      expect(
        messages.every((message) => message.messageId === "crossTierFactoryType" && message.message.includes("Factory type PrivateHandle is local")),
        name,
      ).toBe(true);
    }
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
}, 30_000);

test("signature exposure observes each native signature once and awaits only actual thenables", ({ scratch }) => {
  const path = join(scratch, "thenable.ts");
  writeFileSync(
    path,
    `interface Handle {readonly close:()=>void}
interface Thenable<T> {then(resolve:(value:T)=>void):void}
export function ordinary(value:{readonly n:number}):Handle{return {close(){}}}
export function promised():Thenable<Handle>{return {then(resolve){resolve({close(){}})}}}
export function mixed():Thenable<Handle>|number{return 1}
`,
  );
  const program = ts.createProgram([path], { strict: true, noLib: true, types: [] });
  const source = program.getSourceFile(path);
  if (source === undefined) {
    throw new Error("thenable source missing");
  }
  const checker = program.getTypeChecker();
  const parser = { kind: "parser" as const, program, source, checker };
  const awaitType = checker.getAwaitedType.bind(checker);
  const awaited = vi.spyOn(checker, "getAwaitedType").mockImplementation((type, ...rest) => {
    expect(checker.getPropertyOfType(type, "then")).toBeDefined();
    return awaitType(type, ...rest);
  });
  const signatureCounts = new Map<ts.Type, Map<ts.SignatureKind, number>>();
  const signatureTypes = checker.getSignaturesOfType.bind(checker);
  const signatures = vi.spyOn(checker, "getSignaturesOfType").mockImplementation((type, kind) => {
    const kinds = signatureCounts.get(type) ?? new Map<ts.SignatureKind, number>();
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    signatureCounts.set(type, kinds);
    return signatureTypes(type, kind);
  });
  try {
    const calls: number[] = [];
    for (const name of ["ordinary", "promised", "mixed"]) {
      const node = source.statements.find(
        (candidate): candidate is ts.FunctionDeclaration => ts.isFunctionDeclaration(candidate) && candidate.name?.text === name,
      );
      if (node === undefined) {
        throw new Error("thenable signature missing");
      }
      signatureCounts.clear();
      const graph = readParserSignatureTypeIdentities({ node, rootType: checker.getTypeAtLocation(node), parser });
      expect(
        graph.trace.declarations.some((declaration) => ts.isInterfaceDeclaration(declaration) && declaration.name.text === "Handle"),
        name,
      ).toBe(true);
      expect([...signatureCounts.values()].flatMap((kinds) => [...kinds.values()]).every((count) => count === 1)).toBe(true);
      calls.push(awaited.mock.calls.length);
    }
    expect(calls[0]).toBe(0);
    expect(calls[1]).toBeGreaterThan(0);
    expect(calls[2]).toBeGreaterThan(calls[1] ?? 0);
  } finally {
    signatures.mockRestore();
    awaited.mockRestore();
  }
});

test("native signature exposure refuses foreign checker, source, stale roots and expanding recursive aliases without inventing erased ownership", ({
  scratch,
}) => {
  const path = join(scratch, "native.ts");
  const text = `export interface Handle {readonly close:()=>void}
export type Name=string;
type Transparent=Handle;
type Generic=Ignore<Handle>;
type Ignore<T>={readonly stamp:number};
interface Recursive<T>{readonly next:Recursive<readonly [T]>}
export function positive(value:Name):Handle{return {close(){}}}
export function erased():Ignore<Handle>{return {stamp:1}}
export function recursive():Recursive<Handle>{throw new Error()}
export function partial(unreadable:unknown,retained:Handle):void{}
`;
  writeFileSync(path, text);
  const options = { strict: true, noLib: true, types: [] };
  const program = ts.createProgram([path], options);
  const foreign = ts.createProgram([path], options);
  const source = program.getSourceFile(path);
  const other = foreign.getSourceFile(path);
  if (source === undefined || other === undefined) {
    throw new Error("native epoch fixture missing");
  }
  const parser = { kind: "parser" as const, program, source, checker: program.getTypeChecker() };
  const declaration = (name: string): ts.FunctionDeclaration => {
    const found = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (found === undefined) {
      throw new Error(`native function ${name} missing`);
    }
    return found;
  };
  const observe = (name: string): NativeTypeIdentityGraphInput => {
    const node = declaration(name);
    return { node, rootType: parser.checker.getTypeAtLocation(node), parser };
  };
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("signature exposure acquired a Project");
  });
  try {
    const positive = readParserSignatureTypeExposures(observe("positive"));
    expect(positive.kind).toBe("resolved");
    expect(positive.trace.declarations.some((node) => node.getText().startsWith("export type Name="))).toBe(true);
    const erased = readParserSignatureTypeExposures(observe("erased"));
    expect(erased.kind).toBe("resolved");
    expect(erased.trace.declarations.some((node) => node.getText().startsWith("export interface Handle"))).toBe(false);
    const partial = readParserSignatureTypeExposures(observe("partial"));
    expect(partial).toMatchObject({ kind: "unresolved", detail: expect.stringContaining("unresolved native type") });
    expect(partial.trace.declarations.some((node) => ts.isInterfaceDeclaration(node) && node.name.text === "Handle")).toBe(true);
    const recursive = readParserSignatureTypeExposures(observe("recursive"));
    expect(recursive).toMatchObject({ kind: "unresolved", detail: expect.stringContaining("recursively expands") });
    const returnedInput = (name: string): NativeTypeIdentityGraphInput => {
      const node = declaration(name);
      const signature = parser.checker.getSignatureFromDeclaration(node);
      if (signature === undefined) {
        throw new Error("native returned-data signature missing");
      }
      return { node, rootType: parser.checker.getReturnTypeOfSignature(signature), parser };
    };
    const returned = returnedInput("positive");
    expect(readParserReturnedTypeIdentities(returned)).toMatchObject({ kind: "resolved" });
    const erasedData = readParserReturnedTypeIdentities(returnedInput("erased"));
    expect(erasedData.kind).toBe("resolved");
    expect(erasedData.trace.declarations.some((node) => node.getText().startsWith("export interface Handle"))).toBe(false);
    expect(readParserReturnedTypeIdentities(returnedInput("recursive"))).toMatchObject({
      kind: "unresolved",
      detail: expect.stringContaining("recursively expands"),
    });
    expect(readParserReturnedTypeIdentities({ ...returned, parser: { ...parser, checker: foreign.getTypeChecker() } })).toMatchObject({ kind: "unresolved" });
    expect(readParserReturnedTypeIdentities({ ...returned, parser: { ...parser, source: other } })).toMatchObject({ kind: "unresolved" });
    expect(readParserReturnedTypeIdentities({ ...returned, rootType: returnedInput("erased").rootType })).toMatchObject({ kind: "unresolved" });
    const input = observe("positive");
    expect(readParserSignatureTypeExposures({ ...input, parser: { ...parser, checker: foreign.getTypeChecker() } })).toMatchObject({ kind: "unresolved" });
    expect(readParserSignatureTypeExposures({ ...input, parser: { ...parser, source: other } })).toMatchObject({ kind: "unresolved" });
    expect(readParserSignatureTypeExposures({ ...input, rootType: parser.checker.getTypeAtLocation(declaration("erased")) })).toMatchObject({
      kind: "unresolved",
    });
    const stale = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true);
    expect(readParserSignatureTypeExposures({ ...input, node: stale })).toMatchObject({ kind: "unresolved" });
    expect(readParserReturnedTypeIdentities({ ...returned, node: stale })).toMatchObject({ kind: "unresolved" });
    const alias = source.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === "Transparent");
    const generic = source.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === "Generic");
    const staleAlias = stale.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === "Transparent");
    if (alias === undefined || generic === undefined || staleAlias === undefined) {
      throw new Error("native alias epoch fixture missing");
    }
    const origin = readParserTransparentAliasOrigin(alias, parser);
    expect(origin.kind).toBe("resolved");
    if (origin.kind !== "resolved") {
      throw new Error(origin.detail);
    }
    expect(origin.value.at(-1)?.name).toBe("Handle");
    expect(readParserTransparentAliasOrigin(generic, parser)).toMatchObject({ kind: "unresolved" });
    expect(readParserTransparentAliasOrigin(alias, { ...parser, checker: foreign.getTypeChecker() })).toMatchObject({ kind: "unresolved" });
    expect(readParserTransparentAliasOrigin(alias, { ...parser, source: other })).toMatchObject({ kind: "unresolved" });
    expect(readParserTransparentAliasOrigin(staleAlias, parser)).toMatchObject({ kind: "unresolved" });
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
});

test("native parser cache context accepts its configured Program, refuses a different roster and keeps unknown contexts active", async ({
  scratch,
  repoRoot,
}) => {
  const relative = "packages/server/src/entry/cache-context.ts";
  const path = join(scratch, relative);
  mkdirSync(dirname(path), { recursive: true });
  const text = "export interface Unowned {readonly value:string}";
  writeFileSync(path, text);
  const configPath = join(scratch, "tsconfig.owner.json");
  writeFileSync(configPath, JSON.stringify({ compilerOptions: { strict: true, noLib: true, types: [] }, files: [relative] }));
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {
        throw new Error("native owner config unreadable");
      },
    },
  );
  if (parsed === undefined) {
    throw new Error("native owner config missing");
  }
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  expect(program.getCompilerOptions()["configFilePath"]).toBe(configPath);
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, relative));
  const check = (): readonly Linter.LintMessage[] =>
    new Linter({ cwd: scratch }).verify(
      text,
      {
        files: ["**/*.ts"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
        rules: { "orb/type-home-direct-export": "error" },
      },
      { filename: path },
    );
  const owned = await withProcessEnv(TYPED_NATIVE_COMPILER_CONTEXT_ENV, JSON.stringify({ root: scratch, configs: ["tsconfig.owner.json"] }), () =>
    Promise.resolve(check()),
  );
  expect(owned).toMatchObject([{ ruleId: "orb/type-home-direct-export" }]);
  await expect(
    withProcessEnv(TYPED_NATIVE_COMPILER_CONTEXT_ENV, JSON.stringify({ root: scratch, configs: ["tsconfig.other.json"] }), () => Promise.resolve(check())),
  ).rejects.toThrow("does not match the admitted compiler cache context");
  const unknown = await withProcessEnv(TYPED_NATIVE_COMPILER_CONTEXT_ENV, JSON.stringify({ root: scratch, configs: null }), () => Promise.resolve(check()));
  expect(unknown).toMatchObject([{ ruleId: "orb/type-home-direct-export" }]);
}, 15_000);
