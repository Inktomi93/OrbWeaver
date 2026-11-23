// `pnpm unwired shapes` reports a shape restated in a second file, a synonym alias, a re-export of a re-export and a
// renamed re-export. Different members, a derived Pick, a type indexed out of another, a result computed from another
// type's member, same names with different types and props that match only by their library base are controls.
// Each false-positive class the shapes judgement named has a case below with a twin that must still report.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { DeliberateEntry } from "../../../tooling/src/unwired/deliberate.ts";
import type { DistinctRegistry } from "../../../tooling/src/unwired/distinct-lookalikes.ts";
import type { JudgedEntry, ShapesReport } from "../../../tooling/src/unwired/index.ts";
import { shapesGraph } from "../../../tooling/src/unwired/index.ts";
import { graphTree, JUDGED_WORK, judgedExpected, judgedOutcome, LIB, plantJudged, WORLD } from "./_planted.ts";

interface ShapesLists {
  readonly deliberate?: readonly DeliberateEntry[];
  readonly distinct?: DistinctRegistry;
  readonly judged?: readonly JudgedEntry[];
}

// The shapes scan over a planted graph tree: one solution, one world over every planted package's source.
async function shapes(root: string, { deliberate = [], distinct = [], judged }: ShapesLists = {}): Promise<ShapesReport> {
  return await shapesGraph({ root, deliberate, distinct, judged }, () => undefined);
}

const TREE = {
  "packages/a/src/user.ts": ["export interface User {", "  id: string;", "  name: string;", "}", "export type Alias = User;"].join("\n"),
  "packages/a/src/person.ts": [
    "export interface Person {",
    "  id: string;",
    "  name: string;",
    "}",
    "export interface Account {",
    "  id: string;",
    "  name: string;",
    "  email: string;",
    "}",
    'export type Picked = Pick<Account, "id" | "name">;',
    "export interface Box {",
    "  item: { id: string; name: string };",
    "}",
    'export type Item = Box["item"];',
    "export interface Labeled {",
    "  id: string;",
    "  name: number;",
    "}",
  ].join("\n"),
  // Two library components with the same props, each wrapped with one prop of its own: a match by the library's shape.
  // The bases sit in a package under node_modules, as a library's do: the merged program holds our own declaration files.
  "node_modules/@fx/ui/package.json": JSON.stringify({ name: "@fx/ui", types: "index.d.ts" }),
  "node_modules/@fx/ui/index.d.ts": [
    "export interface DialogTitleBase { id: string; label: string }",
    "export interface PopoverTitleBase { id: string; label: string }",
  ].join("\n"),
  "packages/a/src/dialog.ts":
    'import type { DialogTitleBase } from "@fx/ui";\nexport interface DialogTitleProps extends DialogTitleBase {\n  className?: string;\n}',
  "packages/a/src/popover.ts":
    'import type { PopoverTitleBase } from "@fx/ui";\nexport interface PopoverTitleProps extends PopoverTitleBase {\n  className?: string;\n}',
  // A result type computed through another named type's member is derived from that type, not a second home.
  "packages/a/src/service.ts": "export interface Service {\n  bounds(): Promise<{ id: string; name: string }>;\n}",
  "packages/a/src/bounds.ts": 'import type { Service } from "./service.ts";\nexport type Bounds = Awaited<ReturnType<Service["bounds"]>>;',
  "packages/a/src/index.ts": 'export { User } from "./user.ts";',
  "packages/a/src/door.ts": 'export { User } from "./index.ts";\nexport { User as Member } from "./user.ts";',
};

test("the shapes scan reports restated shapes, synonyms, re-export chains and renamed re-exports", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await shapes(await plantedTree(graphTree(TREE)));
  const found = report.unwired.map(({ kind, file, home, member, at }) => ({ kind, file, home, member, at }));
  expect(found.toSorted((a, b) => `${a.kind}${a.file}`.localeCompare(`${b.kind}${b.file}`))).toEqual([
    { kind: "reexport-chain", file: "packages/a/src/door.ts", home: "User", member: "User", at: ["packages/a/src/door.ts", "packages/a/src/index.ts"] },
    { kind: "renamed-reexport", file: "packages/a/src/door.ts", home: "Member", member: "User", at: ["packages/a/src/door.ts"] },
    { kind: "restated", file: "packages/a/src/person.ts", home: "Person", member: "User", at: ["packages/a/src/user.ts:1"] },
    { kind: "synonym", file: "packages/a/src/user.ts", home: "Alias", member: "User", at: ["packages/a/src/user.ts"] },
  ]);
});

interface Scanned {
  readonly unwired: readonly string[];
  readonly deliberate: readonly string[];
  readonly distinct: readonly string[];
}

const PAIR = ({ kind, home, member }: { readonly kind: string; readonly home: string; readonly member: string }): string => `${kind} ${home}~${member}`;

// The planted files' rows, read as `kind home~member` per bucket.
async function scanned(root: string, lists: ShapesLists = {}): Promise<Scanned> {
  const report = await shapes(root, lists);
  return {
    unwired: report.unwired.map(PAIR).toSorted(),
    deliberate: report.deliberate.map(PAIR).toSorted(),
    distinct: report.distinct.map(PAIR).toSorted(),
  };
}

const PAIR_BODY = "{\n  id: string;\n  label: string;\n}";

test("a type computed from a function's declared return is not a second home of that return type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/segments.ts": [
        "export interface Collected {",
        "  rows: string;",
        "  seq: number;",
        "}",
        "export declare function collect(): Promise<Collected>;",
        "export declare function inline(): { rows: string; seq: number };",
      ].join("\n"),
      "packages/a/src/backfill.ts": [
        'import type { collect, inline } from "./segments.ts";',
        "export type Work = Awaited<ReturnType<typeof collect>>;",
        // The twin: a function whose return type spells the members itself is a second home.
        "export type InlineWork = ReturnType<typeof inline>;",
      ].join("\n"),
    }),
  );
  expect((await scanned(root)).unwired).toEqual(["restated InlineWork~Collected"]);
});

test("a type whose member is indexed out of another is linked to it, not a second home", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/origin.ts": "export interface Origin {\n  id: string;\n  name: string;\n}",
      "packages/a/src/copy.ts": 'import type { Origin } from "./origin.ts";\nexport interface Copy {\n  id: Origin["id"];\n  name: string;\n}',
      // The twin: the same members spelled out restate the shape.
      "packages/a/src/twin.ts": "export interface Twin {\n  id: string;\n  name: string;\n}",
    }),
  );
  expect((await scanned(root)).unwired).toEqual(["restated Copy~Twin", "restated Origin~Twin"].toSorted());
});

// Two files that re-export a name from each other: the walk ends on the symbol it has seen.
test("a cyclic re-export ends as a chain", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/cyc-a.ts": 'export { Loop } from "./cyc-b.ts";',
      "packages/a/src/cyc-b.ts": 'export { Loop } from "./cyc-a.ts";',
    }),
  );
  expect((await scanned(root)).unwired).toEqual(["reexport-chain Loop~Loop", "reexport-chain Loop~Loop"]);
});

test("two types that only pick one base's members are not two homes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/base.ts": "export interface Entity {\n  kind: string;\n  label: string;\n  owner: string;\n}",
      "packages/a/src/imagery.ts": [
        'import type { Entity } from "./base.ts";',
        'export interface ImageryService extends Readonly<Pick<Entity, "kind" | "label">> {}',
        'export interface ImageryRow extends Readonly<Pick<Entity, "kind" | "label">> {\n  extra: string;\n}',
      ].join("\n"),
      "packages/a/src/ledger.ts": [
        'import type { Entity } from "./base.ts";',
        'export interface LedgerService extends Readonly<Pick<Entity, "kind" | "label">> {}',
        // The twin: each adds one member of its own over the shared base, so the pair restates a shape.
        'export interface LedgerRow extends Readonly<Pick<Entity, "kind" | "label">> {\n  extra: string;\n}',
      ].join("\n"),
    }),
  );
  expect((await scanned(root)).unwired).toEqual(["restated ImageryRow~LedgerRow"]);
});

test("perVerb follows a verb's Params or Result name in its Core-0 §4 home, and restated verb params are deliberate", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree({
      "packages/server/src/domain/actor/contract/params.ts": [
        "export interface ActorKey {\n  principal: string;\n  chatId: string;\n}",
        "export type StoredActor = ActorKey;",
        "export type ReadActorParams = ActorKey;",
      ].join("\n"),
      "packages/server/src/domain/rpg/contract/params.ts": "export interface ReadGameParams {\n  userId: string;\n  gameId: string;\n}",
      "packages/server/src/domain/rule/contract/params.ts": "export interface ListRulesParams {\n  userId: string;\n  gameId: string;\n}",
      // The twin: a Params type restated by a context type is not a verb pair.
      "packages/server/src/domain/rule/contract/context.ts": "export interface HandlerContext {\n  userId: string;\n  gameId: string;\n}",
      // Twins outside the homes Core-0 §4 names: a verb file's Params beside a contract one, and two client Results.
      "packages/server/src/domain/rule/contract/results.ts": "export interface ExportRuleResult {\n  ruleId: string;\n  bytes: number;\n}",
      "packages/server/src/domain/rule/verbs/export.ts": "export interface ExportRuleParams {\n  ruleId: string;\n  bytes: number;\n}",
      "packages/client/src/features/search/search.ts": "export interface SearchResult {\n  id: string;\n  label: string;\n}",
      "packages/client/src/features/list/list.ts": "export interface ListResult {\n  id: string;\n  label: string;\n}",
    }),
  );
  const report = await shapes(root);
  const flags = [...report.unwired, ...report.deliberate].filter(({ kind }) => kind === "synonym").map(({ home, perVerb }) => `${home} ${String(perVerb)}`);
  expect(flags.toSorted()).toEqual(["ReadActorParams true", "StoredActor false"]);
  expect(report.deliberate.map(PAIR).toSorted()).toEqual(["restated ReadGameParams~ListRulesParams", "synonym ReadActorParams~ActorKey"]);
  expect(report.unwired.map(PAIR).toSorted()).toEqual([
    "restated ExportRuleResult~ExportRuleParams",
    "restated HandlerContext~ListRulesParams",
    "restated ListResult~SearchResult",
    "restated ReadGameParams~HandlerContext",
    "synonym StoredActor~ActorKey",
  ]);
});

test("a pair whose second side sits under a deliberate directory is deliberate", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/panel.ts": `export interface LogPanelProps ${PAIR_BODY}\nexport interface LocalRow { x: string; y: string }`,
      "packages/a/src/plugin/view.ts": `export interface PluginView ${PAIR_BODY}`,
      // The twin: neither side is under the directory.
      "packages/a/src/row.ts": "export interface OtherRow { x: string; y: string }",
    }),
  );
  const found = await scanned(root, { deliberate: [{ directory: "packages/a/src/plugin/", reason: "the planted published surface" }] });
  expect(found.deliberate).toEqual(["restated LogPanelProps~PluginView"]);
  expect(found.unwired).toEqual(["restated LocalRow~OtherRow"]);
});

test("a pair the distinct registry lists is reported as distinct, not unwired", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/books.ts": `export interface BooksSectionProps ${PAIR_BODY}\nexport interface BookRow { x: string; y: string }`,
      "packages/a/src/regex.ts": `export interface RegexSectionProps ${PAIR_BODY}\nexport interface RegexRow { x: string; y: string }`,
    }),
  );
  // Listed from the second side, as the registry may record a pair from either side; the twin pair is not listed.
  const distinct: DistinctRegistry = [
    { shape: "packages/a/src/regex.ts#RegexSectionProps", distinctFrom: ["packages/a/src/books.ts#BooksSectionProps"], reason: "planted: two sections' props" },
  ];
  const found = await scanned(root, { distinct });
  expect(found.distinct).toEqual(["restated BooksSectionProps~RegexSectionProps"]);
  expect(found.unwired).toEqual(["restated BookRow~RegexRow"]);
});

test("a file-local alias of a library type is not a synonym row", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/schema.ts": "type Pattern = RegExp;\nexport const probe = (value: Pattern): string => value.source;",
      // The twins: an exported alias of a library type and a file-local alias of a tree type are both second names.
      "packages/a/src/logging.ts": "export type Matcher = RegExp;",
      "packages/a/src/codes.ts": [
        "export interface Code {\n  id: string;\n  label: string;\n}",
        "type LocalCode = Code;",
        "export const codeOf = (value: LocalCode): string => value.id;",
      ].join("\n"),
    }),
  );
  expect((await scanned(root)).unwired).toEqual(["synonym LocalCode~Code", "synonym Matcher~RegExp"]);
});

// Rows the shapes judgement held as true findings, and the classes it named that no checker fact can separate: these
// must keep reporting. A re-export over another package's door is a finding by ruling, and two bare look-alikes can
// only be told apart by their meaning.
test("true findings and bare look-alikes keep reporting", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    ...graphTree({}),
    [WORLD]: plantedTsconfig({ lib: LIB, include: ["../*/src"], paths: { "@fx/a": ["../a/src/index.ts"] } }),
    "packages/a/src/kind.ts": 'export const GALLERY_KIND = "gallery";',
    "packages/a/src/index.ts": 'export { GALLERY_KIND } from "./kind.ts";',
    "packages/b/src/serde.ts": 'export { GALLERY_KIND } from "@fx/a";',
    // A private copy of an exported contract type left behind in a verb file.
    "packages/b/src/contract/gather.ts": "export interface SendRegexSink {\n  emit(text: string): void;\n  flush(): void;\n}",
    "packages/b/src/verbs/turn.ts":
      "interface SendRegexSink {\n  emit(text: string): void;\n  flush(): void;\n}\nexport const sink = (value: SendRegexSink): void => value.flush();",
    // A character span and a span whose doc says bytes: one concept or two is a reading of meaning.
    "packages/b/src/split.ts": "/** A half-open character span. */\nexport interface Span {\n  start: number;\n  end: number;\n}",
    "packages/b/src/hidden.ts": "/** A byte range of hidden text. */\nexport interface HiddenRun {\n  start: number;\n  end: number;\n}",
  });
  const found = await scanned(root);
  expect(found.unwired).toEqual(["reexport-chain GALLERY_KIND~GALLERY_KIND", "restated HiddenRun~Span", "restated SendRegexSink~SendRegexSink"]);
});

// A type read off a value (`typeof DEFAULTS`) is that value's own shape, so it holds a home and pairs with a restatement.
test("a type read off a value is a home of its own", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "packages/a/src/defaults.ts": 'export const DEFAULTS = { mode: "a", size: 1 };\nexport type Defaults = typeof DEFAULTS;',
      "packages/a/src/settings.ts": "export interface Settings {\n  mode: string;\n  size: number;\n}",
    }),
  );
  expect((await scanned(root)).unwired).toEqual(["restated Defaults~Settings"]);
});

// Every product package sits in the one merged program, so a client type and a server type of one shape pair. A test's
// type of the same shape is in that program too, and declares no home.
test("a client type and a server type of one shape are a pair, and a test's twin is none", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    ...graphTree({
      "packages/client/src/turn.ts": `export interface TurnView ${PAIR_BODY}`,
      "packages/server/src/turn.ts": `export interface TurnRow ${PAIR_BODY}`,
    }),
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tests/tsconfig.json" }] }),
    "tests/tsconfig.json": plantedTsconfig({ lib: LIB, include: ["fixtures"] }),
    "tests/fixtures/turn.ts": `export interface TurnFixture ${PAIR_BODY}`,
  });
  expect((await scanned(root)).unwired).toEqual(["restated TurnView~TurnRow"]);
});

// A row whose fix an open item owns reports apart, with its item; an entry whose item is done or whose row no longer
// reports is stale, and the done item's row reports as unwired again.
test("a judged row reports apart with its open item, and an entry for a done item or a gone row is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ ...TREE, ...JUDGED_WORK }));
  const judged = plantJudged(await shapes(root), "Person.User", "Alias.User");
  expect(judgedOutcome(await shapes(root, { judged }), "Person.User", "Alias.User")).toEqual(judgedExpected("Person.User", "Alias.User"));
});
