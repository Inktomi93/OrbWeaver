import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { vi } from "vitest";
import { readServerPublicBoundary } from "../../../../tooling/src/floor/code-facts/server-public-boundary.ts";

const RULE = "orb/server-factory-tier-reference";

test("public declaration boundaries refuse inference and reflection, retain erased arguments and inspect nested external augmentation without type expansion", async ({
  scratch,
  repoRoot,
}) => {
  const factory = "packages/server/src/infra/adapter/factory.ts";
  const cases = [
    ["entry/inferred", "inferred", "unreadableFactoryExposure"],
    ["entry/platform", "platform", null],
    ["entry/actual", "actual", "crossTierFactoryType"],
    ["entry/erased", "erased", null],
    ["entry/augmented", "augmented", "crossTierFactoryType"],
    ["entry/reflected", "reflected", "unreadableFactoryExposure"],
    ["infra/local", "inferred", null],
    ["entry/actual", "repeated", "crossTierFactoryType"],
    ["entry/actual", "callback", "crossTierFactoryType"],
    ["entry/actual", "inherited", "crossTierFactoryType"],
    ["entry/inferred", "getter", "unreadableFactoryExposure"],
    ["entry/erased", "shadow", null],
    ["entry/erased", "constrained", null],
    ["entry/erased", "complexErased", "unreadableFactoryExposure"],
    ["entry/reflected", "partial", "crossTierFactoryType"],
    ["entry/augmented", "Contaminated", "crossTierFactoryType"],
    ["entry/erased", "inheritedErased", "unreadableFactoryExposure"],
    ["entry/reflected", "reflectedValue", "unreadableFactoryExposure"],
    ["entry/erased", "externalErased", "unreadableFactoryExposure"],
    ["entry/erased", "boxedErased", "unreadableFactoryExposure"],
    ["entry/reflected", "externalInferred", "unreadableFactoryExposure"],
    ["entry/erased", "privateClass", null],
    ["entry/erased", "PrivateClass", null],
    ["entry/actual", "PublicClass", "crossTierFactoryType"],
    ["entry/inferred", "parameterClass", "unreadableFactoryExposure"],
    ["entry/augmented", "opaqueAugmented", "unreadableFactoryExposure"],
    ["entry/platform", "opaqueSafe", null],
    ["entry/augmented", "mixed", "finding-and-refusal"],
    ["entry/platform", "opaqueNativeSafe", null],
    ["entry/augmented", "opaqueKey", "unreadableFactoryExposure"],
    ["entry/inferred", "inferredField", "unreadableFactoryExposure"],
    ["entry/inferred", "inferredProperty", "finding-and-refusal"],
    ["entry/actual", "defaultActual", "crossTierFactoryType"],
    ["entry/erased", "replacedDefault", null],
    ["entry/erased", "unusedDefault", null],
    ["entry/erased", "importErased", null],
    ["entry/actual", "importActual", "crossTierFactoryType"],
    ["entry/inferred", "dependentDefault", "unreadableFactoryExposure"],
    ["entry/platform", "nativeBytes", null],
    ["entry/platform", "canonicalVocabulary", null],
    ["entry/augmented", "canonicalContamination", "unreadableFactoryExposure"],
    ["entry/actual", "canonicalDirect", "crossTierFactoryType"],
    ["entry/actual", "mergedPrivateDefault", "crossTierFactoryType"],
    ["entry/erased", "mergedReplacement", null],
    ["entry/platform", "opaqueInputs", null],
    ["entry/platform", "forwardedPhantom", null],
    ["entry/platform", "nativeGenericNeutral", null],
    ["entry/augmented", "outerPrivate", "unreadableFactoryExposure"],
    ["entry/augmented", "unsafeGenericAugmentation", "unreadableFactoryExposure"],
    ["entry/inferred", "unknownLexicalOwner", "unreadableFactoryExposure"],
  ] as const;
  const files = new Map<string, string>([
    [
      factory,
      `import type {TypeIdOf} from "../../../../kit/src/fixture.ts";
import type {Canonical,Contaminated as CanonicalContaminated,MergedDefault} from "../../../../contracts/src/fixture.ts";
import type {Ignore,Wrapped,Inherited,Box,UnknownBox,Safe,Default} from "./contract.ts";
import type {Public,PublicErased,PublicInferred,Neutral,Keyed,UnknownLexical} from "boundary-package";
export const privateKey:unique symbol=Symbol("fixture");
export interface Handle {readonly close:()=>void}
interface Unrelated {readonly close:()=>void}
export function inferred(){return {nested:{value:1}}}
export function platform():Promise<Response>{return Promise.resolve(new Response())}
export function actual():Promise<Handle>{return Promise.resolve({close(){}})}
export function erased():Ignore<Unrelated>{return {stamp:1}}
export function augmented():Public{throw new Error("fixture")}
export function reflected():ReturnType<typeof inferred>{return inferred()}
export function repeated():readonly [Promise<Response>,Promise<Handle>]{throw new Error("fixture")}
export function callback(value:()=>Handle):void{}
class Base {read():Handle{return {close(){}}}}
class Derived extends Base {}
export function inherited():Derived{return new Derived()}
class Getter {get current(){return {value:1}}}
export function getter():Getter{return new Getter()}
export function shadow<Handle>(value:Handle):Handle{return value}
export function constrained<T extends Handle>():void{}
export function complexErased():Wrapped<Unrelated>{return {stamp:1}}
export function partial(value:unknown, retained:Handle):void{}
export function inheritedErased():Inherited<Unrelated>{return {stamp:1}}
export function reflectedValue():typeof Response{return Response}
export function externalErased():PublicErased{return {stamp:1}}
export function boxedErased():Box<Unrelated>{return {value:{stamp:1}}}
export function externalInferred():PublicInferred{return {close(){}}}
export class PrivateClass {#hidden!:Handle;private soft!:Handle;protected inherited!:Handle;read():number{return 1}}
export function privateClass():PrivateClass{return new PrivateClass()}
export class PublicClass {readonly visible!:Handle;read():number{return 1}}
class ParameterClass {constructor(readonly visible:Handle){}}
export function parameterClass():ParameterClass{return new ParameterClass({close(){}})}
export function opaqueAugmented():UnknownBox<Public>{return {ignored:{stamp:1}}}
export function opaqueSafe():UnknownBox<Safe>{return {ignored:{stamp:1}}}
export function mixed():readonly [UnknownBox<Public>,Promise<Public>]{throw new Error("fixture")}
export function opaqueNativeSafe():UnknownBox<Neutral>{return {ignored:{stamp:1}}}
export function opaqueKey():UnknownBox<Keyed>{return {ignored:{stamp:1}}}
function make():Handle{return {close(){}}}
class InferredField {readonly visible=make()}
interface InferredProperty {readonly visible}
export function inferredField():InferredField{return new InferredField()}
export function inferredProperty():InferredProperty{throw new Error("fixture")}
export function defaultActual():Default{throw new Error("fixture")}
export function replacedDefault():import("./contract.ts").Default<number>{return {value:1}}
export function unusedDefault():import("./contract.ts").IgnoredDefault{return {stamp:1}}
export function importErased():import("./contract.ts").Ignore<Unrelated>{return {stamp:1}}
export function importActual():import("./contract.ts").Default<Handle>{return {value:make()}}
export function dependentDefault():import("./contract.ts").Dependent<Handle>{throw new Error("fixture")}
export function nativeBytes():Uint8Array{return new Uint8Array()}
export function canonicalVocabulary():UnknownBox<Canonical>{return {ignored:{stamp:1}}}
export function canonicalContamination():UnknownBox<CanonicalContaminated>{return {ignored:{stamp:1}}}
export function canonicalDirect():CanonicalContaminated{throw new Error("fixture")}
export function mergedPrivateDefault():MergedDefault{throw new Error("fixture")}
export function mergedReplacement():MergedDefault<number>{return {value:1}}
export function opaqueInputs(value:unknown,record:Record<string,unknown>):void{}
export function forwardedPhantom<P extends string>():UnknownBox<TypeIdOf<P>>{return {ignored:{stamp:1}}}
export function nativeGenericNeutral<K,V>():UnknownBox<Map<K,V>>{return {ignored:{stamp:1}}}
export type PrivateName=string;
export function privateName(value:PrivateName):void{}
export function outerPrivate():UnknownBox<TypeIdOf<PrivateName>>{return {ignored:{stamp:1}}}
export function unsafeGenericAugmentation():UnknownBox<WeakMap<object,string>>{return {ignored:{stamp:1}}}
export function unknownLexicalOwner():UnknownBox<UnknownLexical>{return {ignored:{stamp:1}}}
`,
    ],
    [
      "packages/server/src/infra/adapter/contract.ts",
      'export type Ignore<T>={readonly stamp:number};export type Wrapped<T>=Ignore<T>;export interface Box<T> {readonly value:Ignore<T>}export interface UnknownBox<T>{readonly ignored:Ignore<T>}export interface Safe{readonly value:number}export interface Empty<T> {readonly stamp:number} export interface Inherited<T> extends Empty<T> {} export interface Contaminated {readonly owned:import("./factory.ts").Handle}export interface Default<T=import("./factory.ts").Handle>{readonly value:T}export interface IgnoredDefault<T=import("./factory.ts").Handle>{readonly stamp:number}export interface Dependent<T,U=T>{readonly value:U}',
    ],
    [
      "node_modules/boundary-package/index.d.ts",
      'import {privateKey} from "../../packages/server/src/infra/adapter/factory.ts";import type {Handle} from "../../packages/server/src/infra/adapter/factory.ts";type Ignored<T>={readonly stamp:number};type Delegated<T>=Ignored<T>;export type PublicErased=Delegated<Handle>;type Extracted<T>=T extends {value:infer V}?V:never;type Hidden={readonly value:Handle};export type PublicInferred=Extracted<Hidden>;export interface Public {readonly nested:Nested}\nexport interface Nested {readonly value:string}export interface Neutral{readonly value:number}export interface Keyed{readonly [privateKey]:string}export type UnknownLexical={x:1} extends {x:infer V}?V:never;',
    ],
    [
      "packages/server/src/infra/adapter/augmentation.ts",
      'import type {Handle} from "./factory.ts";import "boundary-package";declare module "boundary-package" {interface Nested {readonly owned:Handle}interface Neutral{readonly extra:(value:number)=>void}}declare global{interface Map<K,V>{neutralForward(value:K):V}interface WeakMap<K extends WeakKey,V>{readonly unsafe:Handle}}',
    ],
  ]);
  files.set(
    "packages/contracts/src/fixture.ts",
    'import type {Primitive} from "../../kit/src/fixture.ts";import type {Handle} from "../../server/src/infra/adapter/factory.ts";export interface Canonical{readonly id:Primitive}export interface Contaminated{readonly owned:Handle}export interface MergedDefault<T=Handle>{readonly value:T}export interface MergedDefault<T>{readonly more?:T}',
  );
  files.set(
    "packages/kit/src/fixture.ts",
    'declare const brand:unique symbol;export type Branded<B extends string>=string & {readonly [brand]:B};export type TypeIdOf<P extends string>=Branded<P>;export type Primitive=TypeIdOf<"fixture">',
  );
  const rows = cases.map(([name, symbol, expected], index) => {
    const path = `packages/server/src/${name}.ts`;
    const before = files.get(path) ?? "";
    const line = before.split("\n").length;
    files.set(
      path,
      symbol === "Contaminated"
        ? `${before}import type {Contaminated} from "../infra/adapter/contract.ts";export type FixtureContaminated=Contaminated;\n`
        : `${before}import {${symbol}} from "${name.startsWith("infra/") ? "./adapter" : "../infra/adapter"}/factory.ts";export const value${index}=${symbol};\n`,
    );
    return { name, symbol, expected, path, line };
  });
  files.set("node_modules/boundary-package/package.json", JSON.stringify({ name: "boundary-package", version: "1.0.0", types: "index.d.ts" }));
  for (const [path, text] of files) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const program = ts.createProgram(
    [...files.keys()].filter((path) => path.endsWith(".ts") && !path.startsWith("node_modules/")).map((path) => join(scratch, path)),
    {
      strict: true,
      types: [],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    },
  );
  const vendor = program.getSourceFile(join(scratch, "node_modules/boundary-package/index.d.ts"));
  if (vendor === undefined) {
    throw new Error("native public package declaration missing");
  }
  expect(program.isSourceFileFromExternalLibrary(vendor)).toBe(true);
  expect(program.getSourceFiles().some((source) => source.fileName.endsWith("/lib.dom.d.ts") && program.isSourceFileDefaultLibrary(source))).toBe(true);
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, "packages/server/src/entry/fixture.ts"));
  const properties = vi.spyOn(program.getTypeChecker(), "getPropertiesOfType");
  try {
    const observations: {
      readonly name: string;
      readonly actual: readonly (string | undefined)[];
      readonly expected: readonly string[];
      readonly messages: readonly string[];
    }[] = [];
    const results = new Map<string, readonly Linter.LintMessage[]>();
    for (const path of new Set(rows.map((row) => row.path))) {
      const text = files.get(path);
      if (text === undefined) {
        throw new Error("public boundary fixture source missing");
      }
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
      results.set(path, messages);
    }
    for (const { name, symbol, expected, path, line } of rows) {
      const messages = (results.get(path) ?? []).filter((message) => message.line === line);
      let expectedVerdicts: readonly string[] = [];
      if (expected !== null) {
        expectedVerdicts = expected === "finding-and-refusal" ? ["crossTierFactoryType", "unreadableFactoryExposure"] : [expected];
      }
      observations.push({
        name: `${name}/${symbol}`,
        actual: messages.map(({ messageId }) => messageId),
        expected: expectedVerdicts,
        messages: messages.map(({ message }) => message),
      });
    }
    expect(
      observations.map(({ name, actual }) => ({ name, verdicts: actual })),
      JSON.stringify(observations),
    ).toEqual(observations.map(({ name, expected }) => ({ name, verdicts: expected })));
    expect(observations.flatMap(({ messages }) => messages).some((message) => message.includes("Unrelated"))).toBe(false);
    expect(properties).not.toHaveBeenCalled();
    const source = program.getSourceFile(join(scratch, factory));
    if (source === undefined) {
      throw new Error("public boundary owner missing");
    }
    const declaration = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "platform");
    if (declaration?.name === undefined) {
      throw new Error("public boundary declaration missing");
    }
    const stale = ts.createSourceFile(source.fileName, source.text, ts.ScriptTarget.ES2022, true);
    expect(
      readServerPublicBoundary(
        declaration.name,
        { kind: "parser", source: stale, program, checker: program.getTypeChecker() },
        scratch,
        "packages/server/src/entry/stale.ts",
      ),
    ).toMatchObject({ kind: "unresolved", detail: expect.stringContaining("foreign or stale") });
  } finally {
    properties.mockRestore();
  }
}, 30_000);
