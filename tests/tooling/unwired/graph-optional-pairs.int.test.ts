// Optional fields supplied separately, read off the reference graph: two optional members of one home that production
// writes at separate constructions and never sets together. A co-set at one construction is the control each case holds,
// and a fallback or DOM read of both is the evidence a pair is an alternative.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { optionalPairsGraph } from "../../../tooling/src/unwired/index.ts";
import { pluginSources, readPluginSources } from "../../../tooling/src/unwired/plugin-surface.ts";
import { GRAPH_SOURCE, graphTree, JSX_NAMESPACE, LIB, ZOD_MODULE } from "./_planted.ts";

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
  ]);
  // two schemas' outputs are two contexts, never one group of every `shared`
  const zodGroups = inventory.optionalGroups.filter((group) => group.fields.some(({ name }) => name === "onlyFirst" || name === "onlySecond"));
  expect(zodGroups.map((group) => group.fields.map(({ name }) => name).sort())).toEqual([
    ["onlyFirst", "shared"],
    ["onlySecond", "shared"],
  ]);
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
