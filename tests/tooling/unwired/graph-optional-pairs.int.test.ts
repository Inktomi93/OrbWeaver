// Optional fields supplied separately, read off the reference graph: two optional members of one home that production
// writes at separate constructions and never sets together. A co-set at one construction is the control each case holds,
// and a fallback or DOM read of both is the evidence a pair is an alternative.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { optionalPairsGraph } from "../../../tooling/src/unwired/index.ts";
import { pluginSources, readPluginSources } from "../../../tooling/src/unwired/plugin-surface.ts";
import { GRAPH_SOURCE, graphTree, JSX_NAMESPACE, LIB, libraryModule, ZOD_MODULE } from "./_planted.ts";

// No author world: product source alone is production.
const NO_PLUGINS = pluginSources(new Map(), []);

type Inventory = Awaited<ReturnType<typeof optionalPairsGraph>>;

// The pairs some fallback read joins, as `[owner, left, right]`.
const readPairs = (inventory: Inventory): readonly (readonly [string | undefined, string, string])[] =>
  inventory.optionalAlternatives
    .filter((row) => row.fallbackReaders !== 0)
    .map(({ group, left, right }) => [inventory.optionalGroups[group]?.owner, left, right] as const);

test("optional alternatives report separate writes and reject a co-set control", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        ...ZOD_MODULE,
        [`${GRAPH_SOURCE}/jsx.d.ts`]: JSX_NAMESPACE,
        [`${GRAPH_SOURCE}/choice.tsx`]: [
          "export interface Input { readonly file?: string; readonly url?: string; quiet?: boolean }",
          "declare const fileMode: boolean;",
          'const input: Input = fileMode ? { file: "f", quiet: true } : { url: "u", quiet: true };',
          "export const selected = input.file ?? input.url;",
          // the control: one construction sets both, so the pair is no alternative
          "interface WithFallback { primary?: string; backup?: string }",
          'const fallback: WithFallback = fileMode ? { primary: "f", backup: "b" } : { backup: "b" };',
          "export const value = fallback.primary ?? fallback.backup;",
          "interface Ancestor { readonly path?: string }",
          "interface Inherited extends Ancestor { readonly address?: string }",
          'const derived: Inherited = fileMode ? { path: "p" } : { address: "u" };',
          "export const derivedValue = derived.path ?? derived.address;",
          "interface Addresses<T> { readonly inline: T; readonly remote: T }",
          "type Choice<T> = Partial<Addresses<T>>;",
          'const text: Choice<string> = fileMode ? { inline: "s" } : { remote: "r" };',
          // the same mapped home at another argument is another context, and its co-set is its own
          "const numbers: Choice<number> = { inline: 1, remote: 2 };",
          "export const mappedValue = text.inline ?? text.remote;",
          "export const numbersValue = numbers.inline ?? numbers.remote;",
          "interface WidgetInput extends Ancestor { readonly title?: string }",
          "function Widget({ path, title }: WidgetInput) { return <span>{path ?? title}</span>; }",
          'export const widget = fileMode ? <Widget path="p" /> : <Widget title="t" />;',
          'import { z } from "zod";',
          "const firstSchema = z.object({ shared: z.string(), onlyFirst: z.string() });",
          "const secondSchema = z.object({ shared: z.number(), onlySecond: z.number() });",
          'export const first: Partial<z.infer<typeof firstSchema>> = fileMode ? { shared: "x" } : { onlyFirst: "y" };',
          "export const second: Partial<z.infer<typeof secondSchema>> = fileMode ? { shared: 1 } : { onlySecond: 2 };",
          // a mapped copy is listed only where a reader takes one field or the other
          "export const firstValue = first.shared ?? first.onlyFirst;",
          "export const secondValue = second.shared ?? second.onlySecond;",
        ].join("\n"),
      },
      { jsx: true },
    ),
  );
  const inventory = await optionalPairsGraph(root, () => undefined, NO_PLUGINS);
  expect(readPairs(inventory)).toEqual([
    ["Input", "file", "url"],
    ["Inherited", "path", "address"],
    ["Partial<Addresses<string>>", "inline", "remote"],
    ["WidgetInput", "path", "title"],
    ["Partial<Shape<{ shared: Schema<string, string>; onlyFirst: Schema<string, string>; }>>", "shared", "onlyFirst"],
    ["Partial<Shape<{ shared: Schema<number, number>; onlySecond: Schema<number, number>; }>>", "shared", "onlySecond"],
  ]);
  // two schemas' outputs are two contexts, never one group of every `shared`
  const zodGroups = inventory.optionalGroups.filter((group) => group.fields.some(({ name }) => name === "onlyFirst" || name === "onlySecond"));
  expect(zodGroups.map((group) => group.fields.map(({ name }) => name).sort())).toEqual([
    ["onlyFirst", "shared"],
    ["onlySecond", "shared"],
  ]);
});

// drizzle-orm's write typing in miniature, shaped as sqlite-core's: the insert value and the update set source are both
// mapped over the keys of the table's insert row, and the set source's values read the column map.
const DRIZZLE = libraryModule(
  [
    "export interface Column { readonly name: string }",
    "export declare const text: () => Column;",
    "export interface TableConfig<C> { readonly columns: C }",
    "type Simplify<T> = { [K in keyof T]: T[K] } & {};",
    "type GetColumnData<C> = C extends Column ? string : never;",
    "export interface Table<T extends TableConfig<unknown>> {",
    "  readonly _: T;",
    '  readonly $inferSelect: { [K in keyof T["columns"]]: string };',
    '  readonly $inferInsert: { [K in keyof T["columns"]]?: string };',
    "}",
    "export declare function sqliteTable<C>(name: string, columns: C): Table<TableConfig<C>> & C;",
    'export type InsertValue<T extends Table<TableConfig<unknown>>> = Simplify<{ [K in keyof T["$inferInsert"]]: T["$inferInsert"][K] | number }>;',
    'export type UpdateSetSource<T extends Table<TableConfig<unknown>>> = { [K in keyof T["$inferInsert"]]?: GetColumnData<T["_"]["columns"][K]> | number | undefined } & {};',
  ],
  "drizzle-orm",
);

// Each group's owner and its fields, sorted, for the groups whose fields include one of `names`.
const groupsWith = (inventory: Inventory, names: readonly string[]): readonly string[] =>
  inventory.optionalGroups
    .filter((group) => group.fields.some(({ name }) => names.includes(name)))
    .map(
      (group) =>
        `${group.owner}: ${group.fields
          .map(({ name }) => name)
          .toSorted()
          .join(",")}`,
    )
    .toSorted();

// A group whose shape the types already answer is no question for review: a union's discriminant, a mapped copy no reader
// joins, and the columns of a Drizzle table's insert or set value. Each case's twin keeps the same writes on a shape the
// types leave open, so it stays listed.
test("a group the types already settle leaves the inventory, and its twin on an open shape stays", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...DRIZZLE,
      "packages/db/src/schema/tables.ts": [
        'import { sqliteTable, text } from "drizzle-orm";',
        'export const notes = sqliteTable("notes", { id: text(), title: text(), body: text() });',
      ].join("\n"),
      [`${GRAPH_SOURCE}/settled.ts`]: [
        'import type { InsertValue, UpdateSetSource } from "drizzle-orm";',
        'import type { notes } from "../../db/src/schema/tables.ts";',
        "declare const mode: boolean;",
        // `inPopover` is pinned in the first arm and declared in the second: the union's discriminant pairs with nothing
        "export type Picker = { readonly listSize?: string; readonly inPopover?: false } | { readonly listSize?: never; readonly inPopover?: boolean };",
        'export const pickers: readonly Picker[] = [{ listSize: "grow" }, { inPopover: true }];',
        // `undefined` forbids as `never` does, so neither arm holds a pair
        "export type Cap = { readonly clamp?: number; readonly lines?: undefined } | { readonly clamp?: undefined; readonly lines?: number };",
        "export const caps: readonly Cap[] = [{ clamp: 1 }, { lines: 2 }];",
        // the twin: `false | undefined` pins `off` as one literal does, but `window` and `percent` share the second arm
        "export type Compact = { readonly off: true; readonly window?: never } | { readonly off?: false | undefined; readonly window?: number; readonly percent?: number };",
        "export const compacts: readonly Compact[] = [{ off: false }, { window: 1 }, { percent: 2 }];",
        // the twin: the second arm forbids `file` and `url`, which says nothing of the two together in the first
        "export type Src = { readonly none?: never; readonly file?: string; readonly url?: string } | { readonly none?: true; readonly file?: never; readonly url?: never };",
        'export const srcs: readonly Src[] = [{ file: "f" }, { url: "u" }];',
        "export function pickSrc(s: Src): string | undefined { return s.file ?? s.url; }",
        // the twin: both arms take `control`, so `glyph` and `control` stay open in the first arm
        'export type Dismiss = { readonly at: "header"; readonly glyph?: boolean; readonly control?: string } | { readonly at: "footer"; readonly control?: string };',
        'export const dismissals: readonly Dismiss[] = [{ at: "header", glyph: true }, { at: "header", control: "c" }];',
        "interface Looks { readonly theme: string; readonly density: string }",
        'export const patches: readonly Partial<Looks>[] = [{ theme: "t" }, { density: "d" }];',
        // the twins: a reader takes one field or the other, the evidence a mapped copy can be an alternative
        "interface Sources { readonly inline: string; readonly remote: string }",
        'const source: Partial<Sources> = mode ? { inline: "i" } : { remote: "r" };',
        "export const sourceValue = source.inline ?? source.remote;",
        "interface Feeds { readonly rss: string; readonly atom: string }",
        'const feed: Partial<Feeds> = mode ? { rss: "r" } : { atom: "a" };',
        "export const feedUrl = feed.rss !== undefined ? feed.rss : feed.atom;",
        'const change: UpdateSetSource<typeof notes> = mode ? { title: "t" } : { body: "b" };',
        "export const changed = change.title ?? change.body;",
        'const added: InsertValue<typeof notes> = mode ? { id: "i" } : { body: "b" };',
        "export const addedValue = added.id ?? added.body;",
        // the twins: a select row, or the insert row itself, beside optional fields of their own
        "interface Origins { readonly fromFile: string; readonly fromUrl: string }",
        'type Draft = (typeof notes)["$inferSelect"] & Partial<Origins>;',
        'const draft: Draft = mode ? { id: "", title: "", body: "", fromFile: "f" } : { id: "", title: "", body: "", fromUrl: "u" };',
        "export const origin = draft.fromFile ?? draft.fromUrl;",
        "interface Uploads { readonly fromDisk: string; readonly fromLink: string }",
        'type Staged = (typeof notes)["$inferInsert"] & Partial<Uploads>;',
        'const staged: Staged = mode ? { title: "t", fromDisk: "d" } : { body: "b", fromLink: "l" };',
        "export const stagedFrom = staged.fromDisk ?? staged.fromLink;",
        "export const stagedText = staged.title ?? staged.body;",
      ].join("\n"),
    }),
  );
  const inventory = await optionalPairsGraph(root, () => undefined, NO_PLUGINS);
  expect(
    groupsWith(inventory, ["listSize", "inPopover", "glyph", "clamp", "percent", "file", "theme", "inline", "rss", "title", "id", "fromFile", "fromDisk"]),
  ).toEqual([
    "Compact: percent,window",
    "Dismiss: control,glyph",
    "Draft: fromFile,fromUrl",
    "Partial<Feeds>: atom,rss",
    "Partial<Sources>: inline,remote",
    "Src: file,url",
    "Staged: body,fromDisk,fromLink,title",
  ]);
  // the insert row's two columns written apart pair with nothing, while each field beside them still pairs
  const staged = inventory.optionalAlternatives
    .filter(({ group }) => inventory.optionalGroups[group]?.owner === "Staged")
    .map(({ left, right }) => [left, right].toSorted().join(","));
  expect(staged.toSorted()).toEqual(["body,fromDisk", "fromDisk,fromLink", "fromLink,title"]);
});

// Plugin author source the author programs hold is production: a bundle's co-set cancels a pair the product writes
// apart, and a bundle's separate writes make a pair. A tree with no plugin sources is the control.
test("an author program's constructions count as production writes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const author = "packages/showcase-plugins/tsconfig.author-main.json";
  const writer = (input: string, setter: string): string =>
    [`import type { ${input} } from "../../../a/src/choice.ts";`, "declare const fileMode: boolean;", setter].join("\n");
  const root = await plantedTree({
    ...graphTree({
      [`${GRAPH_SOURCE}/choice.ts`]: [
        "export interface ByFile { readonly file?: string; readonly url?: string }",
        "export interface ByPath { readonly path?: string; readonly href?: string }",
        "declare const fileMode: boolean;",
        'const input: ByFile = fileMode ? { file: "a" } : { url: "b" };',
        "export const selected = (other: ByPath): string | undefined => (input.file ?? input.url) ?? (other.path ?? other.href);",
      ].join("\n"),
    }),
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: author }] }),
    [author]: plantedTsconfig({ lib: LIB, include: ["bundles/*/main.ts", "plugins/*/main.ts", "../plugin-sdk/main.d.ts"] }),
    "packages/plugin-sdk/package.json": JSON.stringify({ name: "@orb/plugin-sdk", files: ["main.d.ts"] }),
    "packages/plugin-sdk/main.d.ts": "export declare const sdkVersion: string;",
    "packages/showcase-plugins/bundles/demo/main.ts": writer("ByFile", 'export const both: ByFile = { file: "a", url: "b" };'),
    "packages/showcase-plugins/plugins/other/main.ts": writer("ByPath", 'export const one: ByPath = fileMode ? { path: "a" } : { href: "b" };'),
  });
  const plugins = readPluginSources(root);
  expect(readPairs(await optionalPairsGraph(root, () => undefined, plugins))).toEqual([["ByPath", "path", "href"]]);
  expect(readPairs(await optionalPairsGraph(root, () => undefined, NO_PLUGINS))).toEqual([["ByFile", "file", "url"]]);
});
