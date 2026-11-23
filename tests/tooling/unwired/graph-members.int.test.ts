// What a member's own declaration and its writers decide: React state nothing reads or sets, members that only shape a
// type (an exclusion marker, a `satisfies` check), a computed literal key, a send walking lists and index signatures,
// and a mapped type that transforms its members using them as keys.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn, REACT_TYPES } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/members.ts`;
const source = (lines: readonly string[]): Record<string, string> => ({ [FILE]: lines.join("\n") });

// The SDK ships what its manifest lists, so a declaration file the manifest adds publishes its members with no list
// of SDK files to update; a contract member it does not publish is judged.
test("a plugin contract member the SDK manifest's declarations publish is read by guests", { timeout: 120_000 }, async ({ plantedTree }) => {
  const contract = "packages/contracts/src/plugin/thing.ts";
  const scan = await graphScan(plantedTree, {
    [contract]: [
      "export interface PluginThing { readonly shown: string; readonly hidden: string }",
      'export const thing = (): PluginThing => ({ shown: "s", hidden: "h" });',
    ].join("\n"),
    "packages/plugin-sdk/package.json": JSON.stringify({ name: "@orb/plugin-sdk", files: ["extra.d.ts"] }),
    "packages/plugin-sdk/extra.d.ts": "export interface PluginThing { readonly shown: string }",
  });
  expect(labelsIn(scan, "member-write-only", contract)).toEqual(["PluginThing.hidden"]);
});

test("a state value nothing reads and a setter nothing calls are reported; used ones are not", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...REACT_TYPES,
    ...source([
      'import { useState } from "react";',
      "export const panel = (): boolean => {",
      "  const [open, setOpen] = useState(false);",
      "  const [count, setCount] = useState(0);",
      "  setCount(1);",
      "  return open;",
      "};",
    ]),
  });
  expect(labelsIn(scan, "state-never-read", FILE)).toEqual(["4 value"]);
  expect(labelsIn(scan, "state-never-set", FILE)).toEqual(["3 setter"]);
});

test("an exclusion marker is judged by nothing, though a write into its union lands on it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'export type Shape = { readonly kind: "a"; readonly x: string; readonly y?: never } | { readonly kind: "b"; readonly y: string; readonly x?: never };',
      'export const make = (): Shape => ({ kind: "a", x: "1" });',
      "export const kindOf = (shape: Shape): string => shape.kind;",
    ]),
  );
  expect(labelsIn(scan, "member-write-only", FILE).map((label) => label.split("  ")[0])).toEqual(["Shape.x"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Shape.y"]);
});

test("a type literal that only types a satisfies clause is a shape check, not a home", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'export const ITEMS = [{ value: "a", label: "A" }] satisfies readonly { value: string; label: string }[];',
      "export interface Kept { readonly spare: string }",
    ]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Kept.spare"]);
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual([]);
});

test("a computed literal key names its member, in a declaration and in a write", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'export interface Row { ["sort_order"]: number; other: number }',
      'export const row: Row = { ["sort_order"]: 1, other: 2 };',
      "export const read = (value: Row): number => value.other;",
    ]),
  );
  expect(labelsIn(scan, "member-write-only", FILE).map((label) => label.split("  ")[0])).toEqual(["Row.sort_order"]);
});

test("a send walks into list elements and index signature values", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Item { readonly a: string }",
      "export interface Leaf { readonly b: string }",
      "export interface Bag { readonly byId: { readonly [id: string]: Item }; readonly list: readonly Leaf[] }",
      "export interface Apart { readonly c: string }",
      "declare function json(value: unknown): void;",
      "export const dump = (bag: Bag, apart: Apart): void => json(bag);",
    ]),
  );
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Item.a", "Leaf.b", "Bag.byId", "Bag.list"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Apart.c"]);
});

test("a mapped type that transforms its members fills a table keyed by them: a key use, not a write", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Values { readonly name: string; readonly age: number }",
      "export interface Field<T> { readonly value: T }",
      "export type Fields = { readonly [F in keyof Values]: Field<Values[F]> };",
      'export const fields: Fields = { name: { value: "" }, age: { value: 0 } };',
    ]),
  );
  expect(labelsIn(scan, "member-write-only", FILE).map((label) => label.split("  ")[0])).toEqual(["Field.value"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual([]);
});

// A method is judged once its class is live: one nothing calls is untouched. A member code we do not see calls stays
// live: an override its base is called through, an interface implementation, a lib override, a React lifecycle method
// and a runtime protocol member.
test("a class method nothing calls is untouched; one called, dispatched or called by the runtime is not", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...REACT_TYPES,
    ...source([
      'import { Component } from "react";',
      "export class Box {",
      "  spare(): number { return 1; }",
      "  static spareStatic(): number { return 2; }",
      "  shown(): number { return 3; }",
      '  toString(): string { return "box"; }',
      "  toJSON(): object { return {}; }",
      "  [Symbol.dispose](): void {}",
      "}",
      "export const seen = new Box().shown();",
      "export class Base { step(): number { return 1; } }",
      "export class Sub extends Base { override step(): number { return 2; } }",
      "export const stepped = (base: Base): number => base.step();",
      "export interface Runner { run(): void }",
      "export class Job implements Runner { run(): void {} }",
      "export const ran = (runner: Runner): void => runner.run();",
      "export class View extends Component { render(): unknown { return null; } componentDidMount(): void {} }",
    ]),
  });
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Box.spare", "Box.spareStatic"]);
});
