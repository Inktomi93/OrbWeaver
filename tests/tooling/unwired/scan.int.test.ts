// `pnpm unwired` reports a member only when neither the language service nor the TS 7 language server finds a
// production use. A planted two-package tree holds one member of each shape the scan must tell apart.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { scanUnwired, scanWorld, serverReferences } from "../../../tooling/src/unwired/index.ts";

const COMPILER = {
  compilerOptions: {
    strict: true,
    target: "ESNext",
    lib: ["ESNext"],
    module: "ESNext",
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  },
};

const TREE = {
  "packages/a/tsconfig.json": JSON.stringify({ ...COMPILER, include: ["src"] }),
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
    "}",
    "export function createService(): Service {",
    "  return { wired: () => 1, builderOnly: () => 2, testOnly: () => 3, viaPort: () => 4, acrossPackages: () => 5, viaCompose: () => 6, intoDeadSlot: () => 7, viaSpread: () => 8, viaIndex: () => 9 };",
    "}",
  ].join("\n"),
  "packages/a/src/app.ts": 'import { createService } from "./service.ts";\nexport const total = createService().wired();',
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
  "packages/b/tsconfig.json": JSON.stringify({
    ...COMPILER,
    compilerOptions: { ...COMPILER.compilerOptions, paths: { "@fx/a": ["../a/src/service.ts"] } },
    include: ["src"],
  }),
  "packages/b/src/port.ts":
    'import type { Service } from "@fx/a";\nexport type Port = Pick<Service, "viaPort">;\nexport interface IndexedPort { readonly viaIndex: Service["viaIndex"]; }\nexport const run = (port: Port, indexed: IndexedPort): number => port.viaPort() + indexed.viaIndex();',
  "packages/b/src/use.ts": 'import { createService } from "@fx/a";\nexport const reached = createService().acrossPackages();',
  "tsconfig.json": JSON.stringify({
    ...COMPILER,
    compilerOptions: { ...COMPILER.compilerOptions, paths: { "@fx/a": ["./packages/a/src/service.ts"] } },
    include: ["packages/*/src", "tests"],
  }),
  "tests/a.test.ts": 'import { createService } from "@fx/a";\nexport const probed = createService().testOnly();',
};

test("the unwired scan tells wired, builder-only, test-only, derived-port and cross-package members apart", { timeout: 120_000 }, async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await plantedTree(TREE);
  const report = await scanUnwired({
    root,
    worlds: ["packages/a/tsconfig.json", "packages/b/tsconfig.json"],
    testWorlds: ["tsconfig.json"],
    serverBin: join(repoRoot, "node_modules/.bin/tsc"),
    deliberate: [],
    log: () => undefined,
  });
  expect(report.unwired.map(({ home, member, kind }) => ({ home, member, kind }))).toEqual([
    { home: "Service", member: "builderOnly", kind: "builder-only" },
    { home: "Service", member: "testOnly", kind: "test-only" },
    { home: "Service", member: "intoDeadSlot", kind: "builder-only" },
    { home: "Consumer", member: "intoDeadSlot", kind: "unreferenced" },
  ]);
  expect(report.disagreements).toEqual([]);
  // The owner's verb reaches production only through the consumer port the composition root hands it into.
  expect(report.reachedByFlow).toEqual([
    { key: "packages/a/src/service.ts:Service.viaCompose", via: "packages/a/src/consumer.ts:Consumer.viaCompose" },
    { key: "packages/a/src/service.ts:Service.viaSpread", via: "packages/a/src/consumer.ts:Spreader.viaSpread" },
    { key: "packages/a/src/service.ts:Service.viaIndex", via: "packages/b/src/port.ts:IndexedPort.viaIndex" },
  ]);
});

test("a deliberate entry moves its member out of the unwired list with its reason", { timeout: 120_000 }, async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree(TREE);
  const reason = "called by an external agent";
  const report = await scanUnwired({
    root,
    worlds: ["packages/a/tsconfig.json", "packages/b/tsconfig.json"],
    testWorlds: [],
    serverBin: join(repoRoot, "node_modules/.bin/tsc"),
    deliberate: [{ file: "packages/a/src/service.ts", home: "Service", member: "builderOnly", reason }],
    log: () => undefined,
  });
  expect(report.unwired.map(({ member }) => member)).toEqual(["testOnly", "intoDeadSlot", "intoDeadSlot"]);
  expect(report.deliberate.map(({ member, reason: why }) => ({ member, why }))).toEqual([{ member: "builderOnly", why: reason }]);
});

test("both engines find the production uses, the language server included", { timeout: 120_000 }, async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree(TREE);
  const members = scanWorld(root, "packages/a/tsconfig.json").filter(({ member }) => member === "wired" || member === "acrossPackages");
  expect(members.map(({ member, counts }) => ({ member, use: counts.use }))).toEqual([
    { member: "wired", use: 1 },
    { member: "acrossPackages", use: 0 },
  ]);
  const served = await serverReferences(root, join(repoRoot, "node_modules/.bin/tsc"), members, ["packages/b/src/use.ts"]);
  expect(served.map(({ key, uses }) => ({ key, uses }))).toEqual([
    { key: "packages/a/src/service.ts:Service.wired", uses: ["packages/a/src/app.ts:2"] },
    { key: "packages/a/src/service.ts:Service.acrossPackages", uses: ["packages/b/src/use.ts:2"] },
  ]);
});
