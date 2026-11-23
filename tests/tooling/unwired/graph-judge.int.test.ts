// The graph's member rows judged the way the fields scan judges its rows: split by the deliberate and judged lists, a
// read-only member reported only when every read sees a default, a validate-only schema key apart, each row sorted with
// its sends named, and a dead row's name searched over the tree with the row's own sites left out.
import { expect, test } from "@orb/testkit/tooling";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { MEMBER_BUCKETS, scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, JUDGED_WORK, judgedExpected, judgedOutcome, labelsIn, plantJudged, ZOD_MODULE } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/row.ts`;
const quiet = (): undefined => undefined;
// The literal stage searches the git index, so a case that judges dead rows commits its tree.
const commitTree = (root: string): void => {
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["-c", "user.name=planted", "-c", "user.email=planted@example.invalid", "commit", "-qm", "planted"]);
};
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

// A literal that spreads a value and overrides a key copies that value: the key is written, but the copy builds no
// home, so a home whose value only arrives from outside leaves its optional members unset by nobody. A literal that
// builds the home from scratch is the control: its unwritten optional member reports.
test("a key that overrides a spread copy writes its member but builds no home", { timeout: 120_000 }, async ({ plantedTree }) => {
  const copied = (built: readonly string[]): Promise<string> =>
    plantedTree(
      graphTree({
        [RULES]: [
          "export interface Cfg { readonly mode?: string; readonly port?: string }",
          "declare const raw: unknown;",
          "const cfg = raw as Cfg;",
          'export const copy: Cfg = { ...cfg, ["mode"]: "x" };',
          ...built,
          'export const shown = (cfg.port ?? "") + (copy.mode ?? "");',
        ].join("\n"),
      }),
    );
  const readOnly = async (root: string): Promise<readonly string[]> => labelsIn(await scanGraph(root, quiet), "member-read-only", RULES);
  expect(await readOnly(await copied([]))).toEqual([]);
  expect(await readOnly(await copied(['export const built: Cfg = { mode: "y" };']))).toEqual(["Cfg.port"]);
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
// sort asks a person. The destination names the line the sent value sits on, past the comment and line break before it.
test("a member sent whole into a file names the file destination, to its nested members, and sorts as ask", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [RULES]: [
        "declare function writeFileSync(path: string, data: string): void;",
        "export interface Export { readonly rows: string; readonly inner: { readonly deep: string } }",
        'export const save = (value: Export): void => writeFileSync("out.json", JSON.stringify(',
        "  // the export, whole",
        "  value,",
        "));",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  const sent = scan.members.unwired.map(({ key, sent: to, verdict }) => [key.slice(RULES.length + 1), to, verdict]);
  expect(sent).toEqual([
    ["Export.rows", [`file ${RULES}:5`], "ask"],
    ["Export.inner", [`file ${RULES}:5`], "ask"],
    ["Export.inner.deep", [`file ${RULES}:5`], "ask"],
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
  commitTree(root);
  const scan = await scanGraph(root, quiet);
  const rows = scan.members.unwired.map(({ member, verdict, literal }) => [member, verdict, literal?.own ?? null, literal?.saved ?? null]);
  expect(rows).toEqual([
    ["zqNoteText", "dead", 2, false],
    ["zqMarked", "ask", 2, true],
  ]);
  expect(scan.members.literalStage?.control.key).toBe(`${RULES}:Note.seen`);
});

// A quoted key's own declaration and write sites are keyed where the search keys a hit, at the quote, so they stay no
// evidence and the row stays dead. No string reaches a private name, so a `#` member is never searched and keeps its sort.
test("a quoted key's own sites are no hit, and a private member is never searched", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [RULES]: [
        'export interface Note { readonly "zqQuoted": string; readonly seen: string }',
        'export const note: Note = { "zqQuoted": "q", seen: "s" };',
        "export const seen = (): string => note.seen;",
        "export class Box { #zqHidden = 1; readonly shown = 2; }",
        "export const shown = (): number => new Box().shown;",
      ].join("\n"),
    }),
  );
  commitTree(root);
  const scan = await scanGraph(root, quiet);
  const rows = scan.members.unwired.map(({ member, verdict, literal }) => [member, verdict, literal?.own ?? null, literal?.saved ?? null]);
  expect(rows).toEqual([
    ["zqQuoted", "dead", 2, false],
    ["#zqHidden", "dead", null, null],
  ]);
});

// A computed member is read by its key's value, never by its bracket text: `[LIT]` with `LIT = "zqLit"` is searched as
// `zqLit`, and the string that spells the key is a hit that can be a read.
test("a computed member is searched by the value of its key", { timeout: 120_000 }, async ({ plantedTree }) => {
  const keys = `${GRAPH_SOURCE}/keys.ts`;
  const root = await plantedTree(
    graphTree({
      [keys]: 'export const LIT = "zqLit";\n',
      [RULES]: [
        'import { LIT } from "./keys.ts";',
        "export interface Shape { readonly [LIT]?: string; readonly kept: string }",
        "export const kept = (shape: Shape): string => shape.kept;",
      ].join("\n"),
    }),
  );
  commitTree(root);
  const scan = await scanGraph(root, quiet);
  const rows = scan.members.unwired.map(({ member, verdict, literal }) => [member, verdict, literal?.hits.map(({ at, kind }) => `${at} ${kind}`) ?? null]);
  expect(rows).toEqual([["[LIT]", "ask", [`${keys}:1 string`]]]);
  expect(scan.members.literalStage?.unsearchable).toBe(0);
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

// A tRPC mutation whose output schema has one key answers with that key alone: its unread member acknowledges the call
// and reports apart from the dead, through the key's `satisfies` twin too. A two-key output's unread members stay rows.
test("a never-read one-member mutation output reports as an acknowledgement, apart from the judged rows", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      [RULES]: [
        'import { z } from "zod";',
        "interface Chain { output<S>(schema: S): Chain; mutation<T>(resolve: () => T): T }",
        "declare const procedure: Chain;",
        "export interface Done { readonly ok: boolean }",
        "export interface Pair { readonly left: string; readonly right: string }",
        "const doneSchema = z.object({ ok: z.boolean() }) satisfies z.ZodType<Done>;",
        "const pairSchema = z.object({ left: z.string(), right: z.string() }) satisfies z.ZodType<Pair>;",
        "const done = (): Done => ({ ok: true });",
        'const pair = (): Pair => ({ left: "l", right: "r" });',
        "export const finish = procedure.output(doneSchema).mutation(done);",
        "export const split = procedure.output(pairSchema).mutation(pair);",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect({
    acknowledged: scan.members.acknowledged.map(({ home, member }) => `${home}.${member}`),
    unwired: scan.members.unwired.map(({ home, member }) => `${home}.${member}`),
  }).toEqual({ acknowledged: ["Done.ok"], unwired: ["Pair.left", "Pair.right"] });
});

// Inside the provider backends a value no destination takes is a provider send only where it reaches a request: through
// a helper's return, a parameter's callers and a cast keyed into a binding here. A value a Response reader returns never does, even inside a literal
// that reaches one, and a nested value keeps the destination of the call its literal goes to. A provider field a README names is received, never judged.
test("a backend value that reaches a provider request is sent to the provider, and received where a doc names it", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const backend = "packages/inference/src/backends/chat.ts";
  const root = await plantedTree(
    graphTree({
      "node_modules/fetchlib/package.json": JSON.stringify({ name: "fetchlib", types: "index.d.ts" }),
      "node_modules/fetchlib/index.d.ts": "export interface Response { readonly ok: boolean }",
      "node_modules/@ai-sdk/provider/package.json": JSON.stringify({ name: "@ai-sdk/provider", types: "index.d.ts" }),
      "node_modules/@ai-sdk/provider/index.d.ts": [
        "export type JSONObject = { [key: string]: unknown };",
        "export interface Model { doStream(options: { readonly providerOptions?: Record<string, JSONObject> }): Promise<void> }",
      ].join("\n"),
      "README.md": "The router reads `Knobs.topK` from the request.",
      [backend]: [
        'import type { JSONObject, Model } from "@ai-sdk/provider";',
        'import type { Response } from "fetchlib";',
        "type Json = Record<string, unknown>;",
        "interface Knobs { readonly topK: number; readonly minP: number }",
        "interface Routing { readonly order: string }",
        "interface Answer { readonly code: string }",
        "declare const knobs: Knobs;",
        "declare const routing: Routing;",
        "declare const answer: Answer;",
        "const knobsOf = (): JSONObject => knobs;",
        "const decode = (res: Response): Answer => (res.ok ? answer : answer);",
        "interface Extras { readonly keyed: number }",
        "declare const extras: Extras;",
        "const extrasFor = (key: string): JSONObject => {",
        "  const out: JSONObject = {};",
        "  out[key] = extras as JSONObject[string];",
        "  return out;",
        "};",
        "interface Call { readonly options: { readonly providerOptions?: Record<string, JSONObject> }; readonly translate: (res: Response) => Json }",
        "const stream = (model: Model, args: Call): Promise<void> => model.doStream({ ...args.options });",
        "export const run = async (model: Model): Promise<void> => {",
        '  await model.doStream({ providerOptions: { router: { routing }, keyed: extrasFor("k") } });',
        "  const providerOptions = { router: knobsOf() };",
        "  await stream(model, { options: { providerOptions }, translate: decode });",
        "};",
      ].join("\n"),
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect({
    received: scan.members.received.map(({ key, receiver, cite }) => [key.slice(backend.length + 1), receiver, cite]),
    unwired: scan.members.unwired.map(({ key, bucket, sent }) => [key.slice(backend.length + 1), bucket, sent]),
  }).toEqual({
    received: [["Knobs.topK", "provider", "README.md:1"]],
    unwired: [
      ["Call.translate", "member-write-only", []],
      ["Knobs.minP", "member-sent-only", [`provider ${backend}:10`]],
      ["Routing.order", "member-sent-only", [`provider ${backend}:22 @ai-sdk/provider`]],
      ["Answer.code", "member-sent-only", [`unclassified ${backend}:24`]],
      ["Extras.keyed", "member-sent-only", [`provider ${backend}:16`]],
    ],
  });
});

// The SDK's declarations are read by guests outside the tree: a member they publish is received, with the SDK line that
// declares it, and never judged; a member they leave out stays a row.
test("a plugin contract member the SDK publishes is received with its cite, never judged", { timeout: 120_000 }, async ({ plantedTree }) => {
  const contract = "packages/contracts/src/plugin/thing.ts";
  const root = await plantedTree(
    graphTree({
      [contract]: [
        "export interface PluginThing { readonly shown: string; readonly hidden: string }",
        'export const thing = (): PluginThing => ({ shown: "s", hidden: "h" });',
      ].join("\n"),
      "packages/plugin-sdk/package.json": JSON.stringify({ name: "@orb/plugin-sdk", files: ["extra.d.ts"] }),
      "packages/plugin-sdk/extra.d.ts": "export interface PluginThing { readonly shown: string }",
    }),
  );
  const scan = await scanGraph(root, quiet);
  expect({
    received: scan.members.received.map(({ key, receiver, cite }) => [key, receiver, cite]),
    unwired: scan.members.unwired.map(({ key }) => key),
  }).toEqual({ received: [[`${contract}:PluginThing.shown`, "plugin-sdk", "packages/plugin-sdk/extra.d.ts:1"]], unwired: [`${contract}:PluginThing.hidden`] });
});
