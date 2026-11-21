// String keys and built keys the fields scan places through the key resolver, one step per case, each with a truly
// dead twin beside it that stays reported; and the keys no step places, which report as unresolved and never as a
// name match.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanFields } from "../../../tooling/src/unwired/index.ts";
import { JSX_NAMESPACE, LIB, WORLD } from "./_planted.ts";

type Report = ReturnType<typeof scanFields>;

const scan = (root: string): Report => scanFields({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
const named = (report: Report, file: string): string[] =>
  report.unwired
    .filter((entry) => entry.file.endsWith(file))
    .map(({ home, member, kind }) => `${home}.${member} ${kind}`)
    .toSorted();
const planted = (file: string, lines: readonly string[]): Readonly<Record<string, string>> => ({
  [WORLD]: plantedTsconfig({ lib: LIB, jsx: "preserve" }),
  [`packages/a/src/${file}`]: lines.join("\n"),
});

// Step two: a computed string key names no member the checker walk reaches; find-references places it, so `kept` is
// written. `lost` is read and never written.
const COMPUTED = planted("computed.ts", [
  "export interface Box { readonly kept?: number; readonly spare?: number; readonly lost?: number }",
  'export const box: Box = { ["kept"]: 1, spare: 2 };',
  "export const total = (box.kept ?? 0) + (box.spare ?? 0) + (box.lost ?? 0);",
]);

test("a computed string key writes the member find-references places it on", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named(scan(await plantedTree(COMPUTED)), "computed.ts")).toEqual(["Box.lost never-written"]);
});

// Step four: a key slot declared `keyof Ctx`, as a parameter and as a literal's member, reads the member it names.
const KEYOF = planted("keyof.ts", [
  "export interface Ctx { readonly services: string; readonly auth: string; readonly unused: string }",
  "export const ctx: Ctx = { services: 's', auth: 'a', unused: 'u' };",
  "export const label = (key: keyof Ctx): string => key;",
  "export const shown = label('services');",
  "interface Column { readonly field: keyof Ctx }",
  "export const column: Column = { field: 'auth' };",
  "export const sorted = column.field;",
]);

test("a string key in a keyof slot reads the member it names", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named(scan(await plantedTree(KEYOF)), "keyof.ts")).toEqual(["Ctx.unused never-read"]);
});

// Step five: a generic call's slot `keyof T & string` names the type its `items` argument binds to T, as a fuzzy
// search's field list does; `gone` is listed by nobody.
const GENERIC = planted("generic.ts", [
  "export interface Row { readonly id: string; readonly name: string; readonly gone: string }",
  "export interface SearchOptions<T> { readonly fields: readonly (keyof T & string)[] }",
  "export declare function search<T extends { readonly id: string }>(items: readonly T[], options: SearchOptions<T>): readonly T[];",
  "export const rows: readonly Row[] = [{ id: 'a', name: 'n', gone: 'g' }];",
  "export const ids = search(rows, { fields: ['name'] }).map((row) => row.id);",
  "export const listed = (options: SearchOptions<Row>): number => options.fields.length;",
  "export interface Pair { readonly left: string; readonly right: string }",
  "export declare function pick<T, K extends keyof T>(value: T, key: K): T[K];",
  "export const pair: Pair = { left: 'l', right: 'r' };",
  "export const left = pick(pair, 'left');",
]);

test("a generic call's key slot reads the member of the type its argument binds", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named(scan(await plantedTree(GENERIC)), "generic.ts")).toEqual(["Pair.right never-read", "Row.gone never-read"]);
});

// Step six: TanStack Form's paths walk the form data type segment by segment. `setFieldValue` writes `params.seed`,
// `getFieldValue` reads it, a `Field` reads `title`; `params.dead` and `gone` are named by nobody.
const FORM = {
  [WORLD]: plantedTsconfig({ lib: LIB, jsx: "preserve" }),
  "packages/a/src/jsx.d.ts": JSX_NAMESPACE,
  "packages/a/src/form-api.ts": [
    "export interface FieldProps<T> { readonly name: string; readonly children?: unknown; readonly data?: T }",
    "export type ReactFormExtendedApi<TFormData> = {",
    "  setFieldValue(name: string, value: unknown): void;",
    "  getFieldValue(name: string): unknown;",
    "  readonly Field: (props: FieldProps<TFormData>) => JSX.Element;",
    "};",
    "export declare function useForm<T>(options: { readonly defaultValues: T }): ReactFormExtendedApi<T>;",
  ].join("\n"),
  "packages/a/src/form.tsx": [
    'import { useForm } from "./form-api.ts";',
    "export interface Values { readonly params: { readonly seed?: number; readonly dead?: number }; readonly title?: string; readonly gone?: string }",
    "export function Editor(): JSX.Element {",
    "  const form = useForm<Values>({ defaultValues: { params: {} } });",
    "  form.setFieldValue('params.seed', 3);",
    "  const seed = form.getFieldValue('params.seed');",
    "  return <form.Field name='title'>{seed}</form.Field>;",
    "}",
  ].join("\n"),
};

test("a form field path reads or writes each member along its segments", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named(scan(await plantedTree(FORM)), "form.tsx")).toEqual([
    "Values.gone unreferenced",
    "Values.params.dead unreferenced",
    "Values.title never-written",
  ]);
});

// A spread of a template-literal-keyed slice writes the target's members its keys name, as `tokenSampleSlice` feeds
// the stats delta; `idleSamples` no slice key builds.
const BUILT = planted("built.ts", [
  "type Axis = 'In' | 'Out';",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source spells a template literal type.
  "type SliceKey<P extends string> = `${P}${Capitalize<Axis>}Samples`;",
  "declare function slice<P extends 'model' | 'daily'>(prefix: P): Partial<Record<SliceKey<P>, number>>;",
  "export interface Delta { readonly modelInSamples?: number; readonly modelOutSamples?: number; readonly idleSamples?: number }",
  "export const delta: Delta = { ...slice('model') };",
  "export const read = (delta.modelInSamples ?? 0) + (delta.modelOutSamples ?? 0) + (delta.idleSamples ?? 0);",
]);

test("a spread of template-literal keys writes the target members they name", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(named(scan(await plantedTree(BUILT)), "built.ts")).toEqual(["Delta.idleSamples never-written"]);
});

// A key no step places is unresolved: an excess key on a closed shape and a read through `any` are listed, never
// matched to the same-named field, and a placed key is not listed.
const UNPLACED = planted("unplaced.ts", [
  "export interface Shape { readonly kept: string; readonly stray?: string }",
  "export const shape = { kept: 'k', loose: 'l' } as Shape;",
  "declare const untyped: any;",
  "export const read = shape.kept + (untyped.stray as string);",
]);

test("a key no step places reports as unresolved and credits no field", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(UNPLACED));
  expect(report.unresolved.filter((entry) => entry.startsWith("packages/a/src/unplaced.ts")).toSorted()).toEqual([
    "packages/a/src/unplaced.ts:2 loose absent",
    "packages/a/src/unplaced.ts:4 stray untyped",
  ]);
  expect(named(report, "unplaced.ts")).toEqual(["Shape.stray unreferenced"]);
});
