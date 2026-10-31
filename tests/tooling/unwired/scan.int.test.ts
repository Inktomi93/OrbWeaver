// `pnpm unwired` reports a member only when neither the TypeScript 7.1 index nor the TypeScript 6 language service
// finds a production use. A planted two-package tree holds one member of each shape the scan must tell apart.
import { expect, test } from "@orb/testkit/tooling";
import { NativeWorld, Sources, scanUnwired, scanWorld, serviceReferences } from "../../../tooling/src/unwired/index.ts";
import { config } from "./_planted.ts";

const PATHS = { "@fx/a": ["../a/src/service.ts"] };

const TREE = {
  "packages/a/tsconfig.json": config(["src"]),
  "packages/a/src/service.ts": [
    "export interface Service {",
    "  wired: () => number;",
    "  builderOnly: () => number;",
    "  testOnly: () => number;",
    "  viaPort: () => number;",
    "  acrossPackages: () => number;",
    "  byElement(): number;",
    "  /** Named in docs only: {@link Service.docOnly} is not a call. */",
    "  docOnly(): number;",
    "}",
    "export function createService(): Service {",
    "  const wired = () => 1;",
    "  return { wired, builderOnly: () => 2, testOnly: () => 3, viaPort: () => 4, acrossPackages: () => 5, byElement: () => 6, docOnly: () => 7 };",
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
  "packages/b/tsconfig.json": config(["src"], { paths: PATHS }),
  "packages/b/src/port.ts":
    'import type { Service } from "@fx/a";\nexport type Port = Pick<Service, "viaPort">;\nexport const run = (port: Port): number => port.viaPort();',
  "packages/b/src/use.ts": 'import { createService } from "@fx/a";\nexport const reached = createService().acrossPackages();',
  "tsconfig.json": config(["packages/*/src", "tests"], { paths: { "@fx/a": ["./packages/a/src/service.ts"] } }),
  "tests/a.test.ts": 'import { createService } from "@fx/a";\nexport const probed = createService().testOnly();',
};

const WORLDS = ["packages/a/tsconfig.json", "packages/b/tsconfig.json"];

test("the unwired scan tells wired, builder-only, test-only, derived-port, cross-package and element-read members apart", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(TREE);
  const report = scanUnwired({ root, worlds: WORLDS, testWorlds: ["tsconfig.json"], deliberate: [], log: () => undefined });
  expect(report.unwired.map(({ member, kind, tests }) => ({ member, kind, tests }))).toEqual([
    { member: "builderOnly", kind: "builder-only", tests: 0 },
    { member: "testOnly", kind: "test-only", tests: 1 },
    { member: "docOnly", kind: "builder-only", tests: 0 },
    { member: "implementedOnly", kind: "builder-only", tests: 0 },
  ]);
  expect(report.disagreements).toEqual([]);
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
  expect(report.unwired.map(({ member }) => member)).toEqual(["testOnly", "docOnly", "implementedOnly"]);
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
    () => undefined,
  );
  const uses = members.map(({ member }) =>
    (served.get(`${member.site.file}:${member.site.position}`) ?? []).map((site) => `${site.file}:${sources.line(site)}`),
  );
  expect(uses).toEqual([
    ["packages/a/src/service.ts:13", "packages/b/src/port.ts:3"],
    ["packages/a/src/service.ts:13", "packages/b/src/use.ts:2"],
  ]);
});
