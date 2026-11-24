// `pnpm unwired` reports a callable member only when the reference graph finds no production call of it. A planted
// two-package tree holds one member of each shape the scan must tell apart.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { MemberScanReport } from "../../../tooling/src/unwired/index.ts";
import { memberScanGraph } from "../../../tooling/src/unwired/index.ts";
import { graphTree, JUDGED_WORK, judgedExpected, judgedOutcome, LIB, plantedKnip, plantJudged } from "./_planted.ts";

type Rulings = Parameters<typeof memberScanGraph>[1];
const NO_RULINGS: Rulings = { deliberate: [], judged: [] };

const memberScan = async (root: string, rulings: Rulings = NO_RULINGS): Promise<MemberScanReport> => await memberScanGraph(root, rulings, () => undefined);

const rows = (report: MemberScanReport): readonly string[] =>
  report.unwired.map(({ home, member, kind, tests }) => `${home}.${member} ${kind} ${String(tests)}`).toSorted();

// A solution that adds the tree's tests to the merged program, and a knip config that ships both packages and keeps the
// tests out of the product.
const WITH_TESTS = {
  "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tsconfig.outside.json" }] }),
  "tsconfig.outside.json": plantedTsconfig({ lib: LIB, include: ["tests", "tooling"] }),
  "knip.ts": plantedKnip({
    workspaces: {
      "packages/a": { entry: ["src/**/*.ts!"], project: ["src/**/*.ts!"], ignoreIssues: { "src/**/*.ts": ["exports"] } },
      "packages/b": { entry: ["src/**/*.ts!"], project: ["src/**/*.ts!"], ignoreIssues: { "src/**/*.ts": ["exports"] } },
      ".": { project: ["tests/**/*.ts", "tooling/**/*.ts"] },
    },
  }),
};

const SERVICE = "packages/a/src/service.ts";

const TREE = {
  [SERVICE]: [
    "export interface Service {",
    "  wired: () => number;",
    "  builderOnly: () => number;",
    "  testOnly: () => number;",
    "  testFaked: () => number;",
    "  viaPort: () => number;",
    "  acrossPackages: () => number;",
    "  viaCompose: () => number;",
    "  intoDeadSlot: () => number;",
    "  viaSpread: () => number;",
    "  viaIndex: () => number;",
    "  viaDeadIndex: () => number;",
    "  byElement(): number;",
    "  /** Named in docs only: {@link Service.docOnly} is not a call. */",
    "  docOnly(): number;",
    "  readonly label: string;",
    "}",
    "export function createService(): Service {",
    "  const wired = () => 1;",
    "  return {",
    "    wired,",
    "    builderOnly: () => 2,",
    "    testOnly: () => 3,",
    "    testFaked: () => 3,",
    "    viaPort: () => 4,",
    "    acrossPackages: () => 5,",
    "    viaCompose: () => 6,",
    "    intoDeadSlot: () => 7,",
    "    viaSpread: () => 8,",
    "    viaIndex: () => 9,",
    "    viaDeadIndex: () => 9,",
    "    byElement: () => 10,",
    "    docOnly: () => 11,",
    '    label: "l",',
    "  };",
    "}",
    "export interface Clock {",
    "  implementedOnly(): number;",
    "}",
    "export class SystemClock implements Clock {",
    "  implementedOnly(): number {",
    "    return 0;",
    "  }",
    "}",
  ].join("\n"),
  "packages/a/src/app.ts": 'import { createService } from "./service.ts";\nexport const total = createService().wired() + createService()["byElement"]();',
  // A composition root hands the owner's verbs into a consumer's own port, which no reference links to the owner.
  "packages/a/src/consumer.ts": [
    "export interface Consumer {",
    "  readonly viaCompose: () => number;",
    "  readonly intoDeadSlot: () => number;",
    "}",
    "export interface Spreader { readonly viaSpread: () => number; }",
    "export const run = (consumer: Consumer, spreader: Spreader): number => consumer.viaCompose() + spreader.viaSpread();",
  ].join("\n"),
  "packages/a/src/compose.ts": [
    'import type { Consumer, Spreader } from "./consumer.ts";',
    'import { createService } from "./service.ts";',
    "const service = createService();",
    "export const consumer: Consumer = service;",
    "export const spreader: Spreader = { ...service };",
  ].join("\n"),
  // Uses no name joins to the member: an overload implementation's props, a literal kept by `satisfies`, a spread
  // into a call's typed argument. Each has an unused sibling beside it.
  "packages/a/src/links.ts": [
    "export interface PublicProps { readonly save?: () => number; readonly spare?: () => number; }",
    "interface ImplProps { readonly save?: () => number; readonly spare?: () => number; }",
    "export function makeBoundary(): (props: PublicProps) => number;",
    "export function makeBoundary(): (props: ImplProps) => number {",
    "  return (props) => props.save?.() ?? 0;",
    "}",
    "export const bounded = makeBoundary()({ save: () => 1, spare: () => 2 });",
    "export interface Copy { readonly title: () => string; readonly unusedLine: () => string; }",
    'export const COPY = { a: { title: () => "t", unusedLine: () => "u" } } satisfies Record<string, Copy>;',
    "export const shownTitle = COPY.a.title();",
    "export interface Seed { readonly hash?: () => string; readonly stray?: () => string; }",
    "export interface SeedInput { readonly hash?: () => string; readonly name: string; }",
    "export const seedOwner = (input: SeedInput): string => input.hash?.() ?? input.name;",
    'const seedFrom = (seed: Seed): string => seedOwner({ name: "n", ...seed });',
    'export const seeded = seedFrom({ hash: () => "h", stray: () => "s" });',
  ].join("\n"),
  "packages/b/src/port.ts": [
    'import type { Service } from "../../a/src/service.ts";',
    'export type Port = Pick<Service, "viaPort">;',
    'export interface IndexedPort { readonly viaIndex: Service["viaIndex"]; readonly viaDeadIndex: Service["viaDeadIndex"]; }',
    "export const run = (port: Port, indexed: IndexedPort): number => port.viaPort() + indexed.viaIndex();",
  ].join("\n"),
  "packages/b/src/use.ts": 'import { createService } from "../../a/src/service.ts";\nexport const reached = createService().acrossPackages();',
  "tests/a.test.ts": [
    'import { createService, type Service } from "../packages/a/src/service.ts";',
    "export const probed = createService().testOnly();",
    'export const fake: Pick<Service, "testFaked"> = { testFaked: () => 0 };',
  ].join("\n"),
  ...WITH_TESTS,
};

test("the member scan tells wired, builder-only, test-only, derived-port, cross-package and element-read members apart", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await memberScan(await plantedTree(graphTree(TREE)));
  expect(rows(report)).toEqual([
    "Clock.implementedOnly builder-only 0",
    "Consumer.intoDeadSlot builder-only 0",
    "Copy.unusedLine builder-only 0",
    // the overload's caller writes it, and the overload's parameter fills the implementation's
    "ImplProps.spare builder-only 0",
    "IndexedPort.viaDeadIndex unreferenced 0",
    "PublicProps.spare builder-only 0",
    "Seed.stray builder-only 0",
    "Service.builderOnly builder-only 0",
    "Service.docOnly builder-only 0",
    "Service.intoDeadSlot builder-only 0",
    // a test fake writes it and nothing reads it: the write outside the product makes no row test-only
    "Service.testFaked builder-only 0",
    "Service.testOnly test-only 1",
    "Service.viaDeadIndex builder-only 0",
  ]);
});

// A composition root hands one verb into its sibling through a parameter typed `Verbs["bundle"]`, and a hook hands its
// settle callbacks to a library's `mutate`. Neither use names the member; a type mention alone, a binding typed by a
// member but given another value, and a member no slot takes stay reported.
const SEAMS = {
  "packages/a/src/verbs.ts": [
    "export interface Verbs {",
    "  readonly bundle: (name: string) => number;",
    "  readonly file: (name: string) => number;",
    "  readonly spareVerb: (name: string) => number;",
    "  readonly ghost: (name: string) => number;",
    "}",
    'export function createFile(bundle: Verbs["bundle"], _spare: Verbs["spareVerb"]): Verbs["file"] {',
    "  return (name) => bundle(name);",
    "}",
    "export function createVerbs(): Verbs {",
    "  const bundle = (name: string): number => name.length;",
    "  const spareVerb = (): number => 0;",
    "  return { bundle, file: createFile(bundle, spareVerb), spareVerb, ghost: () => 9 };",
    "}",
    'export const filed = createVerbs().file("x");',
    // Typed by a member but handed an unrelated value: the binding's reads are not the member's.
    'export function runWith(fn: Verbs["ghost"]): number {',
    '  return fn("y");',
    "}",
    "export const ran = runWith(() => 7);",
    'const local: Verbs["ghost"] = () => 8;',
    'export const localRan = local("z");',
  ].join("\n"),
  "node_modules/fx-query/package.json": JSON.stringify({ name: "fx-query", types: "index.d.ts" }),
  "node_modules/fx-query/index.d.ts": [
    "export interface MutateOptions { onError?: (error: unknown) => void; onSuccess?: () => void }",
    "export declare function mutate(input: string, options?: MutateOptions): void;",
  ].join("\n"),
  "packages/a/src/settle.ts": [
    'import { mutate } from "fx-query";',
    "export interface Settle {",
    "  readonly onError: (error: unknown) => void;",
    "  readonly onSuccess: () => void;",
    "  readonly onNever: () => void;",
    "}",
    'export const fire = (settle: Settle): void => mutate("x", settle);',
    "export const fired = fire({ onError: () => undefined, onSuccess: () => undefined, onNever: () => undefined });",
  ].join("\n"),
};

test("a verb called through a binding typed by it and callbacks handed to a library slot are wired", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await memberScan(await plantedTree(graphTree(SEAMS)));
  expect(report.unwired.map(({ home, member, kind }) => `${home}.${member} ${kind}`).toSorted()).toEqual([
    "Settle.onNever builder-only",
    "Verbs.ghost builder-only",
    "Verbs.spareVerb builder-only",
  ]);
});

test("a deliberate entry moves its member out of the unwired list with its reason", { timeout: 120_000 }, async ({ plantedTree }) => {
  const reason = "called by an external agent";
  const report = await memberScan(await plantedTree(graphTree(TREE)), {
    deliberate: [{ file: SERVICE, home: "Service", member: "builderOnly", reason }],
    judged: [],
  });
  expect(report.unwired.map(({ member }) => member)).not.toContain("builderOnly");
  expect(report.deliberate.map(({ member, reason: why }) => ({ member, why }))).toEqual([{ member: "builderOnly", why: reason }]);
});

// A row whose fix an open item owns reports apart, with its item; an entry whose item is done or whose row no longer
// reports is stale, and the done item's row reports as unwired again.
test("a judged row reports apart with its open item, and an entry for a done item or a gone row is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({ ...graphTree(TREE), ...JUDGED_WORK });
  const judged = plantJudged(await memberScan(root), "Copy.unusedLine", "Clock.implementedOnly");
  expect(judgedOutcome(await memberScan(root, { deliberate: [], judged }), "Copy.unusedLine", "Clock.implementedOnly")).toEqual(
    judgedExpected("Copy.unusedLine", "Clock.implementedOnly"),
  );
});

// A floor instrument is the probe code snap drives (D357: snap drives the real app, so what it reads is the product's), and
// it calls the dev bridge through a local alias as a product reader does. Nothing imports either probe here, so only where
// the file lives decides: the member the instrument calls is wired, the same call from other tooling is a test-style read,
// and a member nothing calls stays builder-only.
const BRIDGE = "packages/a/src/bridge.ts";
const INSTRUMENT = "tooling/src/floor/instrument/probe.ts";
const ELSEWHERE = "tooling/src/other/probe.ts";

test("a bridge member called through a local alias in a floor instrument is wired; one called in other tooling is not", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await memberScan(
    await plantedTree(
      graphTree({
        ...WITH_TESTS,
        [BRIDGE]: [
          "export interface Bridge { readonly aliased: () => string; readonly elsewhere: () => string; readonly unread: () => string }",
          "declare global {",
          "  var __orb: Bridge | undefined;",
          "}",
          'export const install = (): void => { globalThis.__orb = { aliased: () => "a", elsewhere: () => "e", unread: () => "u" }; };',
        ].join("\n"),
        [INSTRUMENT]: [
          "export const aliasedCall = (): string | undefined => {",
          "  const bridge = globalThis.__orb;",
          "  return bridge?.aliased();",
          "};",
        ].join("\n"),
        [ELSEWHERE]: [
          "export const elsewhereCall = (): string | undefined => {",
          "  const bridge = globalThis.__orb;",
          "  return bridge?.elsewhere();",
          "};",
        ].join("\n"),
      }),
    ),
  );
  expect(rows(report)).toEqual(["Bridge.elsewhere test-only 1", "Bridge.unread builder-only 0"]);
});
