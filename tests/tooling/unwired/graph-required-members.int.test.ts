// A member the compiler requires where its value fills a slot is used by that slot: each case below deletes cleanly
// only for the member it expects untouched. The slot's own member, when it is read, makes the filler read too.
import { expect, test } from "@orb/testkit/tooling";
import type { GraphScan } from "../../../tooling/src/unwired/index.ts";
import { MEMBER_BUCKETS } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, hono, labelsIn, libraryModule, REACT_TYPES } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/required.ts`;
// Every member bucket's labels for the planted file, each behind its bucket's name.
const untouched = (scan: GraphScan): readonly string[] =>
  MEMBER_BUCKETS.flatMap((bucket) => labelsIn(scan, bucket, FILE).map((label) => `${bucket} ${label.split("  ")[0] ?? label}`));

test("a type member the runtime calls by its well-known name counts as called", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export function guard(): { readonly signal: number; readonly [Symbol.dispose]: () => void; readonly spare: number } {",
      "  return { signal: 1, [Symbol.dispose]: () => undefined, spare: 2 };",
      "}",
      "export const use = (): number => { using held = guard(); return held.signal; };",
      "use();",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-write-only guard.spare"]);
});

test("a rest forward hands its parameters on to the call it spreads them into", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export type Insert = (row: { readonly id: string; readonly name: string }) => string;",
      "const insert: Insert = (row) => row.id + row.name;",
      "export interface Wiring { readonly insert: (row: { readonly id: string; readonly name: string; readonly spare: string }) => string }",
      "export const wire = (input: { readonly insert: Insert }): Wiring => ({ insert: (...args) => input.insert(...args) });",
      'wire({ insert }).insert({ id: "a", name: "b", spare: "c" });',
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-write-only Wiring.insert.spare"]);
});

test("two instantiations of one generic pair their type arguments", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface Token<T> { readonly rows?: T }",
      "const run = <T,>(token: Token<T>): T | undefined => token.rows;",
      "export const make = (): Token<{ readonly id: string; readonly spare: string }[]> => ({});",
      'export const read = (token: Token<{ readonly id: string }[]>): string => run(token)?.[0]?.id ?? "";',
      "read(make());",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-untouched make.spare"]);
});

test("a type parameter handed to a generic pairs its constraint with that generic one", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "const claiming = <P extends { readonly chatId: string }>(verb: (params: P) => string) => (params: P): string => params.chatId + verb(params);",
      "export const claim = <P extends { readonly chatId: string; readonly spare: string }>(verb: (params: P) => string): ((params: P) => string) => claiming(verb);",
      'claim((params: { readonly chatId: string; readonly spare: string }) => params.spare)({ chatId: "a", spare: "b" });',
    ].join("\n"),
  });
  // the literal the returned function takes fills `claim`'s constraint through the arrow's parameter, and no body reads
  // `spare` through it
  expect(untouched(scan)).toEqual(["member-write-only claim.spare"]);
});

test("a type argument fills a library constraint member by member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule(["export declare function customType<T extends { data: unknown; configRequired?: boolean }>(): T;"]),
    [FILE]: [
      'import { customType } from "lib";',
      "export const column = customType<{ data: string; configRequired: true; spare: number }>();",
      "void column;",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-untouched column.spare"]);
});

test("an overload signature fills its implementation parameter by parameter", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export function run(args: { readonly dryRun: true; readonly spare: number }): number;",
      "export function run(args: { readonly dryRun: false }): string;",
      'export function run(args: { readonly dryRun: boolean }): number | string { return args.dryRun ? 1 : "s"; }',
      "run({ dryRun: true, spare: 1 });",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-write-only run.spare"]);
});

test("a literal key a keyof parameter takes names that member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface Vars { readonly session: string; readonly spare: string }",
      "export interface Context<V> { get<K extends keyof V>(key: K): V[K]; set<K extends keyof V>(key: K, value: V[K]): void }",
      "declare const context: Context<Vars>;",
      'context.set("session", "s");',
      'export const read = (): string => context.get("session");',
      "read();",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-untouched Vars.spare"]);
});

test("a literal type argument a keyof constraint takes names that member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface Row { readonly plane: string; readonly spare: string }",
      "declare function everyRow<T, K extends keyof T>(): (rows: readonly T[]) => readonly T[];",
      "declare const input: readonly Row[];",
      'export const rows = everyRow<Row, "plane">()(input);',
      "void rows;",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-untouched Row.spare"]);
});

test("a quoted key a destructuring pattern names reads that member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      'export interface Props { readonly "aria-describedby"?: string; readonly spare?: string }',
      'export const field = ({ "aria-describedby": described }: Props): string => described ?? "";',
      "field({});",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-untouched Props.spare"]);
});

test("a literal member intersected with a union selects its arm", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      'export type Message = { readonly subtype: "a"; readonly meta: number } | { readonly subtype: "b"; readonly other: number };',
      'export const handle = (message: Message & { readonly subtype: "a" }): number => message.meta;',
      "declare const incoming: Message;",
      'if (incoming.subtype === "a") handle(incoming);',
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-untouched Message.other"]);
});

test("a conditional type pattern reads the member it matches", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "declare const loaded: { readonly default: () => number } | (() => number);",
      "type Namespace = typeof loaded;",
      "export type Component = Namespace extends { readonly default: infer C } ? C : Namespace;",
      "export const component: Component = (): number => 1;",
      "component();",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual([]);
});

test("a Hono context variable set and read by its key is read; one nothing names is untouched", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...hono(),
    [FILE]: [
      'import { Hono } from "hono";',
      "export interface Env { readonly Variables: { readonly sessionId: string; readonly spare: string } }",
      "export const app = new Hono<Env>();",
      'app.use(async (c, next) => { c.set("sessionId", "s"); await next(); });',
      'app.get("/", (c) => c.text(c.get("sessionId")));',
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-untouched Env.Variables.spare"]);
});

test("a static a library interface that builds the base class declares is the library's to call", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...REACT_TYPES,
    [FILE]: [
      'import { Component } from "react";',
      "export class Boundary extends Component {",
      "  static getDerivedStateFromError(): null { return null; }",
      '  static displayName = "Boundary";',
      "  static spare(): number { return 1; }",
      "  render(): unknown { return null; }",
      "}",
      "void new Boundary({});",
    ].join("\n"),
  });
  expect(untouched(scan)).toEqual(["member-untouched Boundary.spare"]);
});
