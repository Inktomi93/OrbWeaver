// The graph's member rows judged the way the fields scan judges its rows: split by the deliberate and judged lists, a
// read-only member reported only when every read sees a default, a validate-only schema key apart, each row sorted with
// its sends named, and a dead row's name searched over the tree with the row's own sites left out.
import { expect, test } from "@orb/testkit/tooling";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { MEMBER_BUCKETS, scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, JUDGED_WORK, judgedExpected, judgedOutcome, labelsIn, plantJudged, ZOD_MODULE } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/row.ts`;
const quiet = (): undefined => undefined;
const TREE = {
  [FILE]: [
    "export interface Row { readonly live: string; readonly kept: string; readonly owned: string; readonly lapsed: string }",
    'export const row: Row = { live: "l", kept: "k", owned: "o", lapsed: "x" };',
    "export const read = (value: Row): string => value.live;",
  ].join("\n"),
  ...JUDGED_WORK,
};

test("a member the deliberate list names reports apart with its reason, keyed as the fields scan keys it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree(TREE));
  const reason = "a planted outside reader";
  const scan = await scanGraph(root, quiet, undefined, { deliberate: [{ file: FILE, home: "Row", member: "kept", reason }], judged: [] });
  expect(scan.members.deliberate.map(({ key, bucket, reason: why }) => [key, bucket, why])).toEqual([[`${FILE}:Row.kept`, "member-write-only", reason]]);
  expect(scan.members.unwired.map(({ member }) => member)).toEqual(["owned", "lapsed"]);
  // the analysis keeps every row: the split is a view over it
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual(["Row.kept", "Row.owned", "Row.lapsed"]);
});

// A row an open item owns reports apart with its item; an entry whose item is done or whose row no longer reports is
// stale, and the done item's row reports as unwired again.
test("a judged member row reports apart with its open item, and an entry for a done item or a gone row is stale", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(graphTree(TREE));
  const first = await scanGraph(root, quiet);
  const judged = plantJudged(first.members, "Row.owned", "Row.lapsed");
  const scan = await scanGraph(root, quiet, undefined, { deliberate: [], judged });
  expect(judgedOutcome(scan.members, "Row.owned", "Row.lapsed")).toEqual(judgedExpected("Row.owned", "Row.lapsed"));
});

const RULES = `${GRAPH_SOURCE}/rules.ts`;

// An optional member read and never written reports only when its home is written by the product and no parameter
// is typed by it: otherwise a caller leaves it unset, or the value comes from outside the tree.
test("a read-only member reports only when every read sees a default the tree chose", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [RULES]: [
        "export interface Prefs { readonly theme?: string; readonly label: string; readonly need: string }",
        'export const prefs = { label: "l" } as Prefs;',
        'export const shown = (): string => (prefs.theme ?? "") + prefs.label + prefs.need;',
        "export interface Opts { readonly flag?: boolean; readonly other: number }",
        "const run = (opts: Opts): boolean => opts.flag ?? opts.other > 0;",
        "export const ran = run({ other: 1 });",
        "export interface Outside { readonly mode?: string }",
        "declare const host: Outside;",
        "export const mode = (): string | undefined => host.mode;",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect(labelsIn(scan, "member-read-only", RULES)).toEqual(["Prefs.theme"]);
  expect(scan.members.unwired.filter(({ bucket }) => bucket === "member-read-only").map(({ member }) => member)).toEqual(["theme"]);
});

// A schema key nothing reads or writes only validates input from outside the tree (owner ruling: a sent field needs a
// receiver read), so it reports apart from the dead and no judged list takes it. A key with a `satisfies` twin is its
// type's member and is judged there.
test("an untwinned schema key nothing reads reports as validated, apart from the judged rows", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      ...JUDGED_WORK,
      [RULES]: [
        'import { z } from "zod";',
        "export const cardSchema = z.strictObject({ name: z.string(), spare: z.string().optional(), inner: z.object({ deep: z.string() }) });",
        "export const nameOf = (raw: unknown): string => cardSchema.parse(raw).name;",
        "export interface User { readonly name: string; readonly age: number }",
        "export const userSchema = z.strictObject({ name: z.string(), age: z.number() }) satisfies z.ZodType<User>;",
        "export const userName = (raw: unknown): string => userSchema.parse(raw).name;",
      ].join("\n"),
    }),
  );
  const first = await scanGraph(root, quiet);
  expect(labelsIn(first, "member-validated", RULES)).toEqual(["cardSchema.spare", "cardSchema.inner", "cardSchema.inner.deep"]);
  expect(labelsIn(first, "member-untouched", RULES)).toEqual(["User.age"]);
  expect(first.members.validated.map(({ key }) => key.slice(RULES.length + 1))).toEqual(["cardSchema.spare", "cardSchema.inner", "cardSchema.inner.deep"]);
  const judged = [{ key: `${RULES}:cardSchema.spare`, item: 4101, tie: "member" as const }];
  const again = await scanGraph(root, quiet, undefined, { deliberate: [], judged });
  expect(again.members.judged).toEqual([]);
  expect(again.members.staleJudged.map(({ key, stale }) => [key, stale])).toEqual([[`${RULES}:cardSchema.spare`, "row-gone"]]);
});

// A value serialized into a file sends every member it holds, nested ones too, to a file: an outside receiver, so the
// sort asks a person.
test("a member sent whole into a file names the file destination, to its nested members, and sorts as ask", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [RULES]: [
        "declare function writeFileSync(path: string, data: string): void;",
        "export interface Export { readonly rows: string; readonly inner: { readonly deep: string } }",
        'export const save = (value: Export): void => writeFileSync("out.json", JSON.stringify(value));',
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  const sent = scan.members.unwired.map(({ key, sent: to, verdict }) => [key.slice(RULES.length + 1), to, verdict]);
  expect(sent).toEqual([
    ["Export.rows", [`file ${RULES}:3`], "ask"],
    ["Export.inner", [`file ${RULES}:3`], "ask"],
    ["Export.inner.deep", [`file ${RULES}:3`], "ask"],
  ]);
});

// A dead row's own declaration and writes are no hit; a spelling of its name the graph never resolved, such as a
// string another file keys a lookup by, can be a read, so it moves the row to ask.
test("the literal search leaves a row's own sites out and moves a row a stray spelling may read to ask", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [RULES]: [
        "export interface Note { readonly zqNoteText: string; readonly zqMarked: string; readonly seen: string }",
        'export const note: Note = { zqNoteText: "n", zqMarked: "m", seen: "s" };',
        "export const seen = (): string => note.seen;",
      ].join("\n"),
      [`${GRAPH_SOURCE}/lookup.ts`]: 'export const KEY = "zqMarked";\n',
    }),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["-c", "user.name=planted", "-c", "user.email=planted@example.invalid", "commit", "-qm", "planted"]);
  const scan = await scanGraph(root, quiet);
  const rows = scan.members.unwired.map(({ member, verdict, literal }) => [member, verdict, literal?.own ?? null, literal?.saved ?? null]);
  expect(rows).toEqual([
    ["zqNoteText", "dead", 2, false],
    ["zqMarked", "ask", 2, true],
  ]);
  expect(scan.members.literalStage?.control.key).toBe(`${RULES}:Note.seen`);
});

// A plain literal's keys and a variant table's values are declared under the same node kind as a schema key, but only a
// schema key is a member of a value the product parses; the others are judged as variant values or not at all.
test("only a schema key among literal keys is judged as a member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      [RULES]: [
        'import { z } from "zod";',
        "export const config = { used: 1, spare: 2 };",
        "export const usedOf = (): number => config.used;",
        "export const formSchema = z.strictObject({ field: z.string() });",
        "export const check = (raw: unknown): unknown => formSchema.parse(raw);",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect(MEMBER_BUCKETS.flatMap((bucket) => labelsIn(scan, bucket, RULES).map((label) => `${bucket} ${label}`))).toEqual(["member-validated formSchema.field"]);
});

// A schema's inferred type maps each key's schema to the value it parses, so a literal typed by it writes the key: the
// home is written, and an optional key no literal sends reports read-only.
test("a literal typed by a schema's inferred type writes its keys, so an optional key nothing sends reports read-only", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      [RULES]: [
        'import { z } from "zod";',
        "const sendSchema = z.strictObject({ id: z.string(), note: z.string().optional() });",
        "export type Send = z.infer<typeof sendSchema>;",
        'export const handle = (raw: unknown): string => { const input = sendSchema.parse(raw); return input.id + (input.note ?? ""); };',
        'export const sent: Send = { id: "a" };',
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect(MEMBER_BUCKETS.flatMap((bucket) => labelsIn(scan, bucket, RULES).map((label) => `${bucket} ${label}`))).toEqual(["member-read-only sendSchema.note"]);
});

// The fields scan homes a schema key through every object key between its binding and its shape literal; a router's
// procedure keys declare nothing, so without them two procedures' keys of one name would share a home.
test("a schema key under object keys that declare nothing is homed through them, as the fields scan spells it", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      [RULES]: [
        'import { z } from "zod";',
        "export const router = { copy: z.strictObject({ name: z.string() }), update: z.strictObject({ patch: z.strictObject({ name: z.string() }) }) };",
        "export const parsed = (raw: unknown): unknown => [router.copy.parse(raw), router.update.parse(raw)];",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect(labelsIn(scan, "member-validated", RULES)).toEqual(["router.copy.name", "router.update.patch", "router.update.patch.name"]);
});

// Two options of a union name one member under one home; each is its own row, numbered in source order as the fields
// scan numbers its keys, so a judged entry names the option it means. A literal written into the union writes both.
test("union options that name one member under one home are keyed apart in source order", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [RULES]: [
        'export type Outcome = { readonly kind: "a"; readonly at: string } | { readonly kind: "b"; readonly at: string };',
        'export const make = (): Outcome => ({ kind: "a", at: "x" });',
        "export const kindOf = (): string => make().kind;",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect(scan.members.unwired.map(({ key, bucket }) => [key.slice(RULES.length + 1), bucket])).toEqual([
    ["Outcome.at", "member-write-only"],
    ["Outcome.at#2", "member-write-only"],
  ]);
});

// A local literal no slot types writes its own keys, and the slot it is later handed into, as an argument or an array
// element, takes those writes at every depth; an optional member nothing writes still reports read-only.
test("a local literal handed on later writes its keys into the slot it lands in, nested keys and array elements too", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree({
      [RULES]: [
        "export interface Inner { readonly deep?: boolean; readonly other?: boolean }",
        "export interface Opts { readonly inner?: Inner; readonly name: string }",
        'export const register = (opts: Opts): boolean => (opts.inner?.deep ?? false) || (opts.inner?.other ?? false) || opts.name !== "";',
        'export function setup(): boolean { const preset = { inner: { deep: true }, name: "n" } as const; return register(preset) && register({ inner: { other: true }, name: "m" }); }',
        "export interface Row { readonly tag?: string; readonly note?: string; readonly id: string }",
        'const first = { tag: "t", id: "a" } as const;',
        'export const rows: readonly Row[] = [first, { id: "b" }];',
        'export const tags = (): string => rows.map((row) => (row.tag ?? "") + (row.note ?? "") + row.id).join();',
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect(MEMBER_BUCKETS.flatMap((bucket) => labelsIn(scan, bucket, RULES).map((label) => `${bucket} ${label}`))).toEqual(["member-read-only Row.note"]);
});

// A member keyed by a `declare const` unique symbol brands a type: no value has the key at run time, so sending the
// value whole sends no such member; a plain member sent beside it still reports.
test("a member keyed by a declared unique symbol is a brand, judged by nothing", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [RULES]: [
        "declare const brand: unique symbol;",
        'export type Id = string & { readonly [brand]: "id" };',
        "export interface Plain { readonly note: string }",
        "export const make = (raw: string): Id => raw as Id;",
        "export const sendAll = (id: Id, plain: Plain): string => JSON.stringify([id, plain]);",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect(MEMBER_BUCKETS.flatMap((bucket) => labelsIn(scan, bucket, RULES).map((label) => `${bucket} ${label}`))).toEqual(["member-sent-only Plain.note"]);
});
