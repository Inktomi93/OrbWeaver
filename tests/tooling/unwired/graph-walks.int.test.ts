// Walks end on a seen-set, never a fixed depth: a parameter key forwarded through more callers than any cut, and a value
// nested deeper than any cut, still reach the member they name.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/walks.ts`;
// Past the default stack's depth for a walk that takes a frame per level.
const SIGNATURE_DEPTH = 4000;

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

// A slot and its value nested past any stack's depth: the walk is a worklist, so the leaves still pair.
test("a value nested thousands of signatures deep still fills its slot's members", { timeout: 300_000 }, async ({ plantedTree }) => {
  const chain = (name: string, leaf: string): readonly string[] =>
    Array.from({ length: SIGNATURE_DEPTH }, (_, at) => `type ${name}${String(at)} = () => ${at === SIGNATURE_DEPTH - 1 ? leaf : `${name}${String(at + 1)}`};`);
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface SlotLeaf { readonly a: string; readonly b: string }",
      "interface ValueLeaf { readonly a: string; readonly b: string }",
      ...chain("Slot", "SlotLeaf"),
      ...chain("Value", "ValueLeaf"),
      "declare const value: Value0;",
      "export const slot: Slot0 = value;",
    ].join("\n"),
  });
  // the value's leaf members fill the slot's, so each pair is judged once, at the slot
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["SlotLeaf.a", "SlotLeaf.b"]);
});
// Two recursive generics a value of one fills a slot of the other with: each level instantiates new types
// (`Slot<Box<T>>`), so a walk keyed by type never repeats; keyed by declaration it walks each member pair once.
test("a recursive generic filling its structural twin pairs each member once, however its instantiations nest", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "interface Box<T> { readonly item: T }",
      "export type Slot<T> = { readonly value: T; readonly next: Slot<Box<T>> };",
      "type Value<T> = { readonly value: T; readonly next: Value<Box<T>> };",
      "export interface Read { readonly a: string; readonly spare: string }",
      "interface Given { readonly a: string; readonly spare: string }",
      "declare const given: Value<Given>;",
      "export const slot: Slot<Read> = given;",
      "export const shown = (read: Slot<Read>): string => read.value.a;",
    ].join("\n"),
  });
  // the read reaches Given.a through the slot; each spare and each next is judged once, at the slot it fills
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Box.item", "Slot.next", "Read.spare"]);
});
