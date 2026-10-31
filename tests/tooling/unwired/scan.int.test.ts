// `pnpm unwired` reports a member only when neither the TypeScript 7.1 index nor the TypeScript 6 language service
// finds a production use. A planted two-package tree holds one member of each shape the scan must tell apart.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
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
  "packages/b/tsconfig.json": plantedTsconfig({ lib: LIB, paths: { "@fx/a": ["../a/src/service.ts"] } }),
  "packages/b/src/port.ts": [
    'import type { Service } from "@fx/a";',
    'export type Port = Pick<Service, "viaPort">;',
    'export interface IndexedPort { readonly viaIndex: Service["viaIndex"]; }',
    "export const run = (port: Port, indexed: IndexedPort): number => port.viaPort() + indexed.viaIndex();",
  ].join("\n"),
  "packages/b/src/use.ts": 'import { createService } from "@fx/a";\nexport const reached = createService().acrossPackages();',
  "tsconfig.json": plantedTsconfig({ lib: LIB, paths: { "@fx/a": ["./packages/a/src/service.ts"] }, include: ["packages/*/src", "tests"] }),
  "tests/a.test.ts": 'import { createService } from "@fx/a";\nexport const probed = createService().testOnly();',
};

const WORLDS = ["packages/a/tsconfig.json", "packages/b/tsconfig.json"];

test("the unwired scan tells wired, builder-only, test-only, derived-port, cross-package and element-read members apart", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(TREE);
  const report = scanUnwired({ root, worlds: WORLDS, testWorlds: ["tsconfig.json"], deliberate: [], log: () => undefined });
  const found = report.unwired.map(({ home, member, kind, tests }) => ({ at: `${home}.${member}`, kind, tests }));
  expect(found.toSorted((a, b) => a.at.localeCompare(b.at))).toEqual([
    { at: "Clock.implementedOnly", kind: "builder-only", tests: 0 },
    { at: "Consumer.intoDeadSlot", kind: "unreferenced", tests: 0 },
    { at: "Service.builderOnly", kind: "builder-only", tests: 0 },
    { at: "Service.docOnly", kind: "builder-only", tests: 0 },
    { at: "Service.intoDeadSlot", kind: "builder-only", tests: 0 },
    { at: "Service.testOnly", kind: "test-only", tests: 1 },
  ]);
  expect(report.disagreements).toEqual([]);
  // The owner's verb reaches production only through the consumer port the composition root hands it into.
  expect(report.reachedByFlow.toSorted((a, b) => a.key.localeCompare(b.key))).toEqual([
    { key: "packages/a/src/service.ts:Service.viaCompose", via: "packages/a/src/consumer.ts:Consumer.viaCompose" },
    { key: "packages/a/src/service.ts:Service.viaIndex", via: "packages/b/src/port.ts:IndexedPort.viaIndex" },
    { key: "packages/a/src/service.ts:Service.viaSpread", via: "packages/a/src/consumer.ts:Spreader.viaSpread" },
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
  const served = serviceReferences(
    root,
    WORLDS,
    members.map(({ member }) => member.site),
    { log: () => undefined },
  );
  const uses = members.map(({ member }) =>
    (served.get(`${member.site.file}:${member.site.position}`) ?? []).map((site) => `${site.file}:${sources.line(site)}`),
  );
  expect(uses).toEqual([
    ["packages/a/src/service.ts:21", "packages/b/src/port.ts:4"],
    ["packages/a/src/service.ts:22", "packages/b/src/use.ts:2"],
  ]);
});
