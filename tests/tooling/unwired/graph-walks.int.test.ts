// Walks end on a seen-set, never a fixed depth: a parameter key forwarded through more callers than any cut, and a value
// nested deeper than any cut, still reach the member they name.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/walks.ts`;

test("a lookup keyed by a parameter reads only the key a caller six hops away passes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface Labels { readonly a: string; readonly b: string; readonly c: string }",
      "declare const LABELS: Labels;",
      "const hop1 = (key: keyof Labels): string => LABELS[key];",
      "const hop2 = (key: keyof Labels): string => hop1(key);",
      "const hop3 = (key: keyof Labels): string => hop2(key);",
      "const hop4 = (key: keyof Labels): string => hop3(key);",
      "const hop5 = (key: keyof Labels): string => hop4(key);",
      "const hop6 = (key: keyof Labels): string => hop5(key);",
      'export const shown = (): string => hop6("a");',
    ].join("\n"),
  });
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Labels.b", "Labels.c"]);
});

test("a value nested eight lists deep fills the slot nested as deep, member by member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const deep = (name: string): string => `${name}[][][][][][][][]`;
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface Slot { readonly wanted: number }",
      "export interface Value { readonly wanted: number; readonly spare: number }",
      `const take = (slot: ${deep("Slot")}): number => slot[0]?.[0]?.[0]?.[0]?.[0]?.[0]?.[0]?.[0]?.wanted ?? 0;`,
      `declare const value: ${deep("Value")};`,
      "export const taken = take(value);",
    ].join("\n"),
  });
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Value.spare"]);
});
