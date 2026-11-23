// Members the type system names without a read: a type predicate's pattern, a constraint a type argument fills, a
// literal checked against a `keyof` (a key use only, so a member the product writes and never reads stays write-only),
// and slots the flow walk pairs through a library's symbol keys, a callback's parameters, a library value behind our
// interface and a library's inferred type parameter. Each case keeps one member nothing names, which no type use reaches.
import { expect, test } from "@orb/testkit/tooling";
import type { GraphScan } from "../../../tooling/src/unwired/index.ts";
import { FRESH_BUILD, MEMBER_BUCKETS, scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, graphTree, labelsIn, libraryModule, tailwindVariants } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/type-uses.ts`;

const bucketsIn = (scan: GraphScan): readonly string[] =>
  MEMBER_BUCKETS.flatMap((bucket) => labelsIn(scan, bucket, FILE).map((label) => `${bucket} ${label.split("  ")[0] ?? ""}`));

test("a type predicate's literal keys the members it narrows by, in a declaration and in a filter callback", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface Teach { readonly summary: string }",
      "type Decl = Teach | { readonly none: string; readonly spare: string };",
      'export function isNone(decl: Decl): decl is { readonly none: string; readonly spare: string } { return "none" in decl; }',
      "declare const leaf: { readonly teach: Decl };",
      "export const shown = isNone(leaf.teach) ? null : leaf.teach.summary;",
      "export function recorded(points: readonly { readonly day: string; readonly out: number | null }[]): number[] {",
      "  return points.filter((point): point is { readonly day: string; readonly out: number } => point.out !== null).map((point) => point.out);",
      "}",
    ].join("\n"),
  });
  expect(bucketsIn(scan)).toEqual(["member-untouched Decl.spare", "member-untouched recorded.day"]);
});

test("a generic type spelled with a type argument keys each member its parameter's constraint names", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface ReadOnlyDb { readonly q: number }",
      'export type Assembly<Context extends { readonly db: ReadOnlyDb }> = Omit<Context, "db"> & { readonly db: string };',
      "export interface SeatDeps { readonly db: ReadOnlyDb; readonly emit: () => void; readonly spare: number }",
      "export function create(input: Assembly<SeatDeps>): string { input.emit(); return input.db; }",
    ].join("\n"),
  });
  expect(bucketsIn(scan)).toEqual(["member-untouched ReadOnlyDb.q", "member-untouched SeatDeps.spare"]);
});

test("a list handed to a generic's list parameter fills that parameter's element constraint with its own", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export async function applyRerank<T extends { readonly id: string; readonly sourceText: string | null }>(candidates: readonly T[]): Promise<T[]> {",
      '  return candidates.filter((c) => c.id !== "" && c.sourceText !== null);',
      "}",
      "async function rerankOrKeep<T extends { readonly id: string; readonly sourceText: string | null; readonly spare: string }>(retrieved: T[]): Promise<T[]> { return await applyRerank(retrieved); }",
      'export const kept = rerankOrKeep([{ id: "a", sourceText: null, spare: "" }]);',
    ].join("\n"),
  });
  expect(bucketsIn(scan)).toEqual(["member-untouched rerankOrKeep.spare"]);
});

test("a literal returned where the declared return is an alias of keyof keys that member, which a discarded bump only writes", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface Report { readonly restored: number; readonly failed: number; readonly held: number }",
        "type Disposition = keyof Report;",
        "declare function attempt(): boolean;",
        'async function one(): Promise<Disposition> { return attempt() ? "restored" : "failed"; }',
        "export async function sweep(): Promise<Report> { const report = { restored: 0, failed: 0, held: 0 }; report[await one()] += 1; return report; }",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, () => undefined, {
    ...FRESH_BUILD,
    why: ["restored", "failed", "held"].map((name) => ({ kind: "member", owner: "Report", name }) as const),
  });
  expect(bucketsIn(scan)).toEqual(["member-write-only Report.restored", "member-write-only Report.failed", "member-write-only Report.held"]);
  expect(scan.session.why.filter(({ role }) => role === "key").map(({ member, site }) => [member, site])).toEqual([
    ["Report.restored", `${FILE}:4`],
    ["Report.failed", `${FILE}:4`],
  ]);
});

// `pairs.values()` fills an `Iterable` slot through `[Symbol.iterator]`, a member only its escaped name carries. The
// library Map's value type is bound where the map was typed, so `set` pairs the pair with it and `firsts` reads Pair.b.
test("a library iterable filling a library iterable slot pairs their symbol-keyed members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "export interface Pair { readonly a: string; readonly b: string }",
      "function canonical(x: string, y: string): Pair { return { a: x, b: y }; }",
      "function candidatePairs(): Iterable<{ readonly a: string; readonly b: string; readonly spare?: string }> {",
      "  const pairs = new Map<string, { readonly a: string; readonly b: string; readonly spare?: string }>();",
      '  const pair = canonical("x", "y");',
      "  pairs.set(pair.a, pair);",
      "  return pairs.values();",
      "}",
      "export const firsts = [...candidatePairs()].map((pair) => pair.a + pair.b);",
    ].join("\n"),
  });
  expect(bucketsIn(scan)).toEqual(["member-untouched candidatePairs.spare"]);
});

test("a callback handed to a function-typed parameter pairs its parameter with the slot's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      'const TOKENS = { one: { cssVar: "--a", value: "x" } } as const;',
      "function resolveRamp(resolve: (token: { readonly cssVar: string; readonly value: string; readonly spare?: string }) => string): string { return resolve(TOKENS.one); }",
      "function resolveColor(token: { readonly cssVar: string; readonly value: string; readonly spare?: string }): string { return token.cssVar + token.value; }",
      "export const palette = resolveRamp(resolveColor);",
    ].join("\n"),
  });
  expect(bucketsIn(scan)).toEqual(["member-untouched resolveColor.spare"]);
});

// The library's `encode` declares no `spare`, so no library code reads it.
test("a library value behind our interface pairs our function member's parameters with the library's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule(["export declare const Auto: { make(): { encode(text: string, options?: { add_special_tokens?: boolean }): number[] } };"]),
    [FILE]: [
      'import { Auto } from "lib";',
      "export interface PairTokenizer { readonly encode: (text: string, options?: { add_special_tokens?: boolean; spare?: boolean }) => number[] }",
      "const tok: PairTokenizer = Auto.make();",
      "const plain = { add_special_tokens: false };",
      'export const n = tok.encode("a", plain).length;',
    ].join("\n"),
  });
  expect(bucketsIn(scan)).toEqual(["member-untouched PairTokenizer.encode.spare"]);
});

// `tv()` infers its `variants` type parameter from the table, so the table's contextual type is its own: the library
// takes the value whole. Both `{ root }` literals in onRoot (its return and its assertion) are sent.
test("a value under a library call's inferred type parameter is sent whole", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...tailwindVariants(),
    [FILE]: [
      'import { tv } from "tailwind-variants";',
      'const INKS = { a: "x", b: "y" } as const;',
      "function onRoot<Key extends string>(map: Readonly<Record<Key, string>>): Record<Key, { root: string }> {",
      "  return Object.fromEntries(Object.entries<string>(map).map(([key, cls]) => [key, { root: cls }])) as Record<Key, { root: string }>;",
      "}",
      "export interface Unsent { readonly root: string }",
      'export const spinner = tv({ slots: { root: "r" }, variants: { ink: onRoot(INKS) } });',
    ].join("\n"),
  });
  expect(bucketsIn(scan)).toEqual(["member-sent-only onRoot.root", "member-sent-only onRoot.root", "member-untouched Unsent.root"]);
});
