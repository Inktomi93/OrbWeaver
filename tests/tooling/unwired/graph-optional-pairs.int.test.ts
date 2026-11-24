// Optional fields supplied separately, read off the reference graph: two optional members of one home that production
// writes at separate constructions and never sets together. A co-set at one construction is the control each case holds,
// and a fallback or DOM read of both is the evidence a pair is an alternative.
import { expect, test } from "@orb/testkit/tooling";
import { optionalPairsGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, JSX_NAMESPACE, ZOD_MODULE } from "./_planted.ts";

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
  const inventory = await optionalPairsGraph(root, () => undefined);
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
