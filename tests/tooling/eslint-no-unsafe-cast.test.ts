// `orb/no-unsafe-cast` refuses a cast the checker cannot hold to account: a double cast through `unknown`, a parsed JSON
// blob named as a type, an untyped value named as a contract, row, brand or object type, a brand stripped with `as string`,
// and a plain string made a brand outside a mint home.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { noUnsafeCastRule } from "../../tooling/src/eslint/unsafe-cast.ts";

const RULE = "orb/no-unsafe-cast";
const FILE = "packages/server/src/domain/probe/verbs/probe.ts";
const HOME_FILE = "packages/server/src/infra/probe-host/boundary.ts";
const MINT_FILE = "packages/server/src/domain/probe/contract/probe-id.ts";
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
  "export function probeIdOf(raw: string): ProbeId {",
  "  return castId<ProbeId>(raw);",
  "}",
].join("\n");

const CONTRACT_SOURCE = "export interface ProbeView { readonly id: string; readonly name: string }";
const ROWS_SOURCE = "export interface ProbeRow { readonly id: string }";
const LOCAL_TYPES = [
  "interface SnapshotRow { readonly id: string }",
  "interface Shape { readonly n: number }",
  "interface WiderShape extends Shape { readonly m: number }",
].join("\n");

const importsFor = (file: string): string => {
  const from = (target: string): string => relative(dirname(file), target);
  return [
    `import type { ProbeId } from "${from(KIT)}";`,
    `import { castId, castId as toId, probeIdOf } from "${from(KIT)}";`,
    `import type { ProbeView } from "${from(CONTRACT)}";`,
    `import type { ProbeRow } from "${from(ROWS)}";`,
    "declare const raw: string;",
    "declare const loose: unknown;",
    "declare const boundary: unknown;",
    "declare const anything: any;",
    "declare const id: ProbeId;",
    'declare const names: readonly ["a", "b"];',
    LOCAL_TYPES,
  ].join("\n");
};

const homes = [{ file: HOME_FILE, site: "boundary", reason: "the probe host reads guest JSON that arrives untyped by construction" }];
const mintHomes = [{ file: MINT_FILE, reason: "the probe id module owns the probe id's validation" }];

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
  const text = `${importsFor(file)}\n${source}`;
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
      plugins: { orb: { rules: { "no-unsafe-cast": noUnsafeCastRule(homes, mintHomes) } } },
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
  { name: "a plain string cast to a brand", source: "export const a = raw as ProbeId;", found: "plain string named as a brand" },
  { name: "a string literal cast to a brand", source: 'export const a = "probe_1" as ProbeId;', found: "plain string named as a brand" },
  { name: "a plain string passed to castId", source: "export const a = castId<ProbeId>(raw);", found: "plain string named as a brand" },
  { name: "castId under an import alias", source: "export const a = toId<ProbeId>(raw);", found: "plain string named as a brand" },
  { name: "castId of a value already branded", source: "export const a = castId<ProbeId>(id);", found: "already carries the brand" },
  { name: "an unknown value named as a local interface", source: "export const a = loose as Shape;", found: "named as an object type" },
  { name: "an any value named as an inline object type", source: "export const a = anything as { readonly n: number };", found: "named as an object type" },
  { name: "an unknown value named as a list of local shapes", source: "export const a = loose as readonly Shape[];", found: "named as an object type" },
  { name: "an unknown value named as a shape or null", source: "export const a = loose as Shape | null;", found: "named as an object type" },
  { name: "an unknown value named as a function", source: "export const a = loose as () => void;", found: "named as an object type" },
  {
    name: "JSON.parse output held in a variable and then named",
    source: "const parsed = JSON.parse(raw);\nexport const a = parsed as Shape;",
    found: "named as an object type",
  },
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
  { name: "a brand cast to its own brand", source: "export const a = id as ProbeId;", found: null },
  { name: "a nullable brand asserted non-null", source: "declare const maybe: ProbeId | null;\nexport const a = maybe as ProbeId;", found: null },
  { name: "a satisfies check on a local shape", source: "export const a = { n: 1 } satisfies Shape;", found: null },
  { name: "a cast between two compatible local types", source: "declare const shape: Shape;\nexport const a = shape as WiderShape;", found: null },
  { name: "an unknown value narrowed to a primitive union", source: "export const a = loose as string | number;", found: null },
  { name: "another export of the kit id module", source: "export const a = probeIdOf(raw);", found: null },
  {
    name: "a local function that shadows castId",
    source: "export function a(castId: (value: string) => ProbeId): ProbeId {\n  return castId(raw);\n}",
    found: null,
  },
  { name: "an unknown value erased to never", source: "export const a = loose as never;", found: null },
  { name: "a typed row cast to the contract", source: "declare const row: ProbeRow;\nexport const a = row as ProbeView;", found: null },
])("the cast rule reports $name", ({ source, found }, { scratch }) => {
  const messages = lint(scratch, FILE, source);
  expect(messages.length).toBe(found === null ? 0 : 1);
  expect(messages.every((message) => message.includes(found ?? ""))).toBe(true);
});

test("a mint home makes a brand from a plain string; the same lines elsewhere are refused", ({ scratch }) => {
  const source = "export const a = castId<ProbeId>(raw);\nexport const b = raw as ProbeId;";
  expect(lint(scratch, MINT_FILE, source)).toEqual([]);
  expect(lint(scratch, FILE, source)).toHaveLength(2);
});

test("a home keeps its one boundary cast and no other in that file", ({ scratch }) => {
  expect(lint(scratch, HOME_FILE, "export const a = boundary as ProbeView;")).toEqual([]);
  expect(lint(scratch, HOME_FILE, "export const a = boundary as ProbeView;\nexport const b = loose as ProbeView;")).toHaveLength(1);
});
