// Literal hits: every hit of a name classified by where it sits, through the TypeScript 7.1 parser and the graph's role
// rules, split by the side of the tree that holds it, and the literal stage that moves a dead field row to ask only on a
// hit that can be a read.

import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { UsageError } from "@orb/tooling/floor/cli/run-tool";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { z } from "zod";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import { openGraphWorld } from "../../../tooling/src/unwired/graph/build.ts";
import type { HitKind, HitScope } from "../../../tooling/src/unwired/literal-hits.ts";
import { HIT_KINDS, HIT_SCOPES, hitsReport, literalStage, rowsEvidence, runHits, searchLiterals } from "../../../tooling/src/unwired/literal-hits.ts";
import { graphTree, LIB, ZOD_MODULE } from "./_planted.ts";

const TIMEOUT = 120_000;

// One planted name per kind, each spelled once where only that kind can hold it; the table is a Record so a new kind
// fails tsc until it has a case.
const KIND_NAMES: Readonly<Record<HitKind, readonly string[]>> = {
  read: ["zqRead", "zqKeyed", "zqDestructured"],
  write: ["zqWrite", "zqLiteralKey", "zqQuotedKey", "zqField", "zqAttr", "zqBumped"],
  call: ["zqCall", "zqTag"],
  type: ["zqType", "zqImplemented"],
  declaration: ["zqDeclaration", "zqLocal", "zqRenamed"],
  keyword: ["satisfies"],
  "import-export": ["zqImport", "zqExport", "zqModule"],
  string: ["zqString", "zqText"],
  template: ["zqTemplate"],
  jsdoc: ["zqJsdoc", "zqLoose"],
  comment: ["zqComment", "zqTrail", "zqJsx"],
  doc: ["zqDoc"],
  "config-key": ["zqConfigKey"],
  "config-value": ["zqConfigValue"],
  generated: ["zqInfix", "zqHeader"],
  other: ["zqOther"],
};

const CODE = [
  "/** zqJsdoc on a declaration */",
  'import { zqImport } from "./zqModule.ts";',
  "export { zqImport as zqExport };",
  "export interface Shape { readonly zqDeclaration: number }",
  "export class Base {}",
  "export interface Marked { readonly m: number }",
  "export class Held extends Base implements zqImplemented { zqField = 1; }",
  "export function run(shape: Shape, target: { n: number; c: number }, bag: Record<string, number>): number {",
  "  zqCall();",
  "  zqTag`x`;",
  "  target.zqWrite = 1;",
  "  target.zqBumped++;",
  '  const s = "zqString";',
  "  const u = `zqTemplate in a template`;",
  '  const zqLocal = { zqLiteralKey: 1, "zqQuotedKey": 2 };',
  "  const { zqDestructured, a: zqRenamed } = bag;",
  "  const typed: zqType = 1; // zqTrail on a line",
  "  // zqComment on its own line",
  '  return shape.zqRead + bag["zqKeyed"] + typed + zqDestructured + s.length + u.length;',
  "}",
  "export const k = 1 + /** zqLoose inside an expression */ 2;",
  "export const pinned = 1 satisfies number;",
].join("\n");

const VIEW = ["export const View = () => (", '  <div zqAttr="1">', "    {/* zqJsx in a container */}", "    zqText", "  </div>", ");"].join("\n");

// git numbers lines by LF alone, while the program's line table also breaks at U+2028 and U+2029; a hit placed by the
// program's line table lands short after either. Neither an astral character, a variation selector, an accented
// letter, a byte-order mark nor a lone-surrogate escape before the hit may move it off its word.
const char = (point: number): string => String.fromCodePoint(point);
const LONE_SURROGATE_ESCAPE = `${String.fromCodePoint(92)}uD800`;
const AWKWARD_TEXT = [
  `${char(0xfe_ff)}export const bag = { zqShifted: 1 };`,
  `export const awkward = "${char(0x20_28)} ${char(0x20_29)} ${char(0x1_f5_6f)}${char(0xfe_0f)} caf${char(0xe9)} ${LONE_SURROGATE_ESCAPE}";`,
  "export const read = bag.zqShifted;",
].join("\n");

test("a hit after a line or paragraph separator, an astral character and a BOM stays on its word", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const file = "packages/a/src/awkward.ts";
  const root = await plantedTree(graphTree({ [file]: AWKWARD_TEXT }));
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const hits = searchLiterals(root, world, ["zqShifted"])?.hits.get("zqShifted") ?? [];
  expect(hits.map(({ at, kind }) => `${at} ${kind}`)).toEqual([`${file}:1 write`, `${file}:3 read`]);
  const text = world.source(file)?.text ?? "";
  expect(hits.map(({ offset }) => text.slice(offset ?? 0, (offset ?? 0) + "zqShifted".length))).toEqual(["zqShifted", "zqShifted"]);
});

// A known site is the key of the name it was minted from: a computed name's key starts at its `[`, a private name's at
// its `#`, a quoted name's at its quote. Each resolves through the tree to that name, so the member's own reads stay
// evidence and a read of another declaration of the word drops.
const NAMES_TEXT = [
  'const KEY = "zqComputed";',
  "export class Box {",
  "  [KEY] = 1;",
  "  #zqPrivate = 2;",
  '  "zqQuoted" = 3;',
  "  4242 = 4;",
  "  *[Symbol.iterator](): Generator<number> { yield this.#zqPrivate; }",
  "}",
  "export const box = new Box();",
  "export const reads = [box.zqComputed, box.zqQuoted, box[4242], box[Symbol.iterator]];",
].join("\n");

test("a known site with a computed, symbol, private, quoted or numeric name resolves to that name", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const file = "packages/a/src/names.ts";
  const root = await plantedTree(graphTree({ [file]: NAMES_TEXT }));
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const rows = [
    { member: "zqComputed", name: "[KEY]" },
    { member: "iterator", name: "[Symbol.iterator]" },
    { member: "zqPrivate", name: "#zqPrivate =" },
    { member: "zqQuoted", name: '"zqQuoted" =' },
    { member: "4242", name: "4242 =" },
  ].map(({ member, name }) => ({ member, known: [`${file}:${String(NAMES_TEXT.indexOf(name))}`], neverWritten: false }));
  const search = searchLiterals(
    root,
    world,
    rows.map(({ member }) => member),
  );
  if (search === null) {
    throw new Error("the planted tree has a git index");
  }
  expect(
    rowsEvidence(search, world, rows).map(({ elsewhere, productRead, hits }, at) => [
      rows[at]?.member,
      elsewhere,
      productRead,
      hits.map(({ at: site, kind }) => `${site} ${kind}`),
    ]),
  ).toEqual([
    ["zqComputed", 0, true, [`${file}:10 read`, `${file}:1 string`]],
    // Both words read SymbolConstructor.iterator, another declaration of the name.
    ["iterator", 2, false, []],
    ["zqPrivate", 0, true, [`${file}:7 read`]],
    ["zqQuoted", 0, true, [`${file}:10 read`]],
    ["4242", 0, true, [`${file}:10 read`]],
  ]);
});

// A row is held for the product only by a saving hit in product source the parser reads or in data the product loads:
// a column name in a migration or a class in a stylesheet under a package's src is no read of a member. The hits that
// hold a row lead its list, so a long list of tooling hits never hides them.
test("only a hit in parsed product source or loaded data holds a row, and those hits lead its list", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ".planted/rule.ts": 'export const keys = ["zqColumn", "zqHeld"];\n',
      "packages/a/src/schema.sql": "CREATE TABLE t (zqColumn text);\n",
      "packages/a/src/look.css": ".zqColumn { color: red; }\n",
      "packages/a/src/use.ts": 'export const has = (o: object): boolean => "zqHeld" in o;\n',
    }),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const rows = ["zqColumn", "zqHeld"].map((member) => ({ member, known: [], neverWritten: false }));
  const search = searchLiterals(
    root,
    world,
    rows.map(({ member }) => member),
  );
  if (search === null) {
    throw new Error("the planted tree has a git index");
  }
  expect(rowsEvidence(search, world, rows).map(({ productRead, hits }) => [productRead, hits.map(({ at, kind }) => `${at} ${kind}`)])).toEqual([
    [false, [".planted/rule.ts:1 string", "packages/a/src/look.css:1 other", "packages/a/src/schema.sql:1 other"]],
    [true, ["packages/a/src/use.ts:1 string", ".planted/rule.ts:1 string"]],
  ]);
});

// Plugin author source is product source wherever its tsconfig puts it, the file the author program holds and no other: a
// read in it holds a row, and the same read in a tool file the author program leaves out does not.
test("a read in a plugin author file holds a row, wherever the author tsconfig puts it", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const root = await plantedTree({
    ...graphTree({
      "packages/showcase-plugins/plugins/other/main.ts": "export const picked = (o: { readonly zqAuthored: number }): number => o.zqAuthored;\n",
      "packages/showcase-plugins/tools/stray.ts": "export const picked = (o: { readonly zqStray: number }): number => o.zqStray;\n",
    }),
    "packages/showcase-plugins/tsconfig.author-main.json": plantedTsconfig({ lib: LIB, include: ["plugins/*/main.ts"] }),
  });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const rows = ["zqAuthored", "zqStray"].map((member) => ({ member, known: [], neverWritten: false }));
  const search = searchLiterals(
    root,
    world,
    rows.map(({ member }) => member),
  );
  if (search === null) {
    throw new Error("the planted tree has a git index");
  }
  expect(rowsEvidence(search, world, rows).map(({ productRead }) => productRead)).toEqual([true, false]);
});

const KEYS_TEXT = [
  'export const copy = "zqCopy is shown to people";',
  'export const plain = (say: (text: string) => void): void => say("zqPlain");',
  'export const elem = (o: Readonly<Record<string, number>>): number | undefined => o["zqElem"];',
  'export const has = (o: object): boolean => "zqIn" in o;',
  'export const computed = { ["zqComputedKey"]: 1 };',
  "interface Form { readonly zqField: string }",
  "declare function field<T>(name: keyof T & string): void;",
  'field<Form>("zqField");',
  'type Path = "params.zqBan" | "params.other";',
  "declare function setPath(path: Path): void;",
  'setPath("params.zqBan");',
  "export const tpl = (o: object): boolean => `zqTpl` in o;",
  "export const head = (o: object, k: string): boolean => `zqHead.\u0024{k}` in o;",
].join("\n");
// A string holds a row only as a key use: its whole text is the name, as an `in` operand, an element access's argument
// (off a `Record` too) or a computed name. Copy text, a call argument (even one typed `keyof T` or a literal union
// holding the name, or a dotted path holding it as a segment) and a template that only contains the word annotate.
test("a string or template hit holds a row only as a whole key, never as a value", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const file = "packages/a/src/keys.ts";
  const root = await plantedTree(graphTree({ [file]: KEYS_TEXT }));
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const members = ["zqCopy", "zqPlain", "zqElem", "zqIn", "zqComputedKey", "zqBan", "zqTpl", "zqHead"];
  const rows = members.map((member) => ({ member, known: [], neverWritten: false }));
  const search = searchLiterals(root, world, [...members, "zqField"]);
  if (search === null) {
    throw new Error("the planted tree has a git index");
  }
  const field = { member: "zqField", known: [`${file}:${String(KEYS_TEXT.indexOf("zqField"))}`], neverWritten: false };
  expect(
    rowsEvidence(search, world, [...rows, field]).map(({ productRead, hits }, at) => [members[at] ?? field.member, productRead, hits.map(({ kind }) => kind)]),
  ).toEqual([
    ["zqCopy", false, ["string"]],
    ["zqPlain", false, ["string"]],
    ["zqElem", true, ["read"]],
    ["zqIn", true, ["string"]],
    ["zqComputedKey", true, ["string"]],
    ["zqBan", false, ["string", "type"]],
    ["zqTpl", true, ["template"]],
    ["zqHead", false, ["template"]],
    ["zqField", false, ["string"]],
  ]);
});

test("every kind of hit is classified where it sits", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/code.ts": CODE,
      "packages/a/src/view.tsx": VIEW,
      "packages/a/src/table.gen.ts": "export const zqInfix = 1;\n",
      "packages/a/src/marked.ts": "// GENERATED by a script — DO NOT EDIT.\nexport const zqHeader = 1;\n",
      "packages/a/config.json": '{ "zqConfigKey": "zqConfigValue" }\n',
      "docs/note.md": "zqDoc in prose\n",
      "scripts/run.sh": "echo zqOther\n",
    }),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const names = Object.values(KIND_NAMES).flat();
  const search = searchLiterals(root, world, names);
  const kindsOf = (name: string): readonly HitKind[] => [...new Set((search?.hits.get(name) ?? []).map((hit) => hit.kind))];
  const expected = Object.entries(KIND_NAMES).flatMap(([kind, planted]) => planted.map((name) => `${name} ${kind}`));
  expect(names.map((name) => `${name} ${kindsOf(name).join(",")}`)).toEqual(expected);
});

test("hits split by product, test, tooling and docs, with totals per kind and the scanned-file count", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const tree = {
    "packages/a/src/s.ts": "export const read = (o: { n: number }): number => o.zqScoped;\n",
    "packages/a/README.md": "zqScoped in a package readme\n",
    "tests/a/s.test.ts": "export const t = (o: { n: number }): number => o.zqScoped;\n",
    "tests/a/helper.ts": "export const h = (o: { n: number }): number => o.zqScoped;\n",
    "packages/a/src/inline.spec.ts": "// zqScoped in a spec beside its source\n",
    "tooling/s.ts": "export const zqScoped = 1;\n",
    "docs/s.md": "zqScoped\n",
    "packages/a/src/none.ts": "export const unrelated = 1;\n",
  };
  const planted = graphTree(tree);
  const root = await plantedTree(planted);
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const report = hitsReport(root, world, ["zqScoped", "zqAbsent"]);
  expect(report?.scanned).toBe(Object.keys(planted).length);
  const [scoped, absent] = report?.names ?? [];
  const byScope = (scope: HitScope): Readonly<Partial<Record<HitKind, number>>> =>
    Object.fromEntries(Object.entries(scoped?.scopes[scope] ?? {}).filter(([, count]) => count > 0));
  expect({
    total: scoped?.total,
    read: scoped?.kinds.read,
    product: byScope("product"),
    test: byScope("test"),
    tooling: byScope("tooling"),
    docs: byScope("docs"),
  }).toEqual({
    total: 7,
    read: 3,
    product: { read: 1 },
    test: { read: 2, comment: 1 },
    tooling: { declaration: 1 },
    docs: { doc: 2 },
  });
  expect(absent?.total).toBe(0);
  // The graph program holds the package source; the test, the tooling file and the docs sit outside every world.
  const graphHeld = (scoped?.hits ?? []).filter((hit) => hit.graph).map((hit) => hit.file);
  expect(graphHeld).toEqual(["packages/a/src/inline.spec.ts", "packages/a/src/s.ts"]);
});

// The verb through the real CLI: one line per hit and the totals on stdout, the scanned count on stderr, and the same
// report as JSON under --json.
test("the verb prints each hit and its totals, and --json writes the report", { timeout: TIMEOUT }, async ({ plantedTree, runCli }) => {
  const tree = {
    "packages/a/src/s.ts": "export const read = (o: { zqPrinted: number }): number => o.zqPrinted;\n",
    "docs/s.md": "zqPrinted\n",
  };
  const planted = graphTree(tree);
  const root = await plantedTree(planted);
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  const text = await runCli("unwired", ["hits", "zqPrinted", `--root=${root}`]);
  await expect(text).toExitWith(EXIT.clean);
  expect(text.stdout.split("\n").filter((line) => line !== "")).toEqual([
    "doc\tdocs\tdocs/s.md:1\tzqPrinted",
    "declaration\tproduct\tpackages/a/src/s.ts:1\tzqPrinted",
    "read\tproduct\tpackages/a/src/s.ts:1\tzqPrinted",
    "zqPrinted: total=3 read=1 declaration=1 doc=1",
    "  product: read=1 declaration=1",
    "  docs: doc=1",
  ]);
  expect(text.stderr).toContain(`scanned=${String(Object.keys(planted).length)} tracked files`);
  const json = await runCli("unwired", ["hits", "zqPrinted", "--json", `--root=${root}`]);
  await expect(json).toExitWith(EXIT.clean);
  const counts = z.record(z.enum(HIT_KINDS), z.number());
  const report = z
    .object({
      scanned: z.number(),
      names: z.array(
        z.object({
          name: z.string(),
          total: z.number(),
          kinds: counts,
          scopes: z.record(z.enum(HIT_SCOPES), counts),
          hits: z.array(z.object({ at: z.string(), kind: z.enum(HIT_KINDS), scope: z.enum(HIT_SCOPES), graph: z.boolean() })),
        }),
      ),
    })
    .parse(JSON.parse(json.stdout));
  expect(report.scanned).toBe(Object.keys(planted).length);
  expect(
    report.names.map(({ name, total, kinds, scopes, hits }) => ({
      name,
      total,
      read: kinds.read,
      docs: scopes.docs.doc,
      hits: hits.map((hit) => `${hit.kind} ${hit.at} ${String(hit.graph)}`),
    })),
  ).toEqual([
    {
      name: "zqPrinted",
      total: 3,
      read: 1,
      docs: 1,
      hits: ["doc docs/s.md:1 false", "declaration packages/a/src/s.ts:1 true", "read packages/a/src/s.ts:1 true"],
    },
  ]);
});

// A CRLF line ends in a carriage return and a line may hold U+2028, which a pattern's `.` does not cross: each hit keeps
// its own file, never an empty path that reads the root directory. A tracked symlink to a directory whose target names
// the word is no hit at all: git grep over the working tree does not read a symlink.
test("a CRLF line and a U+2028 line keep their file; a tracked symlink to a directory is no hit", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "install.cmd": "rem zqCrlf on a Windows line\r\nrem the next line\r\n",
      "docs/sep.md": "zqSeparated before \u{2028} after\n",
      "packages/a/zqLinkedDir/inside.md": "a file in the linked directory\n",
    }),
  );
  symlinkSync("zqLinkedDir", join(root, "packages/a/alias"));
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const search = searchLiterals(root, world, ["zqCrlf", "zqSeparated", "zqLinkedDir"]);
  const placed = (name: string): readonly string[] => (search?.hits.get(name) ?? []).map((hit) => `${hit.at} ${hit.kind} ${hit.scope}`);
  expect([placed("zqCrlf"), placed("zqSeparated"), placed("zqLinkedDir")]).toEqual([["install.cmd:1 other tooling"], ["docs/sep.md:1 doc docs"], []]);
  expect(execFixtureGit(root, ["ls-files", "-s", "packages/a/alias"])).toMatch(/^120000 /u);
});

test("the verb refuses a name that is not one word before it searches", () => {
  expect(() => runHits(["zq.dotted"], () => undefined)).toThrow(UsageError);
  expect(() => runHits(["--json"], () => undefined)).toThrow(/at least one name/u);
});

const DECLARATION = "packages/a/src/decl.ts";
const DECLARED = ["export interface Row { readonly wired: number }", "export const read = (row: Row): number => row.wired;"].join("\n");
const CONTROL = { key: "Row.wired", member: "wired", known: [`${DECLARATION}:${String(DECLARED.indexOf("wired"))}`] };

test("a mention or a declaration of the same name keeps a dead row dead; a string or a code read saves it", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [DECLARATION]: DECLARED,
      "packages/a/src/doc.ts": ["/** zqTsdoc in tsdoc */", "export const y = 1;"].join("\n"),
      "packages/a/src/trail.ts": "export const z = 1; // zqTrail trailing\n",
      "packages/a/src/view.tsx": ["export const View = () => (", "  <div>", "    {/* zqJsx jsx comment */}", "  </div>", ");"].join("\n"),
      "packages/a/src/own.ts": ["export const w = 1;", "// zqOwnLine on its own line", "export const v = 2;"].join("\n"),
      "packages/a/src/local.ts": ["export const zqLocal = 1;", "export function f(zqParam: number): number { return zqParam; }"].join("\n"),
      "packages/a/src/saved.ts": ['export const s = "zqString";', "export const t = (o: { zqCode: number }): number => o.zqCode; // zqString again"].join("\n"),
    }),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const members = ["zqTsdoc", "zqTrail", "zqJsx", "zqOwnLine", "zqLocal", "zqString", "zqCode"];
  const rows = members.map((member) => ({ member, verdict: "dead" as const, known: [], neverWritten: false }));
  const { rows: staged } = literalStage(root, world, rows, CONTROL);
  expect(staged.map(({ member, verdict, literal }) => `${member} ${verdict} ${Object.keys(literal?.counts ?? {}).join(",")}`)).toEqual([
    "zqTsdoc dead jsdoc",
    "zqTrail dead comment",
    "zqJsx dead comment",
    "zqOwnLine dead comment",
    // A local of the same name declares a new binding: no read of the field, so the row stays dead.
    "zqLocal dead declaration",
    "zqString ask string,comment",
    "zqCode ask declaration,read",
  ]);
});

test("more names than one grep pattern holds are searched in parts, and each hit is counted once", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  // Enough names that their single alternation is past what the pattern compiler takes.
  const members = Array.from({ length: 3000 }, (_, at) => `zqName${String(at).padStart(6, "0")}`);
  const [first = "", second = ""] = members;
  const middle = members[1500] ?? "";
  const last = members.at(-1) ?? "";
  const root = await plantedTree(
    graphTree({
      [DECLARATION]: DECLARED,
      "packages/a/src/first.ts": `export const a = { ${first}: 1 };\n`,
      "packages/a/src/last.ts": `export const b = "${last}";\n`,
      // One line holds a name from the first part and one from the last, so each part's search finds it.
      "packages/a/src/both.ts": `export const c = { ${first}: 1, ${last}: 2 }; // ${second}\n`,
    }),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const rows = members.map((member) => ({ member, verdict: "dead" as const, known: [], neverWritten: true }));
  const { rows: staged, stage } = literalStage(root, world, rows, CONTROL);
  const evidence = new Map(staged.map(({ member, verdict, literal }) => [member, { verdict, counts: literal?.counts, writers: literal?.writers }]));
  expect([first, second, middle, last].map((member) => evidence.get(member))).toEqual([
    { verdict: "ask", counts: { write: 2 }, writers: ["packages/a/src/both.ts:1", "packages/a/src/first.ts:1"] },
    { verdict: "dead", counts: { comment: 1 }, writers: [] },
    { verdict: "dead", counts: {}, writers: [] },
    { verdict: "ask", counts: { string: 1, write: 1 }, writers: ["packages/a/src/both.ts:1"] },
  ]);
  expect(stage?.deadAfter).toBe(members.length - 2);
});

// A name's text builds the pattern, so a name that is not one word would search for something else: `[LIT]` is a
// character class. The search refuses it, and the stage moves such a dead row to ask unsearched, never leaves it dead.
test("a name that is not one word is refused by the search and moves its dead row to ask unsearched", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [DECLARATION]: DECLARED, "packages/a/src/letters.ts": "export const L = 1;\n" }));
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  expect(() => searchLiterals(root, world, ["zqWord", "[L]"])).toThrow(/"\[L\]" not one word/u);
  const rows = ["zq-dash", "zqQuietRow"].map((member) => ({ member, verdict: "dead" as const, known: [], neverWritten: false }));
  const { rows: staged, stage } = literalStage(root, world, rows, CONTROL);
  expect(staged.map(({ member, verdict, literal }) => [member, verdict, literal === null])).toEqual([
    ["zq-dash", "ask", true],
    ["zqQuietRow", "dead", false],
  ]);
  expect([stage?.unsearchable, stage?.deadBefore, stage?.deadAfter]).toEqual([1, 2, 1]);
});

// The program reads each file once; a file edited before the search greps it gives lines the program never held, so
// the search refuses rather than reading another line's text.
test("a held file that changed on disk after the program read it is refused, naming the file", { timeout: TIMEOUT }, async ({ plantedTree }) => {
  const file = "packages/a/src/edited.ts";
  const root = await plantedTree(graphTree({ [file]: "export const read = (o: { n: number }): number => o.zqEdited;\n" }));
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const path = join(root, file);
  writeFileSync(path, `// a line the program never read\n${readFileSync(path, "utf8")}`);
  expect(() => searchLiterals(root, world, ["zqEdited"])).toThrow(`${file}:2`);
});

const INPUT = "packages/a/src/input.ts";
const INPUT_TEXT = [
  'import { z } from "zod";',
  "export interface Input { readonly chatId: string; readonly zqAssetIds?: readonly string[] }",
  "export const take = (input: Input): string => input.chatId;",
  "export const inputSchema = z.strictObject({ chatId: z.string(), zqSchemaIds: z.string().optional() });",
  "export const parse = (input: z.infer<typeof inputSchema>): string => input.chatId;",
].join("\n");
const SEND = "packages/a/src/send.ts";

// An object literal key writes the member its contextual type names, a shorthand's too: the hit is the row's evidence,
// though the checker's own symbol for it is the literal's property. The local a shorthand reads, and a read of it, are
// another declaration of the name.
test("a shorthand key in an object literal argument is a write of the interface or schema member its slot names", { timeout: TIMEOUT }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      [INPUT]: INPUT_TEXT,
      [SEND]: [
        'import { parse, take } from "./input.ts";',
        'export const send = (zqAssetIds: readonly string[]): string => take({ chatId: "c", ...(zqAssetIds.length > 0 ? { zqAssetIds } : {}) });',
        'export const sendSchema = (zqSchemaIds: string): string => parse({ chatId: "c", zqSchemaIds });',
      ].join("\n"),
    }),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  using world = openGraphWorld(root);
  const rows = ["zqAssetIds", "zqSchemaIds"].map((member) => ({ member, known: [`${INPUT}:${String(INPUT_TEXT.indexOf(member))}`], neverWritten: true }));
  const search = searchLiterals(
    root,
    world,
    rows.map(({ member }) => member),
  );
  if (search === null) {
    throw new Error("the planted tree has a git index");
  }
  expect(rowsEvidence(search, world, rows).map(({ own, elsewhere, saved, writers }) => [own, elsewhere, saved, writers])).toEqual([
    [1, 1, true, [`${SEND}:2`]],
    [1, 0, true, [`${SEND}:3`]],
  ]);
});
