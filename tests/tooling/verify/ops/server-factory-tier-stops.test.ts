// Each place the tier-reference walk stops still has an owner that judges the leak through it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";

const RULE = "orb/server-factory-tier-reference";
const FACTORY = "packages/server/src/infra/adapter/factory.ts";

const SOURCES: Readonly<Record<string, string>> = {
  [FACTORY]: `import type {Lane} from "../../foundation/trace/lane.ts";
import type {VendorBox,VendorHeavy} from "vendor-box";
import type {Canonical} from "../../../../contracts/src/fixture.ts";
export interface Local {readonly close:()=>void}
const LANES=["a","b"] as const;
export type Indexed=(typeof LANES)[number];
function makeRing<T>():T[]{return []}
export function promised():Promise<Local>{throw new Error("fixture")}
export function picked():Pick<Local,"close">{throw new Error("fixture")}
export function listed():ReadonlyArray<Local>{return []}
export function platform():Promise<Uint8Array>{throw new Error("fixture")}
export function mapped():Map<string,number>{return new Map()}
export function vendor():VendorBox<number>{throw new Error("fixture")}
export function vendorLocal():VendorBox<Local>{throw new Error("fixture")}
export function vendorHeavy():VendorHeavy{throw new Error("fixture")}
export function relay(lane:Lane):void{}
export function lanes():typeof LANES{return LANES}
export function indexed(value:Indexed):void{}
export function canonical():Canonical{throw new Error("fixture")}
export function inferred(){return {slot:promised()}}
export const ring=makeRing<Local>();
function isLocal(x:unknown):x is Local{return true}
function assertLocal(x:unknown):asserts x is Local{}
export function guarded(x:unknown){if(isLocal(x)){return x}throw new Error("fixture")}
export function asserted(x:unknown){assertLocal(x);return x}
export function narrowed(x:unknown){return isLocal(x)?x:null}
export function guardedMember(o:{readonly x:unknown}){if(isLocal(o.x)){return o.x}return undefined}
export const guardedConst=((x:unknown)=>{assertLocal(x);return {x}})(null);
export function present(x:Local|undefined){if(x){return x}throw new Error("fixture")}
export function literal(x:string){return x==="a"?x:"b"}
function isLocalAnd(x:{readonly a:number}):x is {readonly a:number}&Local{return true}
function wrapIt<T>(v:T):{readonly v:T}{return {v}}
export function viaGeneric<T>(x:T){if(isLocal(x)){return x}return null}
export function viaGenericWrap<T>(x:T){if(isLocal(x)){return wrapIt(x)}return null}
export function viaIntersection(x:{readonly a:number}){if(isLocalAnd(x)){return x}return null}
`,
  "packages/server/src/entry/hop.gen.ts": 'import {promised} from "../infra/adapter/factory.ts";\nexport function hopE(){return promised()}',
  "packages/server/src/domain/feature/bridge.gen.ts":
    'import {promised} from "../../infra/adapter/factory.ts";\nexport function bridged():ReturnType<typeof promised>{return promised()}export function plain():number{return 1}',
  "packages/server/src/infra/adapter/relay.gen.ts": 'import type {Lane} from "../../foundation/trace/lane.ts";\nexport function relayed(lane:Lane):void{}',
  "packages/server/src/infra/adapter/augment.ts":
    'import type {Local} from "./factory.ts";\ndeclare module "vendor-box" {interface VendorBox<T> {readonly owned?:Local}}',
  "packages/server/src/foundation/trace/lane.ts": 'export type Lane="a"|"b";export function trace(lane:Lane):void{}',
  "packages/server/src/domain/feature/verb.ts":
    'import type {VendorHeavy} from "vendor-box";\nimport {promised} from "../../infra/adapter/factory.ts";\nexport function verb():ReturnType<typeof promised>{return promised()}export function heavy():VendorHeavy{throw new Error("fixture")}',
  "packages/server/src/primitives/probe.ts": 'import type {Local} from "../infra/adapter/factory.ts";\nexport function probe(value:Local):void{}',
  "packages/contracts/src/fixture.ts": "export interface Canonical {readonly id:string}",
  "node_modules/vendor-box/package.json": JSON.stringify({ name: "vendor-box", version: "1.0.0", types: "index.d.ts" }),
  "node_modules/vendor-box/index.d.ts":
    "export interface VendorBox<T>{readonly value:T}type Deep<X>={[K in keyof X]:X[K] extends infer V?V:never};export type VendorHeavy=Deep<{readonly a:1}>;",
};

// [consumer, source, findings, the local shape each finding names]
const CASES = [
  ["entry/promised", 'import {promised} from "../infra/adapter/factory.ts";export const value=promised;', 1, "Local"],
  ["entry/picked", 'import {picked} from "../infra/adapter/factory.ts";export const value=picked;', 1, "Local"],
  ["entry/listed", 'import {listed} from "../infra/adapter/factory.ts";export const value=listed;', 1, "Local"],
  ["entry/vendor-local", 'import {vendorLocal} from "../infra/adapter/factory.ts";export const value=vendorLocal;', 1, "Local"],
  ["entry/indexed", 'import {indexed} from "../infra/adapter/factory.ts";export const value=indexed;', 1, "Indexed"],
  ["entry/inferred", 'import {inferred} from "../infra/adapter/factory.ts";export const value=inferred;', 1, "Local"],
  ["entry/ring", 'import {ring} from "../infra/adapter/factory.ts";export const value=ring;', 1, "Local"],
  ["entry/platform", 'import {platform} from "../infra/adapter/factory.ts";export const value=platform;', 0, ""],
  ["entry/mapped", 'import {mapped} from "../infra/adapter/factory.ts";export const value=mapped;', 0, ""],
  ["entry/vendor", 'import {vendor} from "../infra/adapter/factory.ts";export const value=vendor;', 0, ""],
  ["entry/vendor-heavy", 'import {vendorHeavy} from "../infra/adapter/factory.ts";export const value=vendorHeavy;', 0, ""],
  ["entry/relay", 'import {relay} from "../infra/adapter/factory.ts";export const value=relay;', 0, ""],
  ["entry/lanes", 'import {lanes} from "../infra/adapter/factory.ts";export const value=lanes;', 0, ""],
  ["entry/canonical", 'import {canonical} from "../infra/adapter/factory.ts";export const value=canonical;', 0, ""],
  ["entry/verb", 'import {verb} from "../domain/feature/verb.ts";export const value=verb;', 0, ""],
  ["entry/heavy", 'import {heavy} from "../domain/feature/verb.ts";export const value=heavy;', 0, ""],
  ["entry/probe", 'import {probe} from "../primitives/probe.ts";export const value=probe;', 0, ""],
  ["entry/present", 'import {present} from "../infra/adapter/factory.ts";export const value=present;', 1, "Local"],
  ["entry/literal", 'import {literal} from "../infra/adapter/factory.ts";export const value=literal;', 0, ""],
  // A generated file is outside the rule's population, so its own imports are walked from the importer.
  ["entry/bridged", 'import {bridged} from "../domain/feature/bridge.gen.ts";export const value=bridged;', 1, "Local"],
  ["entry/plain", 'import {plain} from "../domain/feature/bridge.gen.ts";export const value=plain;', 0, ""],
  ["entry/relayed", 'import {relayed} from "../infra/adapter/relay.gen.ts";export const value=relayed;', 1, "Lane"],
  ["entry/use-entry-gen", 'import {hopE} from "./hop.gen.ts";export const value=hopE;', 1, "Local"],
] as const;

// Control-flow narrowing gives a reference a type its declaration never names, so each read refuses.
const NARROWED = ["guarded", "asserted", "narrowed", "guardedMember", "guardedConst", "viaGeneric", "viaGenericWrap", "viaIntersection"] as const;

// The owners of each stop: the importing file in its own tier, or the ambient augmentation itself.
const OWNERS = [
  ["packages/server/src/domain/feature/verb.ts", 2, "Local", "packages/server/src/domain/feature/verb.ts"],
  ["packages/server/src/primitives/probe.ts", 1, "Local", "packages/server/src/primitives/probe.ts"],
  [FACTORY, 1, "Lane", FACTORY],
  ["packages/server/src/infra/adapter/augment.ts", 2, "Local", "every tier through the ambient augmentation"],
] as const;

test("each tier-reference stop leaves its leak to the importer or augmentation that owns it", async ({ scratch, repoRoot }) => {
  const files = new Map(Object.entries(SOURCES));
  for (const [name, source] of CASES) {
    files.set(`packages/server/src/${name}.ts`, source);
  }
  for (const name of NARROWED) {
    files.set(`packages/server/src/entry/${name}.ts`, `import {${name}} from "../infra/adapter/factory.ts";export const value=${name};`);
  }
  for (const [path, text] of files) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const program = ts.createProgram(
    [...files.keys()].filter((path) => path.endsWith(".ts") && !path.startsWith("node_modules/")).map((path) => join(scratch, path)),
    { strict: true, types: [], target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  );
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, "packages/server/src/entry/fixture.ts"));
  const lint = (path: string): readonly Linter.LintMessage[] =>
    new Linter({ cwd: scratch }).verify(
      files.get(path) ?? "",
      {
        files: ["**/*.ts"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
        rules: { [RULE]: "error" },
      },
      { filename: join(scratch, path) },
    );
  const verdict = (messages: readonly Linter.LintMessage[]): { readonly refusals: readonly string[]; readonly findings: readonly string[] } => ({
    refusals: messages.filter(({ messageId }) => messageId !== "crossTierFactoryType").map(({ message }) => message),
    findings: messages.filter(({ messageId }) => messageId === "crossTierFactoryType").map(({ message }) => message.slice(0, message.indexOf(" is local"))),
  });
  expect(CASES.map(([name]) => ({ name, ...verdict(lint(`packages/server/src/${name}.ts`)) }))).toEqual(
    CASES.map(([name, , count, shape]) => ({ name, refusals: [], findings: Array.from({ length: count }, () => `Factory type ${shape}`) })),
  );
  expect(
    NARROWED.map((name) => {
      const { refusals, findings } = verdict(lint(`packages/server/src/entry/${name}.ts`));
      return { name, findings, narrowed: refusals.map((message) => message.includes("a narrowed reference at packages/server/src/infra/adapter/factory.ts:")) };
    }),
  ).toEqual(NARROWED.map((name) => ({ name, findings: [], narrowed: [true] })));
  for (const [path, line, shape, consumer] of OWNERS) {
    const messages = lint(path);
    expect(
      messages.map(({ messageId, line: at, message }) => ({
        messageId,
        at,
        shape: message.includes(`Factory type ${shape} `),
        consumer: message.includes(consumer),
      })),
      path,
    ).toEqual([{ messageId: "crossTierFactoryType", at: line, shape: true, consumer: true }]);
  }
}, 30_000);

// A workspace package below the server cannot name a server shape at all; the package cake owns that leak.
test.for([
  { from: "packages/contracts/src/leak.ts", rule: "contracts-cake" },
  { from: "packages/kit/src/leak.ts", rule: "kit-purity" },
] as const)("the $rule import rule refuses a package reaching a server factory shape", async ({ from, rule }, { plantedTree, repoRoot }) => {
  const root = await plantedTree({
    [FACTORY]: "export interface Local {readonly close:()=>void}",
    [from]: `import type {Local} from "../../server/src/infra/adapter/factory.ts";export type Leak=Local;`,
  });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [from, "--config", join(repoRoot, ".dependency-cruiser.cjs"), "--output-type", "err-long"],
    {
      cwd: root,
    },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  expect(output).not.toContain("not-to-unresolvable");
  expect(output.includes(rule), output).toBe(true);
  expect(result.status, output).not.toBe(0);
});
