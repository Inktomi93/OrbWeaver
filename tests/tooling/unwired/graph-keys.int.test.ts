// Reads that reach a member through a key, a twin, a flow or a redeclaration: a lookup keyed by a parameter reads what
// its callers pass, a zod schema's keys are its checked type's members (an inline union's arms, an `extend` literal's and
// a `z.lazy` arrow's too), a reflective platform call reads every member, a redeclared member shares its reads, a
// function filling a function slot pairs its parameters, and a JSX attribute's value fills the prop it is handed to.
import { expect, test } from "@orb/testkit/tooling";
import { TRIAL_VERDICTS } from "../../../tooling/src/unwired/graph/trial.ts";
import { scanGraph, trialGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, graphTree, JSX_NAMESPACE, labelsIn, ZOD_MODULE } from "./_planted.ts";

const [CONFIRMED] = TRIAL_VERDICTS;

const FILE = `${GRAPH_SOURCE}/keys.ts`;
const JSX_FILE = `${GRAPH_SOURCE}/select.tsx`;
const source = (lines: readonly string[]): Record<string, string> => ({ [FILE]: lines.join("\n") });
const bare = (labels: readonly string[]): readonly string[] => labels.map((label) => label.split("  ")[0] ?? label);

test("a lookup keyed by a parameter reads the keys its callers pass, through a caller that hands its own on", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Labels { readonly a: string; readonly b: string; readonly c: string }",
      "declare const LABELS: Labels;",
      "const label = (key: keyof Labels): string => LABELS[key];",
      "const forward = (key: keyof Labels): string => label(key);",
      'export const shown = (): string => forward("a") + label("b");',
    ]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Labels.c"]);
});

// A key typed as a symbol names the one member declared under it, so the table's other members stay unread.
test("a symbol-typed key reads the member declared under that symbol, never the table whole", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'const dispose: unique symbol = Symbol("dispose");',
      "export interface Built { readonly kept: number; readonly spare: number; [dispose](): void }",
      "declare const built: Built;",
      "export const end = (): void => { built[dispose](); };",
      "export const seen = built.kept;",
    ]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Built.spare"]);
});

test("a zod schema's keys are the members of the type it satisfies", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface User { readonly name: string; readonly age: number }",
      "export const userSchema = z.strictObject({ name: z.string(), age: z.number() }) satisfies z.ZodType<User>;",
      "export const nameOf = (user: z.infer<typeof userSchema>): string => user.name;",
    ]),
  });
  // a schema key names a member of the parsed value and writes none, so the twin's unread member is untouched
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["User.age"]);
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual([]);
});

// A schema checked against `z.ZodType<T>` by `satisfies`, by an annotated binding or by a declared return holds its
// output to T at every depth: the transform's `text` is T's `item.text`, which the product reads, and a delete of it
// breaks the check. Each `spare` is the control T does not name, so the trial confirms it and refutes nothing.
test("a schema checked against a declared ZodType reads that type's members at depth", { timeout: 120_000 }, async ({ plantedTree }) => {
  const item = (name: string): string =>
    `z.object({ ${name}: z.object({ text: z.string(), spare: z.string() }).transform((value): { readonly text: string; readonly spare: string } => value) })`;
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      ...source([
        'import { z } from "zod";',
        "export interface Payload { readonly checked: { readonly text: string }; }",
        "export interface Bound { readonly bound: { readonly text: string }; }",
        "export interface Returned { readonly returned: { readonly text: string }; }",
        `export const checkedSchema = ${item("checked")} satisfies z.ZodType<Payload>;`,
        `export const boundSchema: z.ZodType<Bound> = ${item("bound")};`,
        `export const returnedSchema = (): z.ZodType<Returned> => ${item("returned")};`,
        "export const texts = (payload: Payload, bound: Bound, returned: Returned): string => payload.checked.text + bound.bound.text + returned.returned.text;",
      ]),
    }),
  );
  const scan = await scanGraph(root, () => undefined);
  const untouched = bare(labelsIn(scan, "member-untouched", FILE));
  expect(untouched.filter((label) => label.endsWith(".text"))).toEqual([]);
  expect(untouched.filter((label) => label.endsWith(".spare"))).toHaveLength(3);
  const trial = await trialGraph(root, { buckets: ["member-untouched"], limit: null }, () => undefined);
  expect(trial.trials.filter(({ label }) => label.startsWith(`${FILE}:`)).map(({ label, verdict }) => [label.slice(FILE.length + 1), verdict])).toEqual(
    untouched.map((label) => [label, CONFIRMED]),
  );
});

// One schema declaration a check holds to two members of T passes its own reads to each, but never one member's read to
// the other: a delete of `B.name` or `Y.name` still compiles. `A.name` and `X.name`, read directly, are the controls.
test.for([
  {
    shape: "a sub-schema reused under two keys",
    lines: [
      "export interface A { readonly name: string }",
      "export interface B { readonly name: string }",
      "export interface Pair { readonly a: A; readonly b: B }",
      "const inner = z.object({ name: z.string() });",
      "export const pairSchema = z.object({ a: inner, b: inner }) satisfies z.ZodType<Pair>;",
      "export const nameOf = (pair: Pair): string => pair.a.name;",
    ],
    read: "A.name",
    dead: "B.name",
  },
  {
    shape: "a union whose options share a key",
    lines: [
      "export interface X { readonly name: string; readonly x: string }",
      "export interface Y { readonly name: string; readonly y: string }",
      "export interface Holder { readonly item: X | Y }",
      "export const holderSchema = z.object({ item: z.union([z.object({ name: z.string(), x: z.string() }), z.object({ name: z.string(), y: z.string() })]) }) satisfies z.ZodType<Holder>;",
      "export const nameOf = (x: X): string => x.name + x.x;",
    ],
    read: "X.name",
    dead: "Y.name",
  },
  {
    shape: "a top-level union whose options share a key",
    lines: [
      "export interface X { readonly name: string; readonly x: string }",
      "export interface Y { readonly name: string; readonly y: string }",
      "export const eitherSchema = z.union([z.object({ name: z.string(), x: z.string() }), z.object({ name: z.string(), y: z.string() })]) satisfies z.ZodType<X | Y>;",
      "export const nameOf = (x: X): string => x.name + x.x;",
    ],
    read: "X.name",
    dead: "Y.name",
  },
])("a read of one checked member never reaches another through $shape", { timeout: 120_000 }, async ({ lines, read, dead }, { plantedTree }) => {
  const scan = await graphScan(plantedTree, { ...ZOD_MODULE, ...source(['import { z } from "zod";', ...lines]) });
  const untouched = bare(labelsIn(scan, "member-untouched", FILE));
  expect(untouched).toContain(dead);
  expect(untouched).not.toContain(read);
});

// A key both options spell has two members of the checked type as partners, so it takes a check, not a twin; it is still
// its type's member, judged there, never a schema key of its own.
test("a key a discriminated union's options share is judged at the checked type's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      'export interface Ok { readonly status: "ok"; readonly at: string }',
      'export interface Down { readonly status: "down"; readonly at: string; readonly reason: string }',
      'export const healthSchema = z.discriminatedUnion("status", [z.object({ status: z.string(), at: z.string() }), z.object({ status: z.string(), at: z.string(), reason: z.string() })]) satisfies z.ZodType<Ok | Down>;',
      "export const atOf = (health: Ok | Down): string => health.at + health.status;",
    ]),
  });
  expect(bare(labelsIn(scan, "member-validated", FILE))).toEqual([]);
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["Down.reason"]);
});

test("an inline union schema twins each arm's keys with the union's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      'export interface A { readonly kind: "a"; readonly left: string }',
      'export interface B { readonly kind: "b"; readonly right: string }',
      "export const eitherSchema = z.union([z.strictObject({ kind: z.string(), left: z.string() }), z.strictObject({ kind: z.string(), right: z.string() })]) satisfies z.ZodType<A | B>;",
      'export const leftOf = (value: z.infer<typeof eitherSchema>): string => ("left" in value ? value.left : value.kind);',
    ]),
  });
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["B.right"]);
});

test("an extended schema twins its extend literal's keys with the type it satisfies", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Base { readonly id: string }",
      "export interface View extends Base { readonly count: number; readonly hidden: number }",
      "export const baseSchema = z.strictObject({ id: z.string() }) satisfies z.ZodType<Base>;",
      "export const viewSchema = baseSchema.extend({ count: z.number(), hidden: z.number() }) satisfies z.ZodType<View>;",
      "export const countOf = (view: z.infer<typeof viewSchema>): number => view.count;",
    ]),
  });
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["Base.id", "View.hidden"]);
});

// A key an extend literal names replaces the base's, as zod's `util.Extend` drops it, so a read of that key through the
// extension never reads the base's. `Fields.character` is read only through the copy and stays written and never read;
// `Fields.applied`, inherited, is read through it.
test("a key of an extended schema checked against its own type does not read the base's key", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Fields { readonly applied: string; readonly character: string }",
      "export const fieldsSchema = z.object({ applied: z.string(), character: z.string() }) satisfies z.ZodType<Fields>;",
      "export interface Copy { readonly applied: string; readonly character: string }",
      "export const copySchema = fieldsSchema.extend({ character: z.string() }) satisfies z.ZodType<Copy>;",
      'export const fields: Fields = { applied: "a", character: "c" };',
      'export const copy: Copy = { applied: "a", character: "c" };',
      "export const appliedOf = (result: Fields): string => result.applied;",
      "export const copied = (result: z.infer<typeof copySchema>): string => result.applied + result.character;",
    ]),
  });
  expect(bare(labelsIn(scan, "member-write-only", FILE)).filter((label) => label.startsWith("Fields."))).toEqual(["Fields.character"]);
});

// The extension's output carries the base's `applied`, so a read of it through the extension reads `Copy.applied`.
// `unread` is read by nobody, and the extension's own `character` replaces the base's, so `Fields.character` stays
// unread too.
test("a key an extended schema inherits is read on the extension's checked type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Fields { readonly applied: string; readonly character: string; readonly unread: string }",
      "export const fieldsSchema = z.object({ applied: z.string(), character: z.string(), unread: z.string() }) satisfies z.ZodType<Fields>;",
      "export interface Copy { readonly applied: string; readonly character: string; readonly unread: string }",
      "export const copySchema = fieldsSchema.extend({ character: z.string() }) satisfies z.ZodType<Copy>;",
      'export const fields: Fields = { applied: "a", character: "c", unread: "u" };',
      'export const copy: Copy = { applied: "a", character: "c", unread: "u" };',
      "export const copied = (result: z.infer<typeof copySchema>): string => result.applied + result.character;",
    ]),
  });
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["Fields.character", "Fields.unread", "Copy.unread"]);
});

// The twin is zod's: a type of the same name declared anywhere else spells a satisfies check and twins nothing.
test("a satisfies reference twins only through zod's ZodType, never a local type of that name", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      'import type { ZodType as Imported } from "zod";',
      "type ZodType<T> = { readonly _output: T };",
      "export interface Twinned { readonly count: number; readonly hidden: number }",
      "export interface Aliased { readonly count: number; readonly hidden: number }",
      "export interface Local { readonly count: number; readonly hidden: number }",
      "export const twinnedSchema = z.strictObject({ count: z.number(), hidden: z.number() }) satisfies z.ZodType<Twinned>;",
      "export const aliasedSchema = z.strictObject({ count: z.number(), hidden: z.number() }) satisfies Imported<Aliased>;",
      "export const localSchema = z.strictObject({ count: z.number(), hidden: z.number() }) satisfies ZodType<Local>;",
      "export const counts = (a: z.infer<typeof twinnedSchema>, b: z.infer<typeof aliasedSchema>, c: z.infer<typeof localSchema>): number => a.count + b.count + c.count;",
    ]),
  });
  // a twinned key is judged at its type, so the twin's read of `count` reaches it; the local check twins nothing, so its
  // read lands on the schema key and the type's members stay untouched
  expect({ untouched: bare(labelsIn(scan, "member-untouched", FILE)), validated: bare(labelsIn(scan, "member-validated", FILE)) }).toEqual({
    untouched: ["ZodType._output", "Twinned.hidden", "Aliased.hidden", "Local.count", "Local.hidden"],
    validated: ["localSchema.hidden"],
  });
});

// A binding annotated `z.ZodType<T>` checks its schema as `satisfies` does, through a `z.lazy` arrow too, so its keys are
// T's members; an unchecked schema beside them keeps keys of its own, which only validate.
test("a schema bound under a z.ZodType annotation twins its keys, through z.lazy too", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Note { readonly text: string; readonly spare: string }",
      "export interface Tree { readonly kind: string; readonly leaf?: string }",
      "export const noteSchema: z.ZodType<Note> = z.object({ text: z.string(), spare: z.string() });",
      "export const treeSchema: z.ZodType<Tree> = z.lazy(() => z.object({ kind: z.string(), leaf: z.string().optional() }));",
      "export const looseSchema = z.object({ loose: z.string() });",
      "export const shown = (note: Note, tree: Tree): string => note.text + tree.kind;",
    ]),
  });
  expect({ untouched: bare(labelsIn(scan, "member-untouched", FILE)), validated: bare(labelsIn(scan, "member-validated", FILE)) }).toEqual({
    untouched: ["Note.spare", "Tree.leaf"],
    validated: ["looseSchema.loose"],
  });
});

// The platform's reflective calls read every member of the value they take. A `for…in` loop uses each key's name and
// reads no value, so `Looped.l` stays written and never read, as does `Kept.k` under a call of our own that shadows
// `Object`.
test("a reflective platform call reads every member of its value, and a for-in loop only its keys", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Listed { readonly p: string; readonly q: string }",
      "export interface Merged { readonly m: string }",
      "export interface Looped { readonly l: string }",
      "export interface Kept { readonly k: string }",
      'const listed: Listed = { p: "p", q: "q" };',
      'const merged: Merged = { m: "m" };',
      'const looped: Looped = { l: "l" };',
      'const kept: Kept = { k: "k" };',
      "export const entries = Object.entries(listed);",
      "export const copy = Object.assign({}, merged);",
      "export function keysOf(): string[] { const out: string[] = []; for (const key in looped) { out.push(key); } return out; }",
      "export function shadowed(): number { const Object = { entries: (value: Kept): number => (value === kept ? 1 : 0) }; return Object.entries(kept); }",
    ]),
  );
  expect({ writeOnly: bare(labelsIn(scan, "member-write-only", FILE)), sentOnly: bare(labelsIn(scan, "member-sent-only", FILE)) }).toEqual({
    writeOnly: ["Looped.l", "Kept.k"],
    sentOnly: [],
  });
});

// A lookup keyed by a parameter no caller narrows reads only what the parameter's own literal type allows.
test("a parameter-keyed lookup no caller narrows reads the literals its key type allows", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Keyed { readonly x: number; readonly y: number; readonly unkeyed: number }",
      "const keyed: Keyed = { x: 1, y: 2, unkeyed: 3 };",
      'export const pick = (key: "x" | "y"): number => keyed[key];',
    ]),
  );
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["Keyed.unkeyed"]);
});

// An interface member that redeclares an extended member holds the same field: a read of either reads the other, up the
// chain and down it. `Other.title`, of no heritage, stays written and never read.
test("a redeclared interface member and the member it redeclares share their reads", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface BaseCfg { readonly title: string; readonly spare: string }",
      "export interface LeafCfg extends BaseCfg { readonly title: string }",
      'export const leaf: LeafCfg = { title: "t", spare: "s" };',
      "export const shownLeaf = leaf.title;",
      "export interface Card { readonly starred: boolean }",
      "export interface Detail extends Card { readonly starred: boolean }",
      "export const detail: Detail = { starred: true };",
      "export const card: Card = { starred: false };",
      "export const isStarred = card.starred;",
      "export interface Other { readonly title: string }",
      'export const other: Other = { title: "o" };',
    ]),
  );
  expect({
    writeOnly: bare(labelsIn(scan, "member-write-only", FILE)),
    untouched: bare(labelsIn(scan, "member-untouched", FILE)),
  }).toEqual({ writeOnly: ["BaseCfg.spare", "Other.title"], untouched: [] });
});

// `defs satisfies Record<Task, TaskFields>` holds each row to TaskFields, so a read of a row's member reads TaskFields'
// member. `unread` is written in every row and read by nobody, so it stays.
test("an indexed read of a table bound under satisfies reads the checked row type's member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'export type Task = "chat" | "embed";',
      'interface TaskFields { readonly scope: "actor" | "owner"; readonly spend: "fg" | "bg"; readonly unread: string }',
      'const defs = { chat: { scope: "actor", spend: "fg", unread: "u" }, embed: { scope: "owner", spend: "bg", unread: "u" } } as const;',
      "export const TASK_DEFS = defs satisfies Record<Task, TaskFields>;",
      'export const owned = (task: Task): boolean => TASK_DEFS[task].scope === "owner" && TASK_DEFS[task].spend === "fg";',
      "export const asType = (task: Task): TaskFields => TASK_DEFS[task];",
    ]),
  );
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["TaskFields.unread"]);
});

// Rows spread into an array of a wider element type fill that element type: a read of `row.off` reads OffEntry's `off`,
// which flowed in. `why` flows in and nobody reads it.
test("an array spread hands its elements to the array's element type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Entry { readonly name: string }",
      "export interface OffEntry extends Entry { readonly off: string; readonly why: string }",
      'export const offs: readonly OffEntry[] = [{ name: "n", off: "o", why: "w" }];',
      'export const entries: readonly Entry[] = [{ name: "m" }];',
      "const rows: readonly (Entry & { readonly off?: string })[] = [...entries, ...offs];",
      'export const shownRows = rows.map((row) => row.name + (row.off ?? ""));',
    ]),
  );
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["OffEntry.why"]);
});

// A paged query fills its input's cursor from `getNextPageParam`; the same call fills nothing else, so `after` stays read
// and never written. A plain query is the control: it writes no cursor.
test("a paged query writes its input's cursor and no other member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export const listInputSchema = z.object({ limit: z.string(), cursor: z.string().optional(), after: z.string().optional() });",
      "type ListInput = z.infer<typeof listInputSchema>;",
      'export const list = (input: ListInput): string => input.limit + (input.cursor ?? "") + (input.after ?? "");',
      "export const pageOf = (page: string): string => page;",
      "export interface Procedure<I> { infiniteQueryOptions(input: I, next: typeof pageOf): unknown; queryOptions(input: I): unknown }",
      "declare const procedure: Procedure<ListInput>;",
      'export const paged = procedure.infiniteQueryOptions({ limit: "10" }, pageOf);',
      'export const single = procedure.queryOptions({ limit: "1" });',
    ]),
  });
  expect(bare(labelsIn(scan, "member-read-only", FILE))).toEqual(["listInputSchema.after"]);
});

test("a value a schema validates is sent to no receiver; a default the schema returns fills its output", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Row { readonly name: string; readonly spare: string }",
      "export interface Fallback { readonly name: string; readonly unused: string }",
      'const FALLBACK: Fallback = { name: "anon", unused: "x" };',
      "export const rowSchema = z.strictObject({ name: z.string() }).default(FALLBACK);",
      "export const nameOf = (row: Row): string => rowSchema.parse(row).name;",
    ]),
  });
  // parse takes unknown, so a hand-off would send Row whole; the default's name is read through the output it fills
  expect(bare(labelsIn(scan, "member-sent-only", FILE))).toEqual([]);
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["Row.name", "Row.spare"]);
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["Fallback.unused"]);
});

// The flows ruling: every call zod declares takes its arguments as schema input, so no argument is sent to a receiver,
// whether a validator takes it, a builder takes its options or a refinement takes its check and options.
test("no argument of any zod call is a send", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Row { readonly name: string; readonly spare: string }",
      "export interface BuildOptions { readonly error: string; readonly spare: number }",
      "export interface RefineOptions { readonly error: string; readonly spare: number }",
      'const BUILD: BuildOptions = { error: "bad", spare: 1 };',
      'const REFINE: RefineOptions = { error: "short", spare: 2 };',
      "export const rowSchema = z.strictObject({ name: z.string() }, BUILD).refine((row) => row.name.length > 0, REFINE);",
      "export const valid = (row: Row): boolean => rowSchema.safeParse(row).success;",
    ]),
  });
  expect({
    sent: bare(labelsIn(scan, "member-sent-only", FILE)),
    untouched: bare(labelsIn(scan, "member-untouched", FILE)),
    written: bare(labelsIn(scan, "member-write-only", FILE)),
  }).toEqual({
    sent: [],
    untouched: ["Row.name", "Row.spare"],
    written: ["BuildOptions.error", "BuildOptions.spare", "RefineOptions.error", "RefineOptions.spare"],
  });
});

// A row spread into a fresh literal and carried through a library generic still fills the typed slot it lands in.
test("a spread row a generic carries into a typed slot fills that slot's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Plan { readonly seats: ReadonlyMap<string, readonly { readonly chatId: string; readonly forked: boolean }[]> }",
      "declare function all<T>(): T[];",
      "export function plan(): Plan {",
      "  const rows = all<{ cid: string; chatId: string; forked: number; spare: number }>();",
      "  const seats = Map.groupBy(rows.map((row) => ({ ...row, forked: row.forked === 1 })), (row) => row.cid);",
      "  return { seats };",
      "}",
    ]),
  );
  // the seat's chatId has no reader, and the row's chatId deletes with it, so the slot holds the one row; the row's spare
  // fills no slot, and the spread literal's own forked writes the seat's (the plan itself is returned to no reader)
  expect({ untouched: labelsIn(scan, "member-untouched", FILE), written: labelsIn(scan, "member-write-only", FILE) }).toEqual({
    untouched: ["Plan.seats.chatId", "plan.rows.spare"],
    written: ["Plan.seats", "Plan.seats.forked"],
  });
});

test("a function filling a function slot pairs its parameter with the slot's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Event { readonly id: string; readonly extra: string }",
      "export interface Handlers { readonly on: (event: Event) => void }",
      "export interface Mine { readonly id: string; readonly other: string }",
      "const handle = (mine: Mine): void => void mine.id;",
      "export const handlers: Handlers = { on: handle };",
    ]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Event.extra", "Mine.other"]);
});

test("a JSX attribute's value fills the prop it is handed to", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      [JSX_FILE]: [
        JSX_NAMESPACE,
        "export interface Option { readonly value: string; readonly label: string }",
        "export interface SelectProps { readonly items: readonly Option[] }",
        "const Select = (props: SelectProps): JSX.Element => <ul>{props.items.map((item) => item.label)}</ul>;",
        "export interface Entry { readonly value: string; readonly label: string; readonly note: string }",
        "declare const ITEMS: readonly Entry[];",
        "export const page = (): JSX.Element => <Select items={ITEMS} />;",
      ].join("\n"),
    },
    { jsx: true },
  );
  // Entry.value fills Option.value, which requires it: the one row is the prop's, and the two delete together
  expect(labelsIn(scan, "member-untouched", JSX_FILE)).toEqual(["Option.value", "Entry.note"]);
});

// A TanStack Form field path walks the form data type segment by segment: a write method writes each member on the
// path, and any other path argument or a field component's `name` reads each. A member no path or code names stays
// untouched, and an optional member only a path reads reports read-only.
test("a form field path reads or writes each member along its segments", { timeout: 120_000 }, async ({ plantedTree }) => {
  const form = `${GRAPH_SOURCE}/form.tsx`;
  const scan = await graphScan(
    plantedTree,
    {
      [`${GRAPH_SOURCE}/jsx.d.ts`]: JSX_NAMESPACE,
      [`${GRAPH_SOURCE}/form-api.ts`]: [
        "export interface FieldProps<T> { readonly name: string; readonly children?: unknown; readonly data?: T }",
        "export type ReactFormExtendedApi<TFormData> = {",
        "  setFieldValue(name: string, value: unknown): void;",
        "  getFieldValue(name: string): unknown;",
        "  readonly Field: (props: FieldProps<TFormData>) => JSX.Element;",
        "};",
        "export declare function useForm<T>(options: { readonly defaultValues: T }): ReactFormExtendedApi<T>;",
      ].join("\n"),
      [form]: [
        'import { useForm } from "./form-api.ts";',
        "export interface Values { readonly params: { readonly fixed?: number; readonly seed?: number; readonly dead?: number }; readonly title?: string; readonly gone?: string }",
        "export function Editor(): JSX.Element {",
        "  const form = useForm<Values>({ defaultValues: { params: { fixed: 1 } } });",
        "  form.setFieldValue('params.seed', 3);",
        "  const seed = [form.getFieldValue('params.seed'), form.getFieldValue('params.fixed')];",
        "  return <form.Field name='title'>{seed}</form.Field>;",
        "}",
      ].join("\n"),
    },
    { jsx: true },
  );
  expect({
    readOnly: labelsIn(scan, "member-read-only", form),
    untouched: labelsIn(scan, "member-untouched", form),
    writeOnly: labelsIn(scan, "member-write-only", form),
  }).toEqual({ readOnly: ["Values.title"], untouched: ["Values.params.dead", "Values.gone"], writeOnly: [] });
});

// A read off a receiver typed `any` names no member, so it credits none: it is a lost read by its name alone, which the
// member rows can list beside a row of that name. A write through `any` and a typed read are not lost reads.
test("a read off an any receiver is a lost read by its name and credits no member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Shape { readonly kept: string; readonly stray?: string }",
      "export const shape: Shape = { kept: 'k' };",
      "declare const untyped: any;",
      "untyped.written = 1;",
      "export const read = shape.kept + (untyped.stray as string);",
    ]),
  );
  expect(scan.lostReads.filter((read) => read.startsWith(`${FILE}:`)).map((read) => read.slice(read.indexOf(" ") + 1))).toEqual([".stray"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Shape.stray"]);
});
