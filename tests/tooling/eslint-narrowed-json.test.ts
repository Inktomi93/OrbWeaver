// `orb/narrowed-json-brand` refuses the two forms the narrowed JSON brand cannot refuse in tsc: an Object.assign onto
// or into a branded value, and an assertion to a branded type outside the brand's one mint.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { NARROWED_JSON_MINT, narrowedJsonBrandRule } from "../../tooling/src/eslint/narrowed-json.ts";

const RULE = "orb/narrowed-json-brand";
const FILE = "packages/server/src/domain/probe/verbs/probe.ts";
const KIT = NARROWED_JSON_MINT.path;

// The kit brand as the kit declares it: the rule finds it by this file and this member, not by a type name.
const KIT_SOURCE = [
  "export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };",
  "declare class JsonNarrowingMint {",
  "  private jsonNarrowing(): void;",
  "}",
  "declare const narrowedFor: unique symbol;",
  "interface JsonNarrowing<Name extends string> extends JsonNarrowingMint {",
  "  readonly [narrowedFor]: Name;",
  "}",
  "export type NarrowedJsonObject<T, Name extends string> = T & JsonNarrowing<Name>;",
  "export function narrowJsonObject<Name extends string, T>(parse: (raw: unknown) => T, raw: unknown): NarrowedJsonObject<T, Name> {",
  "  return parse(raw) as NarrowedJsonObject<T, Name>;",
  "}",
  'export function other<T>(value: T): NarrowedJsonObject<T, "Other"> {',
  '  return value as NarrowedJsonObject<T, "Other">;',
  "}",
].join("\n");

// A look-alike declared outside the kit carries no brand the rule knows.
const LOOKALIKE = "declare class JsonNarrowing { private jsonNarrowing(): void }\ntype Lookalike = { readonly a?: string } & JsonNarrowing;";

const importsFor = (file: string): string => {
  const from = relative(dirname(file), KIT);
  return [
    `import type { NarrowedJsonObject } from "${from}";`,
    `import { narrowJsonObject } from "${from}";`,
    'type Meta = NarrowedJsonObject<{ readonly mode?: "a"; readonly depth?: number }, "Meta">;',
    "declare const row: { readonly metadata: Meta };",
    "declare const meta: Meta;",
    'declare const plain: { readonly mode?: "a" };',
  ].join("\n");
};

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
  const text = file === KIT ? source : `${importsFor(file)}\n${source}`;
  const files: readonly (readonly [path: string, body: string])[] =
    file === KIT
      ? [[KIT, text]]
      : [
          [KIT, KIT_SOURCE],
          [file, text],
        ];
  for (const [path, body] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  const program = ts.createProgram({ rootNames: files.map(([path]) => join(root, path)), options });
  const found = new Linter({ cwd: root }).verify(
    text,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "narrowed-json-brand": narrowedJsonBrandRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, file) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.map(({ message }) => message);
}

test.for([
  { name: "Object.assign onto a stored value", source: "export const a = Object.assign(row.metadata, { depth: 999_999 });", found: "Object.assign" },
  { name: "Object.assign of a stored value into a fresh object", source: "export const a = Object.assign({}, meta, { extra: 1 });", found: "Object.assign" },
  { name: "Object.assign through a computed name", source: 'export const a = Object["assign"]({}, meta);', found: "Object.assign" },
  { name: "a literal asserted as the narrowed type", source: 'export const a = { mode: "a" } as Meta;', found: "assertion" },
  { name: "an angle-bracket assertion", source: 'export const a = <Meta>{ mode: "a" };', found: "assertion" },
  { name: "an assertion to the narrowed type or null", source: "export const a = plain as Meta | null;", found: "assertion" },
  // Controls: the shapes the rule must leave alone.
  { name: "the narrowing function's output", source: 'export const a: Meta = narrowJsonObject<"Meta", typeof plain>(() => plain, plain);', found: null },
  { name: "a plain read of a stored value", source: "export const a = row.metadata.mode;", found: null },
  { name: "a stored value copied whole", source: "export const a: Meta = row.metadata;", found: null },
  { name: "Object.assign on unbranded objects", source: "export const a = Object.assign({}, plain, { extra: 1 });", found: null },
  { name: "a satisfies check", source: "export const a = meta satisfies Meta;", found: null },
  { name: "an assertion to a look-alike brand declared elsewhere", source: `${LOOKALIKE}\nexport const a = {} as Lookalike;`, found: null },
])("the narrowed JSON rule reports $name", ({ source, found }, { scratch }) => {
  const messages = lint(scratch, FILE, source);
  expect(messages).toHaveLength(found === null ? 0 : 1);
  expect(messages.filter((message) => !message.includes(found ?? ""))).toEqual([]);
});

test("the mint's own cast is allowed; another function in the kit file asserting the brand is refused", ({ scratch }) => {
  expect(lint(scratch, KIT, KIT_SOURCE)).toEqual([expect.stringContaining("assertion")]);
});
