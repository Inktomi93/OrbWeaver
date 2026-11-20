// `pnpm unwired` reports a member only when the TypeScript 7.1 index finds no production use, in one pass; the
// `--cross-check` audit asks the TypeScript 6 language service and must find nothing more. A planted two-package tree
// holds one member of each shape the scan must tell apart.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { vi } from "vitest";
import { NativeWorld, Sources, scanUnwired, scanWorld, serviceReferences } from "../../../tooling/src/unwired/index.ts";
import { LIB } from "./_planted.ts";

const TREE = {
  "packages/a/tsconfig.json": plantedTsconfig({ lib: LIB }),
  "packages/a/src/service.ts": [
    "export interface Service {",
    "  wired: () => number;",
    "  builderOnly: () => number;",
    "  testOnly: () => number;",
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
    "}",
    "export function createService(): Service {",
    "  const wired = () => 1;",
    "  return {",
    "    wired,",
    "    builderOnly: () => 2,",
    "    testOnly: () => 3,",
    "    viaPort: () => 4,",
    "    acrossPackages: () => 5,",
    "    viaCompose: () => 6,",
    "    intoDeadSlot: () => 7,",
    "    viaSpread: () => 8,",
    "    viaIndex: () => 9,",
    "    viaDeadIndex: () => 9,",
    "    byElement: () => 10,",
    "    docOnly: () => 11,",
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
  "packages/b/tsconfig.json": plantedTsconfig({ lib: LIB, paths: { "@fx/a": ["../a/src/service.ts"] } }),
  "packages/b/src/port.ts": [
    'import type { Service } from "@fx/a";',
    'export type Port = Pick<Service, "viaPort">;',
    'export interface IndexedPort { readonly viaIndex: Service["viaIndex"]; readonly viaDeadIndex: Service["viaDeadIndex"]; }',
    "export const run = (port: Port, indexed: IndexedPort): number => port.viaPort() + indexed.viaIndex();",
  ].join("\n"),
  "packages/b/src/use.ts": 'import { createService } from "@fx/a";\nexport const reached = createService().acrossPackages();',
  "tsconfig.json": plantedTsconfig({ lib: LIB, paths: { "@fx/a": ["./packages/a/src/service.ts"] }, include: ["packages/*/src", "tests"] }),
  "tests/a.test.ts": 'import { createService } from "@fx/a";\nexport const probed = createService().testOnly();',
};

const WORLDS = ["packages/a/tsconfig.json", "packages/b/tsconfig.json"];

test.for([
  { pass: "engine one alone", crossCheck: false },
  { pass: "the cross-check audit", crossCheck: true },
])(
  "the unwired scan tells wired, builder-only, test-only, derived-port, cross-package and element-read members apart under $pass",
  {
    timeout: 120_000,
  },
  async ({ crossCheck }, { plantedTree }) => {
    const root = await plantedTree(TREE);
    const report = scanUnwired({ root, worlds: WORLDS, testWorlds: ["tsconfig.json"], deliberate: [], log: () => undefined, crossCheck });
    const found = report.unwired.map(({ home, member, kind, tests }) => ({ at: `${home}.${member}`, kind, tests }));
    expect(found.toSorted((a, b) => a.at.localeCompare(b.at))).toEqual([
      { at: "Clock.implementedOnly", kind: "builder-only", tests: 0 },
      { at: "Consumer.intoDeadSlot", kind: "builder-only", tests: 0 },
      { at: "Copy.unusedLine", kind: "builder-only", tests: 0 },
      { at: "ImplProps.spare", kind: "unreferenced", tests: 0 },
      { at: "IndexedPort.viaDeadIndex", kind: "unreferenced", tests: 0 },
      { at: "PublicProps.spare", kind: "builder-only", tests: 0 },
      { at: "Seed.stray", kind: "builder-only", tests: 0 },
      { at: "Service.builderOnly", kind: "builder-only", tests: 0 },
      { at: "Service.docOnly", kind: "builder-only", tests: 0 },
      { at: "Service.intoDeadSlot", kind: "builder-only", tests: 0 },
      { at: "Service.testOnly", kind: "test-only", tests: 1 },
      { at: "Service.viaDeadIndex", kind: "builder-only", tests: 0 },
    ]);
    // Engine one follows the composition root's hand-off into the consumer port, a spread into a typed literal and an
    // `Owner["m"]` member itself, so find-references finds no use it lacks.
    expect(report.disagreements).toEqual([]);
  },
);

// A composition root hands one verb into its sibling through a parameter typed `Verbs["bundle"]`, and a hook hands its
// settle callbacks to a library's `mutate`. Neither use names the member; a type mention alone, a binding typed by a
// member but given another value, and a member no slot takes stay reported.
const SEAMS = {
  "packages/a/tsconfig.json": plantedTsconfig({ lib: LIB }),
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
  "packages/a/src/query.d.ts": [
    'declare module "fx-query" {',
    "  export interface MutateOptions { onError?: (error: unknown) => void; onSuccess?: () => void }",
    "  export function mutate(input: string, options?: MutateOptions): void;",
    "}",
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
  const root = await plantedTree(SEAMS);
  const report = scanUnwired({ root, worlds: [WORLDS[0] as string], testWorlds: [], deliberate: [], log: () => undefined });
  expect(report.unwired.map(({ home, member, kind }) => `${home}.${member} ${kind}`).toSorted()).toEqual([
    "Settle.onNever builder-only",
    "Verbs.ghost builder-only",
    "Verbs.spareVerb builder-only",
  ]);
});

test("a deliberate entry moves its member out of the unwired list with its reason", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const reason = "called by an external agent";
  const report = scanUnwired({
    root,
    worlds: WORLDS,
    testWorlds: [],
    deliberate: [{ file: "packages/a/src/service.ts", home: "Service", member: "builderOnly", reason }],
    log: () => undefined,
  });
  expect(report.unwired.map(({ member }) => member)).not.toContain("builderOnly");
  expect(report.deliberate.map(({ member, reason: why }) => ({ member, why }))).toEqual([{ member: "builderOnly", why: reason }]);
});

test("each engine finds the cross-package and derived-port uses on its own", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const sources = new Sources(root);
  using world = NativeWorld.open(root, "packages/b/tsconfig.json");
  const members = scanWorld(world, sources).filter(({ member }) => member.member === "viaPort" || member.member === "acrossPackages");
  expect(members.map(({ member, counts }) => ({ member: member.member, use: counts.use, builder: counts.builder }))).toEqual([
    { member: "viaPort", use: 1, builder: 1 },
    { member: "acrossPackages", use: 1, builder: 1 },
  ]);
  const sites = members.map(({ member }) => member.site);
  const usesFrom = (crossCheck: boolean): string[][] => {
    const served = serviceReferences(root, WORLDS, sites, { log: () => undefined, crossCheck, lists: NativeWorld.fileLists(root, WORLDS) });
    return sites.map((site) => (served.get(`${site.file}:${site.position}`) ?? []).map((found) => `${found.file}:${sources.line(found)}`).toSorted());
  };
  const expected = [
    ["packages/a/src/service.ts:22", "packages/b/src/port.ts:4"],
    ["packages/a/src/service.ts:23", "packages/b/src/use.ts:2"],
  ];
  expect(usesFrom(false)).toEqual(expected);
  // `--cross-check` asks the TypeScript 6 language service, which must reach the same uses.
  expect(usesFrom(true)).toEqual(expected);
});

test("engine two asks a site only in worlds that add a file spelling its name, and misses no reference", { timeout: 120_000 }, async ({ plantedTree }) => {
  const shape = "export interface Shape { readonly spelled: string; readonly quiet: string }";
  const root = await plantedTree({
    "wide/tsconfig.json": plantedTsconfig({ lib: LIB, include: ["src", "../shared"] }),
    "narrow/tsconfig.json": plantedTsconfig({ lib: LIB, include: ["src", "../shared"] }),
    "shared/shape.ts": shape,
    "wide/src/quiet.ts": 'import type { Shape } from "../../shared/shape.ts";\nexport const quiet = (shape: Shape): string => shape.quiet;',
    "wide/src/spelled.ts": 'import type { Shape } from "../../shared/shape.ts";\nexport const wide = (shape: Shape): string => shape.spelled;',
    "narrow/src/spelled.ts": 'import type { Shape } from "../../shared/shape.ts";\nexport const narrow = (shape: Shape): string => shape.spelled;',
  });
  const quiet = { file: "shared/shape.ts", position: shape.indexOf("quiet") };
  const spelled = { file: "shared/shape.ts", position: shape.indexOf("spelled") };
  const asked = vi.spyOn(NativeWorld.prototype, "referencesAt");
  const worlds = ["narrow/tsconfig.json", "wide/tsconfig.json"];
  const served = serviceReferences(root, worlds, [quiet, spelled, spelled], { log: () => undefined, lists: NativeWorld.fileLists(root, worlds) });
  const sizes = asked.mock.calls.map(([sites]) => sites.length);
  asked.mockRestore();
  expect(sizes.toSorted((a, b) => a - b)).toEqual([1, 2]);
  expect((served.get(`${quiet.file}:${quiet.position}`) ?? []).map(({ file }) => file)).toEqual(["wide/src/quiet.ts"]);
  expect((served.get(`${spelled.file}:${spelled.position}`) ?? []).map(({ file }) => file).toSorted()).toEqual([
    "narrow/src/spelled.ts",
    "wide/src/spelled.ts",
  ]);
});
