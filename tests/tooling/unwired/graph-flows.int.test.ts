// How the flow walk carries a value through a generic's type arguments, a library's type parameter, a conditional, a
// zod validator and a reflective platform call. Each case keeps a member nothing writes, reads or sends, so a rule that
// pairs too much fails it as surely as a rule that pairs too little fails the member it credits.
import { expect, test } from "@orb/testkit/tooling";
import type { GraphScan } from "../../../tooling/src/unwired/index.ts";
import { MEMBER_BUCKETS } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, labelsIn, libraryModule, ZOD_MODULE } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/flows.ts`;
const source = (lines: readonly string[]): Record<string, string> => ({ [FILE]: lines.join("\n") });
const bucketsIn = (scan: GraphScan, file = FILE): readonly string[] =>
  MEMBER_BUCKETS.flatMap((bucket) => labelsIn(scan, bucket, file).map((label) => `${bucket} ${label.split("  ")[0] ?? ""}`));

// A router's mutation options and a client's vars twin of its input, joined through `Options<V>`: the client writes
// `NominateVars` and the router reads `Input`, so the write reaches the read only when `V` pairs backwards.
const NOMINATE = [
  "export interface Input { readonly chatId: string; readonly offer?: string }",
  'const verb = async (input: Input): Promise<string> => input.chatId + (input.offer ?? "");',
  "const router = { nominate: { mutationOptions: (): Options<Input> => ({ mutationFn: verb }) } };",
  "export interface NominateVars { readonly chatId: string; readonly offer?: string; readonly stale?: string }",
  "const entity = <V>(config: { readonly options: (t: typeof router) => Options<V> }): ((vars: V) => void) => (vars) => {",
  "  void config.options(router).mutationFn?.(vars);",
  "};",
  "export const useNominate = entity<NominateVars>({ options: (t) => t.nominate.mutationOptions() });",
  'export const fire = (): void => useNominate({ chatId: "c", offer: "o" });',
];

test("a callback written as a method takes its argument into the generic", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, source(["interface Options<V> { mutationFn?(vars: V): Promise<unknown> }", ...NOMINATE]));
  expect(bucketsIn(scan)).toEqual(["member-untouched NominateVars.stale"]);
});

// `set` keeps what it takes, so a map filled through a wider instance fills the map it was set on and the reads of the
// narrower one read the write. `has` and `echo` compare or hand back what they take, paired straight; `includes`,
// `has` and `reduce` reached through a generic that holds the collections lend nothing either. So `Stored.label` is
// read through `Probe` and never written by the probes.
test("a value a method keeps fills the instance it was set on; a comparing method fills nothing", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Leaf { readonly label: string; readonly note?: string }",
      "export interface Wide { readonly label: string; readonly note?: string; readonly spare?: string }",
      'const fill = (x: Map<string, Wide>): void => { x.set("a", { label: "l", note: "n" }); };',
      "export const shown = (): string => { const leaves = new Map<string, Leaf>(); fill(leaves); return [...leaves.values()].map((leaf) => leaf.label).join(); };",
      "export interface Stored { readonly label?: string; readonly kept: string }",
      "export interface Probe { readonly label?: string }",
      "export interface Bag<T> { readonly items: ReadonlyArray<T>; readonly seen: ReadonlySet<T> }",
      "export interface Pool<T> { echo(value: T): T; readonly first?: T }",
      'const look = (bag: Bag<Probe>): boolean => bag.items.includes({ label: "p" }) || bag.seen.has({ label: "q" }) || bag.items.reduce((a) => a, { label: "r" }).label === "";',
      'const probe = (seen: ReadonlySet<Probe>, pool: Pool<Probe>): boolean => seen.has({ label: "s" }) || pool.echo({ label: "e" }).label === "";',
      "declare const NONE: ReadonlySet<never>;",
      "declare const POOL: Pool<Stored>;",
      "const stored: Bag<Stored> = { items: [], seen: NONE };",
      'const one: Stored = { kept: "k" };',
      "export const looked = (): string => String(look(stored)) + String(probe(stored.seen, POOL)) + one.kept;",
    ]),
  );
  expect(bucketsIn(scan)).toEqual([
    "member-write-only Leaf.note",
    "member-write-only Wide.note",
    "member-untouched Wide.spare",
    "member-untouched Pool.first",
    "member-read-only Stored.label",
  ]);
});

// `fill` pushes into the list it takes as `Wide[]`, and the list is the caller's `Leaf[]`, whose reads read the push.
// A readonly list only hands its elements out, and nothing writes into the mutable list `peek` takes, so what `look`
// takes as `View` and `peek` as `Peeked` stays written and never read.
test("a value pushed through a wider element type writes the narrower element", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Leaf { readonly label: string; readonly note?: string }",
      "export interface Wide { readonly label: string; readonly note?: string; readonly spare?: string }",
      "export interface Shown { readonly label: string; readonly note?: string }",
      "export interface View { readonly label: string; readonly note?: string }",
      'const fill = (into: Wide[]): void => { into.push({ label: "l", note: "n" }); };',
      "export interface Peeked { readonly label: string; readonly note?: string }",
      "const look = (from: readonly View[]): number => from.length;",
      "const peek = (from: Peeked[]): number => from.length;",
      "export const shown = (): string => {",
      "  const leaves: Leaf[] = [];",
      "  fill(leaves);",
      '  return leaves.map((leaf) => leaf.label + (leaf.note ?? "")).join();',
      "};",
      "export const viewed = (): string => {",
      '  const kept: Shown[] = [{ label: "k", note: "n" }];',
      "  look(kept);",
      "  peek(kept);",
      "  return kept.map((one) => one.label).join();",
      "};",
    ]),
  );
  expect(bucketsIn(scan)).toEqual([
    "member-write-only Shown.note",
    "member-write-only View.label",
    "member-write-only View.note",
    "member-write-only Peeked.label",
    "member-write-only Peeked.note",
    "member-untouched Wide.spare",
  ]);
});

// A tree generic's `push` stores its argument in the instance and answers a count, so `Stack<Leaf>` handed as
// `Stack<Wide>` pairs both ways and the caller's reads of `Leaf` read the push. `has` only compares its argument, so the
// probe it takes as `Probe` fills nothing of `Stored`, whose `label` stays read and never written.
test("a tree generic's method that stores its argument pairs both ways; one that compares does not", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Leaf { readonly label: string; readonly note?: string }",
      "export interface Wide { readonly label: string; readonly note?: string; readonly spare?: string }",
      "export interface Stored { readonly label?: string; readonly kept: string }",
      "export interface Probe { readonly label?: string }",
      "export class Stack<T> {",
      "  readonly #items: T[] = [];",
      "  push(value: T): number {",
      "    this.#items.push(value);",
      "    return this.#items.length;",
      "  }",
      "  has(value: T): boolean {",
      "    return this.#items.includes(value);",
      "  }",
      "  peek(): T | undefined {",
      "    return this.#items.at(-1);",
      "  }",
      "}",
      "export class Pool<T> {",
      "  readonly #items: T[] = [];",
      "  has(value: T): boolean {",
      "    return this.#items.includes(value);",
      "  }",
      "  first(): T | undefined {",
      "    return this.#items[0];",
      "  }",
      "}",
      'const fill = (stack: Stack<Wide>): void => { stack.push({ label: "l", note: "n" }); };',
      'const look = (pool: Pool<Probe>): boolean => pool.has({ label: "p" });',
      "export const shown = (): string => {",
      "  const leaves = new Stack<Leaf>();",
      "  fill(leaves);",
      "  const top = leaves.peek();",
      '  return (top?.label ?? "") + (top?.note ?? "") + String(leaves.has({ label: "h" }));',
      "};",
      "export const looked = (): string => {",
      "  const pool = new Pool<Stored>();",
      '  const one: Stored = { kept: "k" };',
      '  return String(look(pool)) + (pool.first()?.label ?? "") + one.kept;',
      "};",
    ]),
  );
  expect(bucketsIn(scan)).toEqual(["member-write-only Probe.label", "member-untouched Wide.spare", "member-read-only Stored.label"]);
});

// The walk of `Options` runs once for each pair that meets it in one batch; a declared `out` wins in every one of them,
// so `V` pairs forward only and the client's vars stay written and never read. A declared `in` wins over a value the
// walk sees coming out, so `Box<Leaf>` handed as `Box<Shown>` reads nothing of `Leaf`.
test("a declared variance modifier wins in every walk of its generic", { timeout: 120_000 }, async ({ plantedTree }) => {
  const declaredOut = await graphScan(plantedTree, source(["interface Options<out V> { readonly mutationFn?: (vars: V) => Promise<unknown> }", ...NOMINATE]));
  expect(bucketsIn(declaredOut)).toEqual([
    "member-write-only NominateVars.chatId",
    "member-write-only NominateVars.offer",
    "member-untouched NominateVars.stale",
  ]);
  const declaredIn = await graphScan(
    plantedTree,
    source([
      "export interface Box<in T> { readonly value: T }",
      "export interface Leaf { readonly label: string }",
      "export interface Shown { readonly label: string }",
      'const leaf: Box<Leaf> = { value: { label: "l" } };',
      "const show = (box: Box<Shown>): string => box.value.label;",
      "export const shown = show(leaf);",
    ]),
  );
  expect(bucketsIn(declaredIn)).toEqual(["member-write-only Leaf.label"]);
});

// `Warm` meets `Pong` first, whose walk meets `Ping`, whose walk meets `Pong` again on its own stack: that cycle answers
// with `Pong`'s declared `in`, so `Ping` takes `T` both ways and `Wrap` after it too. A write of `Shown` through the
// wrapped `held` then fills `Leaf`, whose read sees the write; `Shown.spare` is written nowhere and read nowhere.
test("a cycle in the variance walk answers with the declared modifier", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [`${GRAPH_SOURCE}/a-warm.ts`]: [
      "export interface Ping<T> { readonly pong: Pong<T>; held: T }",
      "export interface Pong<in T> { readonly ping?: Ping<T> }",
      "export interface Warm<T> { readonly pong: Pong<T> }",
      "declare const warm: Warm<string>;",
      "const take = (value: Warm<number | string>): boolean => value.pong.ping === undefined;",
      "export const warmed = take(warm);",
    ].join("\n"),
    ...source([
      'import type { Ping } from "./a-warm.ts";',
      "export interface Leaf { readonly label?: string; readonly kept: string }",
      "export interface Shown { readonly label?: string; readonly kept: string; readonly spare?: string }",
      "export interface Wrap<T> { readonly ping: Ping<T> }",
      'const one: Leaf = { kept: "k" };',
      "declare const wrapped: Wrap<Leaf>;",
      'const fill = (wrap: Wrap<Shown>): void => { wrap.ping.held = { label: "s", kept: "k" }; };',
      'export const shown = (): string => { fill(wrapped); return (wrapped.ping.held.label ?? "") + one.kept; };',
    ]),
  });
  expect(bucketsIn(scan)).toEqual(["member-untouched Shown.spare"]);
});

// An interface declared inside a generic function takes the function's type parameter as a leading type argument, so
// its own `V` sits after it: the router's reads still reach the client's vars.
test("a generic declared inside a generic function pairs its own type arguments by their variance", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Input { readonly chatId: string; readonly offer?: string }",
      "export interface NominateVars { readonly chatId: string; readonly offer?: string; readonly stale?: string }",
      "export function scoped<U>(tag: U): void {",
      "  interface Options<V> { readonly mutationFn?: (vars: V) => Promise<unknown>; readonly tag: U }",
      '  const verb = async (input: Input): Promise<string> => input.chatId + (input.offer ?? "");',
      "  const options = (): Options<Input> => ({ mutationFn: verb, tag });",
      "  const run = (made: Options<NominateVars>): void => { void made.mutationFn?.({ chatId: 'c', offer: 'o' }); void made.tag; };",
      "  run(options());",
      "}",
    ]),
  );
  expect(bucketsIn(scan)).toEqual(["member-untouched NominateVars.stale"]);
});

// `map<T>` declares a `T` of its own: its parameter takes that type in, not the box's, so `Box<Probe>` handed as
// `Box<Other>` still pairs forward only. `Other.label` stays written and never read, and `Probe.label` read and never
// written.
test("a method's own type parameter of the generic's name is not the generic's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Probe { readonly label?: string; readonly kept: string }",
      "export interface Other { readonly label?: string; readonly kept: string }",
      "export interface Box<T> { readonly value: T; map<T>(fn: (x: T) => T): void }",
      "declare const box: Box<Probe>;",
      'const seed: Other = { label: "o", kept: "k" };',
      'const seedProbe: Probe = { kept: "k" };',
      "const take = (b: Box<Other>): string => b.value.kept;",
      'export const shown = (): string => take(box) + (box.value.label ?? "") + seed.kept + seedProbe.kept;',
    ]),
  );
  expect(bucketsIn(scan)).toEqual(["member-write-only Other.label", "member-untouched Box.map", "member-read-only Probe.label"]);
});

// A library's unconstrained type parameter is a slot that names nothing, under an optional property too, where the
// checker's non-nullable form of it (`V & {}`) no longer reads as a type parameter.
test("a value held under a library's unconstrained type parameter is sent", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule([
      "export declare function stash<V>(entry: { readonly value: V }): void;",
      "export declare function hold<V>(entry: { readonly value?: V }): void;",
    ]),
    ...source([
      'import { hold, stash } from "lib";',
      "export interface Stashed { readonly unread: string }",
      "export interface Held { readonly unread: string }",
      "export interface Kept { readonly unread: string }",
      'export const kept: Kept = { unread: "k" };',
      "export const stashed = (item: Stashed, held: Held): void => { stash({ value: item }); hold({ value: held }); };",
    ]),
  });
  expect(bucketsIn(scan)).toEqual(["member-write-only Kept.unread", "member-sent-only Stashed.unread", "member-sent-only Held.unread"]);
});

// A property typed by a union of the library's own type parameters names nothing either. One typed by a type parameter
// or an object type names that object's members, so the value pairs with the instantiation and is not sent.
test("a value held under a union of a library's type parameters is sent", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule([
      "export declare function stash<V, W>(entry: { readonly value?: V | W }): void;",
      "export declare function keep<V>(entry: { readonly value?: V | { readonly fixed: string } }): void;",
    ]),
    ...source([
      'import { keep, stash } from "lib";',
      "export interface Two { readonly unread: string }",
      "export interface Mixed { readonly unread: string }",
      "export const held = (item: Two, mixed: Mixed): void => { stash({ value: item }); keep({ value: mixed }); };",
    ]),
  });
  expect(bucketsIn(scan)).toEqual(["member-sent-only Two.unread", "member-untouched Mixed.unread"]);
});

// A debug probe labels an unreadable value with a checked literal and returns it as `unknown`: each branch of the
// conditional fills the return, so the checked view's members are sent where the probe's reply goes. The same literal
// returned into a typed slot only pairs, and its members stay written and never read. A literal of constant or computed
// values, under a conditional or returned bare, sends its checked type the same way.
test("a checked literal returned as unknown from a conditional sends its checked type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface UnreadableView { readonly storedText: string }",
      "export interface TypedView { readonly storedText: string }",
      "export interface ConstView { readonly a: string }",
      "export interface ComputedView { readonly b: string }",
      "export interface BareView { readonly c: string }",
      "class Unreadable { constructor(readonly text: string) {} }",
      "declare const flag: boolean;",
      "const view = (value: unknown): unknown => (value instanceof Unreadable ? ({ storedText: value.text } satisfies UnreadableView) : value);",
      "const typed = (value: unknown): TypedView | undefined => (value instanceof Unreadable ? ({ storedText: value.text } satisfies TypedView) : undefined);",
      "const constant = (value: unknown): unknown => (value instanceof Unreadable ? ({ a: 'a' } satisfies ConstView) : value);",
      "const computed = (value: unknown): unknown => (flag ? ({ b: String(value) } satisfies ComputedView) : value);",
      "const bare = (value: unknown): unknown => { if (flag) { return { c: 'c' } satisfies BareView; } return value; };",
      "const reply = { json: (value: unknown): unknown => value };",
      "export const probe = (raw: unknown): unknown =>",
      "  reply.json({ config: view(raw), typed: typed(raw) !== undefined, a: constant(raw), b: computed(raw), c: bare(raw) });",
    ]),
  );
  expect(bucketsIn(scan)).toEqual([
    "member-write-only TypedView.storedText",
    "member-sent-only UnreadableView.storedText",
    "member-sent-only ConstView.a",
    "member-sent-only ComputedView.b",
    "member-sent-only BareView.c",
  ]);
});

// An unknown left operand makes `??` and `||` unknown, so the checked literal on the right reaches the `unknown` return
// and its view is sent where the reply goes. The same literal returned into a typed slot only pairs.
test("a checked literal on the right of ?? or || returned as unknown sends its checked type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface NullishView { readonly a: string }",
      "export interface OrView { readonly b: string }",
      "export interface TypedView { readonly c: string; readonly d: string }",
      "declare const raw: unknown;",
      'const nullish = (value: unknown): unknown => value ?? ({ a: "a" } satisfies NullishView);',
      'const or = (value: unknown): unknown => value || ({ b: "b" } satisfies OrView);',
      'const typed = (value: TypedView | undefined): TypedView => value ?? ({ c: "c", d: "d" } satisfies TypedView);',
      "const reply = { json: (value: unknown): unknown => value };",
      "export const probe = (): unknown => reply.json({ a: nullish(raw), b: or(raw), c: typed(undefined).c });",
    ]),
  );
  expect(bucketsIn(scan)).toEqual(["member-write-only TypedView.d", "member-sent-only NullishView.a", "member-sent-only OrView.b"]);
});

// `Object.values` and `structuredClone` read every member of the value they take; a value no reflective call takes keeps
// its member written and never read.
test("Object.values and structuredClone read every member of their value", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    // the platform global, which a node-only planted tree's libs do not declare, from a declaration package
    "node_modules/@types/clone/package.json": JSON.stringify({ name: "@types/clone", types: "index.d.ts" }),
    "node_modules/@types/clone/index.d.ts": "declare function structuredClone<T>(value: T): T;",
    ...source([
      '/// <reference types="clone" />',
      "export interface Valued { readonly a: string }",
      "export interface Cloned { readonly b: string }",
      "export interface Left { readonly c: string }",
      'const valued: Valued = { a: "a" };',
      'const cloned: Cloned = { b: "b" };',
      'export const left: Left = { c: "c" };',
      "export const values = Object.values(valued);",
      "export const copy = structuredClone(cloned);",
    ]),
  });
  expect(bucketsIn(scan)).toEqual(["member-write-only Left.c"]);
});

// A row view built by parsing a literal through its schema: the literal's keys are the values parse returns, so they
// write the schema's keys and the checked type behind them, and the row handed to `mayAct` carries the writes into
// its optional slot. A key the literal lacks (`spare`) stays unwritten, and a `parse` no zod schema declares writes
// nothing (`Loose.funderUserId`).
test("a literal parsed by a zod schema writes the keys it holds", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface RowBase { readonly ownerId: string | null; readonly funderUserId: string | null; readonly spare?: string }",
      "const rowBaseSchema = z.strictObject({ ownerId: z.string(), funderUserId: z.string(), spare: z.string().optional() }) satisfies z.ZodType<RowBase>;",
      "export interface Loose { readonly ownerId: string | null; readonly funderUserId?: string | null }",
      "declare const other: { parse(value: unknown): Loose };",
      "declare const stored: { readonly ownerId: string; readonly funderUserId: string };",
      "export function mayAct(row: { readonly ownerId: string | null; readonly funderUserId?: string | null }): boolean {",
      "  return row.ownerId === null || (row.funderUserId ?? null) === null;",
      "}",
      "const toRowBase = (): RowBase => rowBaseSchema.parse({ ownerId: stored.ownerId, funderUserId: stored.funderUserId });",
      "const loose = (): Loose => other.parse({ ownerId: stored.ownerId, funderUserId: stored.funderUserId });",
      'export const retry = (): boolean => mayAct(toRowBase()) && mayAct({ ownerId: "o" }) && (toRowBase().spare ?? "") === "";',
      'const seed: Loose = { ownerId: "s" };',
      'export const looseOwner = (): string => (loose().funderUserId ?? "") + String(loose().ownerId) + String(seed.ownerId);',
    ]),
  });
  expect(bucketsIn(scan)).toEqual(["member-read-only RowBase.spare", "member-read-only Loose.funderUserId"]);
});

// Every zod validator takes the schema's input: each `Via*` member is written only through the literal one validator is
// handed, and a transform's literal writes the input keys the output no longer names (`In.b`). `In.c`, which no literal
// holds, stays read and never written.
const VALIDATORS = ["parse", "safeParse", "parseAsync", "safeParseAsync"] as const;
test("each zod validator's literal writes the schema input keys it holds", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      ...VALIDATORS.flatMap((name) => [
        `export interface Via_${name} { readonly kept: string; readonly field?: string }`,
        `const ${name}Schema = z.strictObject({ kept: z.string(), field: z.string().optional() }) satisfies z.ZodType<Via_${name}>;`,
        `const ${name}Seed: Via_${name} = { kept: "s" };`,
        `export const ${name}Run = (): unknown => [${name}Schema.${name}({ kept: "k", field: "f" }), ${name}Seed.field ?? "", ${name}Seed.kept];`,
      ]),
      "export interface In { readonly a: string; readonly b?: string; readonly c?: string }",
      "const inSchema = z.object({ a: z.string(), b: z.string().optional(), c: z.string().optional() }) satisfies z.ZodType<In>;",
      "const sized = inSchema.transform((value) => ({ size: value.a.length }));",
      'const seedIn: In = { a: "s" };',
      'export const size = (): number => sized.parse({ a: "a", b: "b" }).size + (seedIn.b ?? "").length + (seedIn.c ?? "").length;',
    ]),
  });
  expect(bucketsIn(scan)).toEqual(["member-read-only In.c"]);
});

// A checked schema's record and map values are held to the declared value types, so each value key twins with the
// declared member of its name: the parsed reads of `label` and `title` read `Entry` and `Keyed`. The keys nothing reads,
// `note` and `memo`, end as one untouched member each.
test("a checked zod schema's record and map values pair with the declared values", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Entry { readonly label: string; readonly note?: string }",
      "export interface Keyed { readonly title: string; readonly memo?: string }",
      "export interface Book { readonly byId: Record<string, Entry>; readonly byKey: Map<string, Keyed> }",
      "const entrySchema = z.object({ label: z.string(), note: z.string().optional() });",
      "const keyedSchema = z.object({ title: z.string(), memo: z.string().optional() });",
      "const bookSchema = z.object({ byId: z.record(z.string(), entrySchema), byKey: z.map(z.string(), keyedSchema) }) satisfies z.ZodType<Book>;",
      "declare const raw: unknown;",
      "export const parsed = (): string => {",
      "  const book = bookSchema.parse(raw);",
      '  return (book.byId["a"]?.label ?? "") + (book.byKey.get("a")?.title ?? "");',
      "};",
    ]),
  });
  expect(bucketsIn(scan)).toEqual(["member-untouched Entry.note", "member-untouched Keyed.memo"]);
});

// A validated literal's key that arrives by a spread (`Outer.b`), sits in a nested literal (`Inner.y`) or in a list
// element (`Item.q`): parse takes each, so each writes its schema key. `Outer.c`, `Inner.z` and `Item.r`, which no
// literal or spread holds, stay read and never written.
const VALIDATED_PARTS = [
  'import { z } from "zod";',
  "export interface Inner { readonly x: string; readonly y?: string; readonly z?: string }",
  "export interface Item { readonly p: string; readonly q?: string; readonly r?: string }",
  "export interface Outer { readonly a: string; readonly b?: string; readonly c?: string; readonly inner: Inner; readonly items: readonly Item[] }",
  "const innerSchema = z.object({ x: z.string(), y: z.string().optional(), z: z.string().optional() }) satisfies z.ZodType<Inner>;",
  "const itemSchema = z.object({ p: z.string(), q: z.string().optional(), r: z.string().optional() }) satisfies z.ZodType<Item>;",
  "const outerSchema = z.object({",
  "  a: z.string(),",
  "  b: z.string().optional(),",
  "  c: z.string().optional(),",
  "  inner: innerSchema,",
  "  items: z.array(itemSchema),",
  "}) satisfies z.ZodType<Outer>;",
  "declare const base: { readonly b: string };",
  'const seed: Outer = { a: "s", inner: { x: "s" }, items: [{ p: "s" }] };',
  "export const read = (): string =>",
  '  [seed.b, seed.c, seed.inner.y, seed.inner.z, seed.items[0]?.q, seed.items[0]?.r, seed.a, seed.inner.x, seed.items[0]?.p].join("");',
];
// Each case holds one part: its member is written and the others' stay read and never written.
const READ_ONLY = (held: string): readonly string[] =>
  ["Inner.y", "Inner.z", "Item.q", "Item.r", "Outer.b", "Outer.c"].filter((member) => member !== held).map((member) => `member-read-only ${member}`);
const VALIDATED_SHAPES = [
  { shape: "spread", held: "Outer.b", call: 'outerSchema.parse({ ...base, a: "a", inner: { x: "x" }, items: [] })', sent: ["member-sent-only base.b"] },
  { shape: "nested", held: "Inner.y", call: 'outerSchema.parse({ a: "a", inner: { x: "x", y: "y" }, items: [] })', sent: [] },
  { shape: "list element", held: "Item.q", call: 'outerSchema.parse({ a: "a", inner: { x: "x" }, items: [{ p: "p", q: "q" }] })', sent: [] },
] as const;
for (const { shape, held, call, sent } of VALIDATED_SHAPES) {
  test(`a zod-validated literal's ${shape} key writes the schema key`, { timeout: 120_000 }, async ({ plantedTree }) => {
    const scan = await graphScan(plantedTree, { ...ZOD_MODULE, ...source([...VALIDATED_PARTS, `export const run = (): unknown => ${call};`]) });
    expect(bucketsIn(scan)).toEqual([...sent, ...READ_ONLY(held)]);
  });
}

// A cost row is returned as a narrower row type, handed on as a turn type that names fewer members still, and only then
// to a parameter that reads `extra`: no type on the way names `extra`, but the row still holds it, so the write reaches
// the read. `Lost.cost.hidden` rides the same way and no slot names it, so it stays written and never read; `Side`'s
// `extra`, never widened into the row type, takes none of the far read; and `turnCost.other` no value holds.
test("a member a narrower slot type does not name rides the value to a slot that names it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Base { readonly content: string }",
      "export interface Turn { readonly content: string; readonly id?: string }",
      "export interface Wire { readonly cost: Base & { readonly extra?: number } }",
      "export interface Lost { readonly cost: Base & { readonly hidden?: number } }",
      "export interface Side { readonly cost: Base & { readonly extra?: number } }",
      "const turnCost = (turn: { readonly content: string; readonly extra?: number; readonly other?: number }): number =>",
      "  turn.content.length + (turn.extra ?? 0) + (turn.other ?? 0);",
      "declare const base: Base;",
      'const wires: Wire[] = [{ cost: { ...base, content: "c", extra: 1 } }];',
      'const lost: Lost[] = [{ cost: { ...base, content: "c", hidden: 1 } }];',
      'export const side: Side = { cost: { ...base, content: "c", extra: 2 } };',
      "const costs = (rows: readonly { readonly cost: Base }[]): Base[] => rows.map((w) => w.cost);",
      "const fit = (turns: readonly Turn[]): number => turns.reduce((sum, turn) => sum + turnCost(turn), 0);",
      "export const total = (): number => fit(costs(wires)) + costs(lost).length;",
    ]),
  );
  expect(bucketsIn(scan)).toEqual([
    "member-write-only Lost.cost.hidden",
    "member-write-only Side.cost",
    "member-write-only Side.cost.extra",
    "member-untouched Turn.id",
    "member-read-only turnCost.other",
  ]);
});

// `inner` records its verdict on the ledger object the caller handed in, and the caller spreads that same object into
// the settle event after the call: the writes through the parameter's writable members are what the spread reads.
// `looks` takes a writable member it never assigns, so the caller's read of `note` reaches nothing of its; `fixed`'s
// members are readonly. Both stay written and never read.
test("a writable slot member assigned through writes the object its caller reads after the call", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Info { readonly id: string; readonly outcome: string; readonly reason: string | null }",
      "export interface Ctx { readonly onSettled: (info: Info) => void }",
      "export const ctx: Ctx = { onSettled: (info) => { console.log(info.id, info.outcome, info.reason); } };",
      "const inner = (round: { readonly settle: { outcome: string; reason: string | null } }): void => {",
      '  round.settle.outcome = "w";',
      '  round.settle.reason = "r";',
      "};",
      "const looks = (round: { readonly settle: { outcome: string; note: string | null } }): string => round.settle.outcome;",
      "const fixed = (round: { readonly settle: { readonly outcome: string; readonly tag: string | null } }): string => round.settle.outcome;",
      "export const outer = (): void => {",
      '  const settle: { outcome: string; reason: string | null } = { outcome: "f", reason: null };',
      "  try {",
      "    inner({ settle });",
      "  } finally {",
      '    ctx.onSettled({ id: "i", ...settle });',
      "  }",
      "};",
      "export const viewed = (): string => {",
      '  const kept: { outcome: string; note: string | null; tag: string | null } = { outcome: "f", note: null, tag: null };',
      "  return looks({ settle: kept }) + fixed({ settle: kept }) + String(kept.note) + String(kept.tag);",
      "};",
    ]),
  );
  expect(bucketsIn(scan)).toEqual(["member-write-only looks.settle.note", "member-write-only fixed.settle.tag"]);
});

// A worker's local host and the process host both carry a `readLog`, but only the process host's literal fills the port
// the domain reads through; the worker runs only `invoke` on its local host. The local `readLog` takes no read from
// the port's, which shares its name and nothing else, and the port's `drop`, which nothing reads, stays written.
test("a host literal's method fills only the port its literal is typed by", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Port { readonly readLog: (id: string) => readonly string[]; readonly drop: (id: string) => void }",
      "export function localHost(): { readonly readLog: (id: string) => readonly string[]; readonly invoke: (id: string) => string } {",
      "  return { readLog: (id) => [id], invoke: (id) => id };",
      "}",
      "const local = localHost();",
      'export const ran = (): string => local.invoke("a");',
      "export const processHost = (): Port => ({ readLog: (id) => [id], drop: (id) => { void id; } });",
      'export const read = (port: Port): readonly string[] => port.readLog("a");',
    ]),
  );
  expect(bucketsIn(scan)).toEqual(["member-write-only Port.drop", "member-write-only localHost.readLog"]);
});

// A getter or setter in a literal no slot types is code, as a method key is: unread, each is untouched, never written.
test("an untyped literal's unread accessor is untouched, as a method key is", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'export const table = { get unread(): string { return "u"; }, set stored(value: string) { void value; }, method(): string { return "m"; }, kept: "k" };',
      "export const used = (): string => table.kept;",
    ]),
  );
  expect(bucketsIn(scan)).toEqual(["member-untouched table.unread", "member-untouched table.stored", "member-untouched table.method"]);
});

// The reader's file is walked before the file that widens the row, so the carried pair is found after the reader's
// slot was filled, and is linked once every file is walked.
test("a carried member reaches a slot named in a file walked earlier", { timeout: 120_000 }, async ({ plantedTree }) => {
  const reader = `${GRAPH_SOURCE}/a-read.ts`;
  const scan = await graphScan(plantedTree, {
    [reader]: [
      "export interface Turn { readonly content: string }",
      "const turnCost = (turn: { readonly content: string; readonly extra?: number; readonly other?: number }): number =>",
      "  turn.content.length + (turn.extra ?? 0) + (turn.other ?? 0);",
      "export const fit = (turns: readonly Turn[]): number => turns.reduce((sum, turn) => sum + turnCost(turn), 0);",
    ].join("\n"),
    ...source([
      'import { fit } from "./a-read.ts";',
      "export interface Base { readonly content: string }",
      "export interface Wire { readonly cost: Base & { readonly extra?: number } }",
      "declare const base: Base;",
      'const wires: Wire[] = [{ cost: { ...base, content: "c", extra: 1 } }];',
      "const costs = (rows: readonly Wire[]): Base[] => rows.map((w) => w.cost);",
      "export const total = (): number => fit(costs(wires));",
    ]),
  });
  expect([...bucketsIn(scan), ...bucketsIn(scan, reader)]).toEqual(["member-read-only turnCost.other"]);
});
