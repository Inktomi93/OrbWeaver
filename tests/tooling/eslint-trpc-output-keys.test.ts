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
  {
    name: "a spread handed to a contract-typed argument or variable",
    source: "export const sink: ProbeView[] = [];\nsink.push({ ...row });\nexport const made: ProbeView = { ...row };",
    keys: [],
  },
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
