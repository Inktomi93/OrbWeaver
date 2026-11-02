// `orb/no-unsafe-cast` refuses a cast the checker cannot hold to account: a double cast through `unknown`, a parsed JSON
// blob named as a type, an untyped value named as a contract, row or brand, and a brand stripped with `as string`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { noUnsafeCastRule } from "../../tooling/src/eslint/unsafe-cast.ts";

const RULE = "orb/no-unsafe-cast";
const FILE = "packages/server/src/domain/probe/verbs/probe.ts";
const HOME_FILE = "packages/server/src/infra/probe-host/boundary.ts";
const KIT = "packages/kit/src/ids/index.ts";
const CONTRACT = "packages/contracts/src/probe.ts";
const ROWS = "packages/db/src/schema/probe.ts";

const KIT_SOURCE = [
  "declare const brand: unique symbol;",
  "export type Branded<B extends string> = string & { readonly [brand]: B };",
  'export type ProbeId = Branded<"ProbeId">;',
  "export function castId<T extends Branded<string>>(raw: string): T {",
  "  return raw as T;",
  "}",
].join("\n");

const CONTRACT_SOURCE = "export interface ProbeView { readonly id: string; readonly name: string }";
const ROWS_SOURCE = "export interface ProbeRow { readonly id: string }";
const LOCAL_ROW = "interface SnapshotRow { readonly id: string }";

const IMPORTS = [
  'import type { ProbeId } from "../../../../../kit/src/ids/index.ts";',
  'import type { ProbeView } from "../../../../../contracts/src/probe.ts";',
  'import type { ProbeRow } from "../../../../../db/src/schema/probe.ts";',
  "declare const raw: string;",
  "declare const loose: unknown;",
  "declare const boundary: unknown;",
  "declare const anything: any;",
  "declare const id: ProbeId;",
  'declare const names: readonly ["a", "b"];',
  LOCAL_ROW,
].join("\n");

const homes = [{ file: HOME_FILE, site: "boundary", reason: "the probe host reads guest JSON that arrives untyped by construction" }];

function lint(root: string, file: string, source: string): readonly string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  const text = `${IMPORTS}\n${source}`;
  for (const [path, body] of [
    [KIT, KIT_SOURCE],
    [CONTRACT, CONTRACT_SOURCE],
    [ROWS, ROWS_SOURCE],
    [file, text],
  ] as const) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  const program = ts.createProgram({ rootNames: [KIT, CONTRACT, ROWS, file].map((path) => join(root, path)), options });
  const found = new Linter({ cwd: root }).verify(
    text,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "no-unsafe-cast": noUnsafeCastRule(homes) } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, file) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.map(({ message }) => message);
}

test.for([
  { name: "a double cast through unknown", source: "export const a = raw as unknown as ProbeView;", found: "double cast" },
  { name: "a double cast through any", source: "export const a = raw as any as ProbeView;", found: "double cast" },
  { name: "a parsed JSON blob named as a type", source: "export const a = JSON.parse(raw) as { readonly n: number };", found: "JSON.parse" },
  { name: "a parsed JSON blob named as a contract", source: "export const a = JSON.parse(raw) as ProbeView;", found: "JSON.parse" },
  { name: "an unknown value named as a contract", source: "export const a = loose as ProbeView;", found: "contract, row or branded" },
  { name: "an any value named as a contract", source: "export const a = anything as ProbeView;", found: "contract, row or branded" },
  { name: "an unknown value named as a list of contracts", source: "export const a = loose as readonly ProbeView[];", found: "contract, row or branded" },
  { name: "an unknown value named as a db row", source: "export const a = loose as ProbeRow;", found: "contract, row or branded" },
  { name: "an unknown value named as a locally declared row", source: "export const a = loose as SnapshotRow;", found: "contract, row or branded" },
  { name: "an unknown value named as a brand", source: "export const a = loose as ProbeId;", found: "contract, row or branded" },
  { name: "a brand stripped to string", source: "export const a = id as string;", found: "strips a brand" },
  { name: "a double cast the home list does not cover", source: "export const a = loose as unknown as string;", found: "double cast" },
  // Controls: the shapes the rule must leave alone.
  { name: "a cast to unknown", source: "export const a = JSON.parse(raw) as unknown;", found: null },
  { name: "a const assertion", source: 'export const a = ["a", "b"] as const;', found: null },
  { name: "a widened list used for includes", source: 'export const a = (names as readonly string[]).includes("a");', found: null },
  { name: "a widened list stored beyond includes", source: "export const a = names as readonly string[];", found: null },
  { name: "a plain string cast to string", source: "export const a = raw as string;", found: null },
  { name: "an unknown value narrowed to a primitive", source: "export const a = loose as string;", found: null },
  {
    name: "a typed value cast to its own wider contract field type",
    source: "declare const view: ProbeView;\nexport const a = view.id as string;",
    found: null,
  },
  { name: "a string cast to a brand", source: "export const a = raw as ProbeId;", found: null },
  { name: "an unknown value erased to never", source: "export const a = loose as never;", found: null },
  { name: "a typed row cast to the contract", source: "declare const row: ProbeRow;\nexport const a = row as ProbeView;", found: null },
])("the cast rule reports $name", ({ source, found }, { scratch }) => {
  const messages = lint(scratch, FILE, source);
  expect(messages.length).toBe(found === null ? 0 : 1);
  expect(messages.every((message) => message.includes(found ?? ""))).toBe(true);
});

test("a home keeps its one boundary cast and no other in that file", ({ scratch }) => {
  expect(lint(scratch, HOME_FILE, "export const a = boundary as ProbeView;")).toEqual([]);
  expect(lint(scratch, HOME_FILE, "export const a = boundary as ProbeView;\nexport const b = loose as ProbeView;")).toHaveLength(1);
});
