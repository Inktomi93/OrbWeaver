// How a name finds its declarations and what it does to them: each occurrence keeps its own roles, a private name is a
// reference, a field initializer writes, a literal handed to a generic parameter writes the slot its sibling argument
// types, statics fill the slot a class value lands in, a lazy import uses its module whole, and an object literal's
// method finds its own literal.
import { expect, test } from "@orb/testkit/tooling";
import type { Node } from "@typescript/native/ast";
import { isPropertyAccessExpression } from "@typescript/native/ast";
import { Resolver } from "../../../tooling/src/unwired/graph/resolve.ts";
import { NativeWorld } from "../../../tooling/src/unwired/native.ts";
import { GRAPH_SOURCE, graphScan, graphTree, labelsIn, WORLD, ZOD_MODULE } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/names.ts`;
const source = (lines: readonly string[]): Record<string, string> => ({ [FILE]: lines.join("\n") });

test("two occurrences of one member in one walk each keep their own role", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Box { value: string; spare: string }",
      'export const fill = (box: Box): void => { box.value = "x"; box.spare = "y"; };',
      "export const read = (box: Box): string => box.value;",
    ]),
  );
  expect(labelsIn(scan, "member-write-only", FILE).map((label) => label.split("  ")[0])).toEqual(["Box.spare"]);
});

test("a private name reads the field it names", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source(["export class Counter {", "  #count = 0;", "  #unread = 0;", "  next(): number {", "    return this.#count;", "  }", "}"]),
  );
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual(["Counter.#unread"]);
});

test("a class field's initializer writes it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, source(["export class Store {", "  items: string[] = [];", "  label?: string;", "}"]));
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual(["Store.items"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Store.label"]);
});

test("a literal handed to a generic parameter writes the slot a sibling function argument types", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Props { readonly size?: string; readonly tone?: string }",
      "declare function select<T>(recipe: (props: T) => string, selection: T): string;",
      "declare const recipe: (props: Props) => string;",
      'export const chosen = select(recipe, { size: "lg" });',
    ]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Props.tone"]);
});

test("a literal written into an optional slot writes the slot's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Options { readonly inner?: { readonly a?: string; readonly b?: string } }",
      "declare function configure(options?: Options): void;",
      'export const go = (): void => configure({ inner: { a: "x" } });',
    ]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Options.inner.b"]);
});

test("a class handed into a typed slot fills it with its statics", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export class Impl {",
      '  static make(): string { return "made"; }',
      '  static spare(): string { return "spare"; }',
      "}",
      "export interface Factory { make(): string }",
      "export const factory: Factory = Impl;",
    ]),
  );
  // whoever holds the slot calls through it: the static that fills it is used, the one that fills nothing is not
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Impl.spare", "Factory.make"]);
});

test("a lazy import uses its module whole; a destructured one only the names it binds", { timeout: 120_000 }, async ({ plantedTree }) => {
  const main = `${GRAPH_SOURCE}/main.ts`;
  const scan = await graphScan(
    plantedTree,
    {
      [main]: ['void import("./page.ts");', 'const { one } = await import("./other.ts");', "void one;"].join("\n"),
      [`${GRAPH_SOURCE}/page.ts`]: 'export const Page = "page";',
      [`${GRAPH_SOURCE}/other.ts`]: ['export const one = "one";', 'export const two = "two";'].join("\n"),
    },
    { entries: [main] },
  );
  expect(scan.analysis.dead.map(({ label }) => label)).toEqual([`${GRAPH_SOURCE}/other.ts:two`]);
});

test("an object literal's method fills the member of its own literal's slot", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source(["export interface Api { readonly inner: { run(): void } }", "export const api: Api = { inner: { run() {}, extra() {} } } as Api;"]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["api.extra"]);
});

test("a read through a generic keyof walks back to the type the keys came from", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Settings { readonly theme: string; readonly size: number }",
      // the record's keys are a generic keyof spelled in the callee, not at the read: only keyof T's own target leads the walk to Settings
      "declare function flagsFor<V>(): Record<keyof V, boolean>;",
      "export const themed = <T extends Settings>(): boolean => flagsFor<T>().theme;",
    ]),
  );
  expect(scan.lostReads.filter((read) => read.startsWith(FILE))).toEqual([]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Settings.size"]);
});

test("a zod enum's key is homed at the tuple only when the tuple holds the name read", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      ...source([
        'import { z } from "zod";',
        'export const KINDS = ["a", "b"] as const;',
        "export const kindSchema = z.enum(KINDS);",
        "export const picked = (): string => kindSchema.enum.a;",
      ]),
    }),
  );
  using world = NativeWorld.open(root, WORLD);
  const resolver = new Resolver(world);
  const file = world.files.find((planted) => world.siteOf(planted).file === FILE);
  const receiverOf = (node: Node): Node | undefined =>
    isPropertyAccessExpression(node) && node.getText() === "kindSchema.enum" ? node : node.forEachChild(receiverOf);
  const receiver = file === undefined ? undefined : receiverOf(file);
  if (receiver === undefined) {
    throw new Error("the planted read kindSchema.enum.a is missing");
  }
  const [held, absent] = world.batch([resolver.annotationOrigin(receiver, "a"), resolver.annotationOrigin(receiver, "c")]);
  expect(held?.end).toBe("home");
  // a name the tuple lacks (a key the tuple dropped) is no key of the enum: the walk ends unresolved
  expect(absent?.decls).toEqual([]);
});

// A read of a library's own member (`RegExp.test`, `Array.join`, `Object.fromEntries`) ends at the library's
// declaration: it is the library's read, never a lost one, however often the walk asks the checker about it. A walk
// step that ran a batch of its own would read the outer round's answers around it; NativeWorld.batch throws on that, so
// this walk fails loudly instead of losing the reads.
test("a library member's read ends at the library, never lost", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export const matches = (text: string): boolean => /a/u.test(text) && /b/u.test(text);",
      'export const joined = (parts: readonly string[]): string => parts.join(",") + [...parts].join(";");',
      "export const table = (pairs: readonly (readonly [string, number])[]): Record<string, number> => Object.fromEntries(pairs);",
      "export const again = (pairs: readonly (readonly [string, number])[]): Record<string, number> => Object.fromEntries(pairs);",
    ]),
  );
  expect(scan.lostReads.filter((read) => read.startsWith(FILE))).toEqual([]);
});
