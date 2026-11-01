// `orb/trpc-output-declared-keys` refuses a resolver, or a return typed by a contract, that carries a key the strict
// output does not declare: a spread or a wider typed value TypeScript admits structurally.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { trpcOutputKeysRule } from "../../tooling/src/eslint/trpc-output.ts";

const RULE = "orb/trpc-output-declared-keys";
const FILE = "packages/server/src/domain/probe/verbs/probe.ts";
const PROCEDURES = "packages/server/src/domain/probe/procedures.ts";
const CONTRACT = "packages/server/src/domain/probe/contract/results.ts";

const CONTRACT_SOURCE = [
  "export interface ProbeView { readonly id: string; readonly name: string }",
  "export interface ProbeResult { readonly deleted: boolean; readonly newDefaultId: string | null }",
].join("\n");

const DECLARATIONS = [
  'import type { ProbeResult, ProbeView } from "./contract/results.ts";',
  "export interface Row { readonly id: string; readonly name: string; readonly ownerId: string }",
  "export interface Schema<T> { readonly shape: T }",
  "export interface Procedure<T> { query(resolver: () => T | Promise<T>): void; mutation(resolver: (input: unknown) => T | Promise<T>): void }",
  "export declare const procedure: { output<T>(schema: Schema<T>): Procedure<T> };",
  "export declare const viewOut: Schema<ProbeView>;",
  "export declare const resultOut: Schema<ProbeResult>;",
  "export declare const listOut: Schema<{ readonly items: readonly ProbeView[] }>;",
  'export declare const unionOut: Schema<ProbeView | { readonly kind: "none" }>;',
  "export declare const recordOut: Schema<Record<string, unknown>>;",
  "export declare const voidOut: Schema<void>;",
  'export declare const branchOut: Schema<({ readonly over: "a" } & ProbeView) | { readonly over: "b"; readonly hits: readonly string[] }>;',
  "export declare const row: Row;",
  "export declare const view: ProbeView;",
  "export declare const seeds: { readonly defaultPersonaId: string | null; readonly defaultMoved: boolean };",
  "export declare function loadRow(): Promise<Row>;",
  "export declare function loadView(): Promise<ProbeView>;",
].join("\n");

const IMPORTS =
  'import type { ProbeResult, ProbeView } from "../contract/results.ts";\nimport { branchOut, listOut, loadRow, loadView, procedure, recordOut, resultOut, row, seeds, unionOut, view, viewOut, voidOut } from "../procedures.ts";';

function lint(root: string, source: string): readonly string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  for (const [file, text] of [
    [CONTRACT, CONTRACT_SOURCE],
    [PROCEDURES, DECLARATIONS],
    [FILE, `${IMPORTS}\n${source}`],
  ] as const) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  const program = ts.createProgram({ rootNames: [CONTRACT, PROCEDURES, FILE].map((file) => join(root, file)), options });
  const found = new Linter({ cwd: root }).verify(
    `${IMPORTS}\n${source}`,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "trpc-output-declared-keys": trpcOutputKeysRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, FILE) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.map(({ message }) => message);
}

test.for([
  { name: "a resolver spreading a wider row", source: "procedure.output(viewOut).query(() => ({ ...row }));", keys: ["`ownerId`"] },
  {
    name: "a mutation spreading a seed bundle beside its result",
    source: "procedure.output(resultOut).mutation(() => ({ deleted: true, newDefaultId: null, ...seeds }));",
    keys: ["`defaultPersonaId`", "`defaultMoved`"],
  },
  { name: "a resolver delegating to a verb whose type is wider", source: "procedure.output(viewOut).query(() => loadRow());", keys: ["`ownerId`"] },
  {
    name: "an async resolver returning an awaited wider verb",
    source: "procedure.output(viewOut).query(async () => {\n  const loaded = await loadRow();\n  return loaded;\n});",
    keys: ["`ownerId`"],
  },
  { name: "a nested array of wider rows", source: "procedure.output(listOut).query(() => ({ items: [row] }));", keys: ["`items.ownerId`"] },
  {
    name: "a contract return spreading a wider row",
    source: "export function build(): ProbeView {\n  return { ...row };\n}",
    keys: ["`ownerId`"],
  },
  {
    name: "an async contract return spreading a wider row",
    source: "export async function build(): Promise<ProbeView> {\n  return { ...row };\n}",
    keys: ["`ownerId`"],
  },
  {
    name: "a contextually contract-typed arrow spreading a seed bundle",
    source: "export const make: () => Promise<ProbeResult> = async () => ({ deleted: true, newDefaultId: null, ...seeds });",
    keys: ["`defaultPersonaId`"],
  },
  {
    name: "a contract-typed arrow body spreading a wider row",
    source: "export const rows = [row].map((one): ProbeView => ({ ...one }));",
    keys: ["`ownerId`"],
  },
  {
    name: "a mapped callback spreading a wider row into a contract array",
    source: "export const rows: ProbeView[] = [row].map((one) => ({ ...one }));",
    keys: ["`ownerId`"],
  },
  {
    name: "a mapped callback spread inside a contract array literal",
    source: "export const rows: ProbeView[] = [...[row].map((one) => ({ ...one, extra: 1 }))];",
    keys: ["`ownerId`"],
  },
  { name: "a mapped callback spreading a view into a contract array", source: "export const rows: ProbeView[] = [view].map((one) => ({ ...one }));", keys: [] },
  { name: "a spread bound to an annotated contract variable", source: "export const made: ProbeView = { ...row };", keys: ["`ownerId`"] },
  {
    name: "a spread pushed onto a contract-typed array",
    source: "export const sink: ProbeView[] = [];\nsink.push({ ...row });",
    keys: ["`ownerId`"],
  },
  {
    name: "a spread handed to a contract-typed call argument",
    source: "declare function take(view: ProbeView): void;\ntake({ ...row });",
    keys: [],
  },
  {
    name: "a spread pushed onto a non-array with a push method",
    source: "declare const bag: { push(view: ProbeView): void };\nbag.push({ ...row });",
    keys: [],
  },
  { name: "a view-shaped spread bound to a contract variable", source: "export const made: ProbeView = { ...view };", keys: [] },
  { name: "an unannotated variable holding a wider spread", source: "export const made = { ...row };", keys: [] },
  {
    name: "a spread into an intersection branch of a union output",
    source: 'procedure.output(branchOut).query(() => ({ over: "a" as const, ...row }));',
    keys: ["`ownerId`"],
  },
  { name: "a resolver spreading a view of the declared shape", source: "procedure.output(viewOut).query(() => ({ ...view }));", keys: [] },
  { name: "a resolver delegating to a verb of the declared shape", source: "procedure.output(viewOut).query(() => loadView());", keys: [] },
  { name: "a union output", source: 'procedure.output(unionOut).query(() => (view.id === "" ? { kind: "none" as const } : { ...view }));', keys: [] },
  { name: "an index-signature output", source: "procedure.output(recordOut).query(() => ({ ...row }));", keys: [] },
  { name: "a void output", source: "procedure.output(voidOut).mutation(() => undefined);", keys: [] },
  { name: "a nested array of declared views", source: "procedure.output(listOut).query(() => ({ items: [view, { ...view }] }));", keys: [] },
  {
    name: "a wider value returned where no contract type is declared",
    source: "export function build(): { readonly id: string } {\n  return { ...row };\n}",
    keys: [],
  },
  {
    name: "a wider value returned whole where only a contract type is declared",
    source: "export function build(): ProbeView {\n  return row;\n}",
    keys: [],
  },
  {
    name: "a spread that fills an intersection branch",
    source: 'procedure.output(branchOut).query(() => ({ over: "a" as const, ...view }));',
    keys: [],
  },
  { name: "a contract return of the declared shape", source: "export function build(): ProbeView {\n  return { ...view };\n}", keys: [] },
])("the output rule reports $name", ({ source, keys }, { scratch }) => {
  const messages = lint(scratch, source);
  expect(messages.length).toBe(keys.length === 0 ? 0 : 1);
  for (const key of keys) {
    expect(messages[0]).toContain(key);
  }
});

// The same rule against the server's real procedure builder and real zod, so an inferred output type is what it judges.
// One program types every case: each sits in its own block, and a report is matched to its case by line.
const REPO = join(import.meta.dirname, "../..");
const REAL_PROGRAM_TIMEOUT_MS = 90_000;
const REAL_FILE = "packages/server/src/transport/trpc/routers/probe.ts";
const REAL_IMPORTS = [
  `import { authedProcedure } from "${join(REPO, "packages/server/src/transport/trpc/trpc.ts")}";`,
  'import { z } from "zod";',
  "const viewSchema = z.strictObject({ id: z.string(), name: z.string() });",
  "type View = z.infer<typeof viewSchema>;",
  "declare const rows: readonly { readonly id: string; readonly name: string; readonly ownerId: string }[];",
  "declare const row: { readonly id: string; readonly name: string; readonly ownerId: string };",
  "declare const views: readonly View[];",
  "declare function loadRows(): Promise<typeof rows>;",
].join("\n");

const REAL_CASES = [
  { name: "an array output returning wider rows", source: "authedProcedure.output(z.array(viewSchema)).query(() => rows);", keys: ["`ownerId`"] },
  {
    name: "an array output mapping a spread of each row",
    source: "authedProcedure.output(z.array(viewSchema)).query(() => rows.map((one) => ({ ...one })));",
    keys: ["`ownerId`"],
  },
  {
    name: "an array nested in an object output",
    source: "authedProcedure.output(z.strictObject({ items: z.array(viewSchema) })).query(() => ({ items: rows }));",
    keys: ["`items.ownerId`"],
  },
  {
    name: "a nested wide result from an awaited call",
    source: "authedProcedure.output(z.strictObject({ items: z.array(viewSchema) })).query(async () => ({ items: await loadRows() }));",
    keys: ["`items.ownerId`"],
  },
  { name: "a spread hidden by a cast", source: "authedProcedure.output(viewSchema).query(() => ({ ...row }) as View);", keys: ["`ownerId`"] },
  {
    name: "a spread under satisfies with no declared return",
    source: "authedProcedure.output(viewSchema).query(() => ({ ...row }) satisfies View);",
    keys: ["`ownerId`"],
  },
  {
    name: "a named handler returning wider rows",
    source: "const handler = () => rows;\nauthedProcedure.output(z.array(viewSchema)).query(handler);",
    keys: ["`ownerId`"],
  },
  {
    name: "a flatMap producing wider rows",
    source: "authedProcedure.output(z.array(viewSchema)).query(() => rows.flatMap((one) => [{ ...one }]));",
    keys: ["`ownerId`"],
  },
  {
    name: "a Promise.all over wider rows",
    source: "authedProcedure.output(z.array(viewSchema)).query(() => Promise.all(rows.map(async (one) => ({ ...one }))));",
    keys: ["`ownerId`"],
  },
  {
    name: "an Array.from over wider rows",
    source: "authedProcedure.output(z.array(viewSchema)).query(() => Array.from(rows, (one) => ({ ...one })));",
    keys: ["`ownerId`"],
  },
  { name: "an array output of declared views", source: "authedProcedure.output(z.array(viewSchema)).query(() => views.map((one) => ({ ...one })));", keys: [] },
  { name: "a named handler of declared views", source: "const handler = () => views;\nauthedProcedure.output(z.array(viewSchema)).query(handler);", keys: [] },
  { name: "a void mutation", source: "authedProcedure.output(z.void()).mutation(() => undefined);", keys: [] },
  {
    name: "a union output",
    source: "authedProcedure.output(z.union([viewSchema, z.strictObject({ kind: z.literal('none') })])).query(() => ({ ...views[0]! }));",
    keys: [],
  },
] as const;

test("the output rule on the real procedure reports each case on its own lines", { timeout: REAL_PROGRAM_TIMEOUT_MS }, ({ scratch }) => {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    paths: { zod: [join(REPO, "packages/server/node_modules/zod")] },
  };
  let line = REAL_IMPORTS.split("\n").length + 1;
  const spans = REAL_CASES.map((one) => {
    const start = line + 1;
    line += one.source.split("\n").length + 2;
    return { ...one, start, end: line };
  });
  const text = `${REAL_IMPORTS}\n${REAL_CASES.map((one) => `{\n${one.source}\n}`).join("\n")}`;
  mkdirSync(dirname(join(scratch, REAL_FILE)), { recursive: true });
  writeFileSync(join(scratch, REAL_FILE), text);
  const program = ts.createProgram({ rootNames: [join(scratch, REAL_FILE)], options });
  const found = new Linter({ cwd: scratch }).verify(
    text,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "trpc-output-declared-keys": trpcOutputKeysRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(scratch, REAL_FILE) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  const reported = spans.map((one) => ({
    name: one.name,
    keys: one.keys,
    messages: found.filter(({ line: at }) => at >= one.start && at < one.end).map(({ message }) => message),
  }));
  for (const one of reported) {
    expect({ name: one.name, reported: one.messages.length > 0 }).toEqual({ name: one.name, reported: one.keys.length > 0 });
    for (const key of one.keys) {
      expect(one.messages.join("\n")).toContain(key);
    }
  }
});
