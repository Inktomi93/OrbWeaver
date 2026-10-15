import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createSemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory";
import type { InventoryBuildRequest } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { DEFAULT_INVENTORY_FAMILIES, inventoryFamilies } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { LanguageService } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { readInventoryReferences } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function initialize(root: string): void {
  write(root, ".gitignore", ".cache/\n");
  write(root, "tsconfig.json", JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true }, files: ["source.ts"] }));
  write(root, "source.ts", "declare const original:number|string; export const value=original as number;");
  execFixtureGit(root, ["init", "-q"]);
}

test("cast-only extraction requests no reference pass while default inventory keeps its existing families", ({ scratch }) => {
  initialize(scratch);
  const descriptor = readCompilerPrograms(scratch)[0];
  if (descriptor === undefined) {
    throw new Error("missing descriptor");
  }
  const request = { root: scratch, descriptor, destination: join(scratch, "unused.sqlite") };
  let passes = 0;
  const restore: (() => void)[] = [];
  const observed = new Set<LanguageService>();
  const original = Project.prototype.getLanguageService;
  const observation = vi.spyOn(Project.prototype, "getLanguageService").mockImplementation(function (this: Project) {
    const service = original.call(this);
    if (!observed.has(service)) {
      observed.add(service);
      const create = service.compilerObject.createReadonlyReferencePass.bind(service.compilerObject);
      const spy = vi.spyOn(service.compilerObject, "createReadonlyReferencePass").mockImplementation(() => {
        passes += 1;
        return create();
      });
      restore.push(() => spy.mockRestore());
    }
    return service;
  });
  try {
    const casts = extractInventoryPartition({ ...request, families: ["cast-relations"] });
    expect(passes).toBe(0);
    expect(casts.families).toEqual(["cast-relations"]);
    expect(casts.casts.map(({ result }) => result)).toEqual([
      { kind: "resolved", value: { leftToRight: false, rightToLeft: true, leftIsAny: false, rightIsAny: false } },
    ]);
    expect([casts.exports, casts.modules, casts.bindings, casts.witnesses, casts.references]).toEqual([[], [], [], [], []]);
    const legacy = extractInventoryPartition(request);
    expect(passes).toBe(1);
    expect(legacy.families).toEqual([...DEFAULT_INVENTORY_FAMILIES].toSorted());
    expect(legacy.casts).toEqual([]);
    expect(legacy.exports.length).toBeGreaterThan(0);
    expect(legacy.references.length).toBeGreaterThan(0);
  } finally {
    for (const cleanup of restore) {
      cleanup();
    }
    observation.mockRestore();
  }
});

test("closed family presence refuses absent queries and reuses compatible exited-worker partitions without mixed generations", ({ scratch }) => {
  initialize(scratch);
  const builds: string[][] = [];
  const buildPartition = (request: InventoryBuildRequest): void => {
    builds.push([...inventoryFamilies(request.families)]);
    runInventoryPartitionWorker(request);
  };
  using casts = createSemanticInventory({ root: scratch, families: ["cast-relations"], buildPartition });
  const file = casts.sourceCorpus().getSourceFile("source.ts");
  if (file === undefined) {
    throw new Error("missing source");
  }
  const node = file.getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
  expect(casts.castRelation(node, "tsconfig.json")).toMatchObject({ kind: "resolved", value: { leftToRight: false } });
  expect(() => casts.exports(file)).toThrow("family unavailable: exports");
  expect(() => casts.references(node)).toThrow("family unavailable: references");
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partition = readInventoryGeneration(database, casts.generation)[0];
  if (partition === undefined || partition.workerPid === undefined) {
    throw new Error("missing worker identity");
  }
  const workerPid = partition.workerPid;
  expect(workerPid).not.toBe(process.pid);
  expect(() => process.kill(workerPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  expect(() => [...readInventoryReferences(database, partition.id)]).toThrow("family unavailable: references");
  using legacy = createSemanticInventory({ root: scratch, buildPartition });
  expect(legacy.exports(legacy.sourceCorpus().getSourceFile("source.ts") ?? file).has("value")).toBe(true);
  using reused = createSemanticInventory({ root: scratch, families: ["cast-relations"], buildPartition });
  expect(builds).toEqual([["cast-relations"], [...DEFAULT_INVENTORY_FAMILIES].toSorted()]);
  expect(readInventoryGeneration(database, reused.generation).map(({ id }) => id)).toEqual([partition.id]);
  expect(() => reused.castRelation(node, "foreign-world")).toThrow("partition is unavailable");
  file.replaceWithText("declare const original:string; export const value=original as number;");
  const changed = file.getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
  expect(() => casts.castRelation(changed, "tsconfig.json")).toThrow("source/epoch");
  reused[Symbol.dispose]();
  expect(() => reused.castRelation(changed, "tsconfig.json")).toThrow("disposed");
});

test("family demands and current-source invalidation remain explicit instead of reusing stale scalar facts", ({ scratch }) => {
  initialize(scratch);
  expect(() => inventoryFamilies([])).toThrow();
  expect(() => inventoryFamilies(["cast-relations", "cast-relations"])).toThrow();
  expect(() => inventoryFamilies(["missing"])).toThrow();
  using previous = createSemanticInventory({ root: scratch, families: ["cast-relations"] });
  write(scratch, "source.ts", "declare const original:string; export const value=original as number;");
  const during = (request: InventoryBuildRequest): void => {
    runInventoryPartitionWorker(request);
    write(scratch, "source.ts", "export const changed=1;");
  };
  expect(() => createSemanticInventory({ root: scratch, families: ["cast-relations"], buildPartition: during })).toThrow("inputs changed during extraction");
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(database)).toBe(previous.generation);
  expect(previous.sourceCorpus().getSourceFile("source.ts")?.getFullText()).toContain("number|string");
});

test("an unavailable native primitive survives extraction and indexed storage without becoming false assignability", async ({ scratch }) => {
  initialize(scratch);
  const assignability = await import("../../../../tooling/src/floor/code-facts/assignability.ts");
  const primitive = vi.spyOn(assignability, "readAssignabilityChecker").mockReturnValue(undefined);
  try {
    using inventory = createSemanticInventory({
      root: scratch,
      families: ["cast-relations"],
      buildPartition: (request) => {
        const partition = extractInventoryPartition(request);
        expect(partition.casts.map(({ result }) => result)).toEqual([{ kind: "unavailable", reason: "primitive-absent" }]);
        using staging = openInventoryDatabase(request.destination);
        publishInventoryGeneration(staging, [partition]);
      },
    });
    const source = inventory.sourceCorpus().getSourceFile("source.ts");
    if (source === undefined) {
      throw new Error("missing captured source");
    }
    expect(inventory.castRelation(source.getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression), "tsconfig.json")).toEqual({
      kind: "unavailable",
      reason: "primitive-absent",
    });
  } finally {
    primitive.mockRestore();
  }
});
