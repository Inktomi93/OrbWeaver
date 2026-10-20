// @subject tooling/src/floor/code-facts/semantic-inventory.ts
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  buildLiveness,
  collectChainCandidates,
  collectOrphanCandidates,
  collectSwallowedCandidates,
  collectTypeOnlyCandidates,
  ownExports,
  testOnlyClassOf,
} from "@orb/tooling/ast";
import type { InventoryBuildRequest, InventoryMembership, StoredInventoryPartition } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { SemanticInventoryError } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { latestInventoryGeneration, openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import type { SourceCorpus } from "@orb/tooling/floor/compiler/ts-workspace";
import { scopedInventoryPrograms } from "../../../../tooling/src/floor/code-facts/semantic-inventory-scope.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { initializeNativeInventoryFixture, nativeInventoryFixture, writeNativeInventoryFixtureFile as write } from "../compiler/native-inventory-fixture.ts";

function world(program: string, roots: readonly string[], imports: readonly string[] = []): InventoryMembership {
  return { program, roots: [...roots], available: [...roots, ...imports, "/lib/lib.d.ts"] };
}

// Shaped like the repository: a type-only client import pulls server source into the client world, tests
// import server and tooling, and a tests-dom world imports the client.
const MEMBERSHIP = [
  world("kit", ["/kit/a.ts"]),
  world("server", ["/server/s.ts"], ["/kit/a.ts"]),
  world("client", ["/client/c.ts"], ["/server/s.ts", "/kit/a.ts"]),
  world("tests-dom", ["/tests/c.dom.test.ts"], ["/client/c.ts", "/server/s.ts", "/kit/a.ts"]),
  world("tooling", ["/tooling/t.ts"], ["/server/s.ts", "/kit/a.ts"]),
  world("tests", ["/tests/s.test.ts"], ["/tooling/t.ts", "/server/s.ts", "/kit/a.ts"]),
  world("sdk", ["/sdk/main.d.ts"]),
];

test("a scope selects every world containing it and every world containing a selected world's roots", () => {
  expect([...scopedInventoryPrograms(MEMBERSHIP, ["/server/s.ts"])].toSorted()).toEqual(["client", "server", "tests", "tests-dom", "tooling"]);
  expect([...scopedInventoryPrograms(MEMBERSHIP, ["/sdk/main.d.ts"])]).toEqual(["sdk"]);
});

test("transitive consumers of a selected root are kept even when they never contain the scope", () => {
  // The client file is a root of the selected client world; dom imports it and must stay.
  const membership = [world("server", ["/server/s.ts"]), world("client", ["/client/c.ts"], ["/server/s.ts"]), world("dom", ["/d.ts"], ["/client/c.ts"])];
  expect([...scopedInventoryPrograms(membership, ["/server/s.ts"])].toSorted()).toEqual(["client", "dom", "server"]);
});

test("an ambient root every world loads never pulls unrelated worlds into a scope", () => {
  const ambient = MEMBERSHIP.map((entry) => ({ ...entry, roots: [...entry.roots, "/env.d.ts"], available: [...entry.available, "/env.d.ts"] }));
  expect([...scopedInventoryPrograms(ambient, ["/server/s.ts"])].toSorted()).toEqual(["client", "server", "tests", "tests-dom", "tooling"]);
  // A scope on the shared root itself still selects every world that owns it.
  expect(scopedInventoryPrograms(ambient, ["/env.d.ts"]).size).toBe(MEMBERSHIP.length);
});

test("a scope that no world contains refuses instead of selecting nothing", () => {
  expect(() => scopedInventoryPrograms(MEMBERSHIP, ["/outside/x.ts"])).toThrow(SemanticInventoryError);
  expect(() => scopedInventoryPrograms(MEMBERSHIP, [])).toThrow(/contained by no eligible compiler world/u);
});

test("membership with a repeated program refuses before selection", () => {
  expect(() => scopedInventoryPrograms([...MEMBERSHIP, world("kit", ["/kit/b.ts"])], ["/kit/a.ts"])).toThrow(/repeats a program: kit/u);
});

const KIT = "/packages/kit/src/";
const UI_WORLD = "packages/ui/tsconfig.json";

function initialize(root: string): void {
  initializeNativeInventoryFixture(root);
  // A world that imports nothing from kit: a kit-scoped acquisition must never extract its facts.
  write(root, UI_WORLD, JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022"] }, include: ["src/*.ts"] }));
  write(root, "packages/ui/src/view.ts", "export const view=1;\n");
}

function kitVerdicts(corpus: SourceCorpus): object {
  const live = buildLiveness(corpus, { edges: true });
  const inKit = (path: string): boolean => path.includes(KIT);
  const kit = corpus.getSourceFiles().filter((sf) => inKit(sf.getFilePath()));
  return {
    orphans: collectOrphanCandidates(corpus, live, inKit).map(({ name, starSuppressed }) => [name, starSuppressed]),
    testOnly: kit.flatMap((sf) => [...ownExports(sf)].map(({ name, decl }) => [name, testOnlyClassOf(sf, name, decl, live)])),
    swallowed: collectSwallowedCandidates(corpus, live, inKit).map(({ name, sites }) => [name, sites]),
    types: collectTypeOnlyCandidates(corpus, inKit).map(({ name, sites, unionSource }) => [name, sites, unionSource]),
    chains: collectChainCandidates(corpus, live, inKit).map(({ name, chain }) => [name, chain]),
    tooling: live.externalConsumptions.map((fact) => [fact.targetKey, fact.consumerClass]),
  };
}

function storedPartitions(databasePath: string): {
  readonly latest: readonly StoredInventoryPartition[];
  readonly cohort: readonly StoredInventoryPartition[];
} {
  using db = openInventoryDatabase(databasePath);
  const generation = latestInventoryGeneration(db);
  return { latest: readInventoryGeneration(db, generation), cohort: readInventoryGeneration(db, generation - 1) };
}

test("a scoped acquisition extracts only the worlds that can change its answer and keeps every verdict", { tags: ["slow"], timeout: scaledBudget(300_000) }, ({
  scratch,
}) => {
  initialize(scratch);
  const scopedPath = join(scratch, ".cache/scoped.sqlite");
  const fullPath = join(scratch, ".cache/full.sqlite");
  const scope = { files: [join(scratch, "packages/kit/src/base.ts"), join(scratch, "packages/kit/src/barrel.ts")] };
  const workers: string[] = [];
  const requests: InventoryBuildRequest[] = [];
  let scopedVerdicts: object;
  {
    using scoped = nativeInventoryFixture({ root: scratch, databasePath: scopedPath, scope }, { workers, requests });
    scopedVerdicts = kitVerdicts(scoped.sourceCorpus());
    expect(scoped.programs.toSorted()).toEqual(["packages/client/tsconfig.json", "packages/kit/tsconfig.json", "tsconfig.tools.json"]);
  }
  expect(requests.map(({ descriptor, intent }) => [descriptor.id, intent ?? "facts"].join(" ")).toSorted()).toEqual([
    "packages/client/tsconfig.json facts",
    "packages/client/tsconfig.json membership",
    "packages/kit/tsconfig.json facts",
    "packages/kit/tsconfig.json membership",
    `${UI_WORLD} membership`,
    "tsconfig.tools.json facts",
    "tsconfig.tools.json membership",
  ]);
  const { latest, cohort } = storedPartitions(scopedPath);
  expect(latest.map(({ program, intent }) => [program, intent])).toEqual([
    ["packages/client/tsconfig.json", "facts"],
    ["packages/kit/tsconfig.json", "facts"],
    ["tsconfig.tools.json", "facts"],
  ]);
  expect(cohort.map(({ program, intent }) => [program, intent])).toEqual([
    ["packages/client/tsconfig.json", "membership"],
    ["packages/kit/tsconfig.json", "membership"],
    [UI_WORLD, "membership"],
    ["tsconfig.tools.json", "membership"],
  ]);
  using full = nativeInventoryFixture({ root: scratch, databasePath: fullPath });
  expect(full.programs).toContain(UI_WORLD);
  expect(scopedVerdicts).toEqual(kitVerdicts(full.sourceCorpus()));
  // Membership is the extraction's own Program file set, so it equals the typed partition's on every world.
  const facts = storedPartitions(fullPath).latest;
  for (const membership of cohort) {
    const typed = facts.find(({ program }) => program === membership.program);
    expect([membership.program, membership.roots, membership.available]).toEqual([membership.program, typed?.roots, typed?.available]);
  }
});

test("a repeated scoped acquisition reuses stored membership, and a changed unselected world re-extracts membership only", {
  tags: ["slow"],
  timeout: scaledBudget(240_000),
}, ({ scratch }) => {
  initialize(scratch);
  const databasePath = join(scratch, ".cache/scoped.sqlite");
  const scope = { files: [join(scratch, "packages/kit/src/base.ts")] };
  nativeInventoryFixture({ root: scratch, databasePath, scope })[Symbol.dispose]();
  const warm: string[] = [];
  nativeInventoryFixture({ root: scratch, databasePath, scope }, { workers: warm })[Symbol.dispose]();
  expect(warm).toEqual([]);
  write(scratch, "packages/ui/src/view.ts", "export const view=2;\n");
  const requests: InventoryBuildRequest[] = [];
  using changed = nativeInventoryFixture({ root: scratch, databasePath, scope }, { requests });
  expect(requests.map(({ descriptor, intent }) => [descriptor.id, intent])).toEqual([[UI_WORLD, "membership"]]);
  expect(changed.programs).not.toContain(UI_WORLD);
});

test("a scope outside every world refuses with no verdict", { tags: ["slow"], timeout: scaledBudget(120_000) }, ({ scratch }) => {
  initialize(scratch);
  expect(() =>
    nativeInventoryFixture({ root: scratch, databasePath: join(scratch, ".cache/scoped.sqlite"), scope: { files: [join(scratch, "absent.ts")] } }),
  ).toThrow(/contained by no eligible compiler world/u);
});
