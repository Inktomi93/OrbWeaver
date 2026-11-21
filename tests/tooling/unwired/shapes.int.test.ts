// `pnpm unwired shapes` reports a shape restated in a second file, a synonym alias, a re-export of a re-export and a
// renamed re-export. Different members, a derived Pick, a type indexed out of another, a result computed from another
// type's member, same names with different types and props that match only by their library base are controls.
// Each false-positive class the shapes judgement named has a case below with a twin that must still report.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { DeliberateEntry } from "../../../tooling/src/unwired/deliberate.ts";
import type { DistinctRegistry } from "../../../tooling/src/unwired/distinct-lookalikes.ts";
import { scanShapes } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD } from "./_planted.ts";

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
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
  "packages/a/src/library.d.ts": ["interface DialogTitleBase { id: string; label: string }", "interface PopoverTitleBase { id: string; label: string }"].join(
    "\n",
  ),
  "packages/a/src/dialog.ts": "export interface DialogTitleProps extends DialogTitleBase {\n  className?: string;\n}",
  "packages/a/src/popover.ts": "export interface PopoverTitleProps extends PopoverTitleBase {\n  className?: string;\n}",
  // A result type computed through another named type's member is derived from that type, not a second home.
  "packages/a/src/service.ts": "export interface Service {\n  bounds(): Promise<{ id: string; name: string }>;\n}",
  "packages/a/src/bounds.ts": 'import type { Service } from "./service.ts";\nexport type Bounds = Awaited<ReturnType<Service["bounds"]>>;',
  "packages/a/src/index.ts": 'export { User } from "./user.ts";',
  "packages/a/src/door.ts": 'export { User } from "./index.ts";\nexport { User as Member } from "./user.ts";',
};

test("the shapes scan reports restated shapes, synonyms, re-export chains and renamed re-exports", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const report = scanShapes({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  const found = report.unwired.map(({ kind, file, home, member, at }) => ({ kind, file, home, member, at }));
  expect(found.toSorted((a, b) => `${a.kind}${a.file}`.localeCompare(`${b.kind}${b.file}`))).toEqual([
    { kind: "reexport-chain", file: "packages/a/src/door.ts", home: "User", member: "User", at: ["packages/a/src/door.ts", "packages/a/src/index.ts"] },
    { kind: "renamed-reexport", file: "packages/a/src/door.ts", home: "Member", member: "User", at: ["packages/a/src/door.ts"] },
    { kind: "restated", file: "packages/a/src/person.ts", home: "Person", member: "User", at: ["packages/a/src/user.ts:1"] },
    { kind: "synonym", file: "packages/a/src/user.ts", home: "Alias", member: "User", at: ["packages/a/src/user.ts"] },
  ]);
  expect(report.disagreements).toEqual([]);
});

interface Scanned {
  readonly unwired: readonly string[];
  readonly deliberate: readonly string[];
  readonly distinct: readonly string[];
}

const PAIR = ({ kind, home, member }: { readonly kind: string; readonly home: string; readonly member: string }): string => `${kind} ${home}~${member}`;

// One package world over the planted files, read as `kind home~member` rows per bucket.
function scanned(
  root: string,
  {
    worlds = [WORLD],
    deliberate = [],
    distinct = [],
  }: { worlds?: readonly string[]; deliberate?: readonly DeliberateEntry[]; distinct?: DistinctRegistry } = {},
): Scanned {
  const report = scanShapes({ root, worlds, testWorlds: [], deliberate, log: () => undefined }, distinct);
  expect(report.disagreements).toEqual([]);
  return {
    unwired: report.unwired.map(PAIR).toSorted(),
    deliberate: report.deliberate.map(PAIR).toSorted(),
    distinct: report.distinct.map(PAIR).toSorted(),
  };
}

const PAIR_BODY = "{\n  id: string;\n  label: string;\n}";

test("a pair two worlds hold in opposite order is one row", { timeout: 120_000 }, async ({ plantedTree }) => {
  // Each world roots the other file, so each program lists the two files in the opposite order.
  const root = await plantedTree({
    "packages/one/tsconfig.json": plantedTsconfig({ lib: LIB, include: ["../shared/src/a.ts"] }),
    "packages/two/tsconfig.json": plantedTsconfig({ lib: LIB, include: ["../shared/src/b.ts"] }),
    "packages/shared/src/a.ts": `import "./b.ts";\nexport interface Alpha ${PAIR_BODY}\nexport interface Gamma { x: string; y: string }`,
    "packages/shared/src/b.ts": `import "./a.ts";\nexport interface Beta ${PAIR_BODY}\nexport interface Delta { x: string; y: string }`,
  });
  const found = scanned(root, { worlds: ["packages/one/tsconfig.json", "packages/two/tsconfig.json"] });
  expect(found.unwired).toEqual(["restated Alpha~Beta", "restated Gamma~Delta"]);
});

test("a type computed from a function's declared return is not a second home of that return type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
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
  });
  expect(scanned(root).unwired).toEqual(["restated InlineWork~Collected"]);
});

test("two types that only pick one base's members are not two homes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
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
  });
  expect(scanned(root).unwired).toEqual(["restated ImageryRow~LedgerRow"]);
});

test("perVerb follows a verb's Params or Result name, and restated verb params are deliberate", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    "packages/server/tsconfig.json": plantedTsconfig({ lib: LIB }),
    "packages/server/src/domain/actor/contract/params.ts": [
      "export interface ActorKey {\n  principal: string;\n  chatId: string;\n}",
      "export type StoredActor = ActorKey;",
      "export type ReadActorParams = ActorKey;",
    ].join("\n"),
    "packages/server/src/domain/rpg/contract/params.ts": "export interface ReadGameParams {\n  userId: string;\n  gameId: string;\n}",
    "packages/server/src/domain/rule/contract/params.ts": "export interface ListRulesParams {\n  userId: string;\n  gameId: string;\n}",
    // The twin: a Params type restated by a context type is not a verb pair.
    "packages/server/src/domain/rule/contract/context.ts": "export interface HandlerContext {\n  userId: string;\n  gameId: string;\n}",
  });
  const report = scanShapes({ root, worlds: ["packages/server/tsconfig.json"], testWorlds: [], deliberate: [], log: () => undefined }, []);
  const flags = [...report.unwired, ...report.deliberate].filter(({ kind }) => kind === "synonym").map(({ home, perVerb }) => `${home} ${String(perVerb)}`);
  expect(flags.toSorted()).toEqual(["ReadActorParams true", "StoredActor false"]);
  expect(report.deliberate.map(PAIR).toSorted()).toEqual(["restated ReadGameParams~ListRulesParams", "synonym ReadActorParams~ActorKey"]);
  expect(report.unwired.map(PAIR).toSorted()).toEqual([
    "restated HandlerContext~ListRulesParams",
    "restated ReadGameParams~HandlerContext",
    "synonym StoredActor~ActorKey",
  ]);
});

test("a pair whose second side sits under a deliberate directory is deliberate", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/a/src/panel.ts": `export interface LogPanelProps ${PAIR_BODY}\nexport interface LocalRow { x: string; y: string }`,
    "packages/a/src/plugin/view.ts": `export interface PluginView ${PAIR_BODY}`,
    // The twin: neither side is under the directory.
    "packages/a/src/row.ts": "export interface OtherRow { x: string; y: string }",
  });
  const found = scanned(root, { deliberate: [{ directory: "packages/a/src/plugin/", reason: "the planted published surface" }] });
  expect(found.deliberate).toEqual(["restated LogPanelProps~PluginView"]);
  expect(found.unwired).toEqual(["restated LocalRow~OtherRow"]);
});

test("a pair the distinct registry lists is reported as distinct, not unwired", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/a/src/books.ts": `export interface BooksSectionProps ${PAIR_BODY}\nexport interface BookRow { x: string; y: string }`,
    "packages/a/src/regex.ts": `export interface RegexSectionProps ${PAIR_BODY}\nexport interface RegexRow { x: string; y: string }`,
  });
  // Listed from the second side, as the registry may record a pair from either side; the twin pair is not listed.
  const distinct: DistinctRegistry = [
    { shape: "packages/a/src/regex.ts#RegexSectionProps", distinctFrom: ["packages/a/src/books.ts#BooksSectionProps"], reason: "planted: two sections' props" },
  ];
  const found = scanned(root, { distinct });
  expect(found.distinct).toEqual(["restated BooksSectionProps~RegexSectionProps"]);
  expect(found.unwired).toEqual(["restated BookRow~RegexRow"]);
});

test("a file-local alias of a library type is not a synonym row", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/a/src/schema.ts": "type Pattern = RegExp;\nexport const probe = (value: Pattern): string => value.source;",
    // The twins: an exported alias of a library type and a file-local alias of a tree type are both second names.
    "packages/a/src/logging.ts": "export type Matcher = RegExp;",
    "packages/a/src/codes.ts": [
      "export interface Code {\n  id: string;\n  label: string;\n}",
      "type LocalCode = Code;",
      "export const codeOf = (value: LocalCode): string => value.id;",
    ].join("\n"),
  });
  expect(scanned(root).unwired).toEqual(["synonym LocalCode~Code", "synonym Matcher~RegExp"]);
});

// Rows the shapes judgement held as true findings, and the classes it named that no checker fact can separate: these
// must keep reporting. A re-export over another package's door is a finding by ruling, and two bare look-alikes can
// only be told apart by their meaning.
test("true findings and bare look-alikes keep reporting", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    "packages/a/tsconfig.json": plantedTsconfig({ lib: LIB }),
    "packages/a/src/kind.ts": 'export const GALLERY_KIND = "gallery";',
    "packages/a/src/index.ts": 'export { GALLERY_KIND } from "./kind.ts";',
    "packages/b/tsconfig.json": plantedTsconfig({ lib: LIB, paths: { "@fx/a": ["../a/src/index.ts"] } }),
    "packages/b/src/serde.ts": 'export { GALLERY_KIND } from "@fx/a";',
    // A private copy of an exported contract type left behind in a verb file.
    "packages/b/src/contract/gather.ts": "export interface SendRegexSink {\n  emit(text: string): void;\n  flush(): void;\n}",
    "packages/b/src/verbs/turn.ts":
      "interface SendRegexSink {\n  emit(text: string): void;\n  flush(): void;\n}\nexport const sink = (value: SendRegexSink): void => value.flush();",
    // A character span and a span whose doc says bytes: one concept or two is a reading of meaning.
    "packages/b/src/split.ts": "/** A half-open character span. */\nexport interface Span {\n  start: number;\n  end: number;\n}",
    "packages/b/src/hidden.ts": "/** A byte range of hidden text. */\nexport interface HiddenRun {\n  start: number;\n  end: number;\n}",
  });
  const found = scanned(root, { worlds: ["packages/b/tsconfig.json"] });
  expect(found.unwired).toEqual(["reexport-chain GALLERY_KIND~GALLERY_KIND", "restated HiddenRun~Span", "restated SendRegexSink~SendRegexSink"]);
});
