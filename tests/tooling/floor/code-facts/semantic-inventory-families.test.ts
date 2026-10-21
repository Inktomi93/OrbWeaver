import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { DEFAULT_INVENTORY_FAMILIES, inventoryFamilies } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { LanguageService } from "ts-morph";
import { Project } from "ts-morph";
import { vi } from "vitest";
import { readInventoryReferences } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";

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

test("scalar-only extraction requests no reference pass while default inventory closes its existing reference family", ({ scratch }) => {
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
    const outputs = extractInventoryPartition({ ...request, families: ["declaration-outputs"] });
    expect(passes).toBe(0);
    expect(outputs.declarationOutputs.map(({ unknown }) => unknown)).toEqual([null, false]);
    expect([outputs.exports, outputs.modules, outputs.bindings, outputs.witnesses, outputs.references]).toEqual([[], [], [], [], []]);
    const runtime = extractInventoryPartition({ ...request, families: ["runtime-exports"] });
    expect(passes).toBe(0);
    expect(runtime.runtimeExports).toMatchObject([{ name: "value", callable: false, initializer: { callable: false } }]);
    expect([runtime.declarationOutputs, runtime.exports, runtime.modules, runtime.bindings, runtime.witnesses, runtime.references]).toEqual([
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const legacy = extractInventoryPartition(request);
    expect(passes).toBe(1);
    expect(legacy.families).toEqual([...DEFAULT_INVENTORY_FAMILIES].toSorted());
    expect([legacy.declarationOutputs, legacy.runtimeExports]).toEqual([[], []]);
    expect(legacy.exports.length).toBeGreaterThan(0);
    expect(legacy.referenceMode).toBe("closed");
    expect(legacy.references).toEqual([]);
    const complete = extractInventoryPartition({ ...request, referenceDemand: { mode: "complete", queries: [] } });
    expect(passes).toBe(2);
    expect(complete.referenceMode).toBe("complete");
    expect(complete.references.length).toBeGreaterThan(0);
  } finally {
    for (const cleanup of restore) {
      cleanup();
    }
    observation.mockRestore();
  }
});

test("closed family presence refuses absent queries and reuses compatible exited-worker partitions without mixed generations", ({ scratch }) => {
  initialize(scratch);
  const builds: string[] = [];
  using scalars = nativeInventoryFixture({ root: scratch, families: ["declaration-outputs"] }, { workers: builds });
  const file = scalars.sourceCorpus().getSourceFile("source.ts");
  if (file === undefined) {
    throw new Error("missing source");
  }
  const node = file.getVariableDeclarationOrThrow("value");
  expect(scalars.declarationOutput(node, "tsconfig.json")).toBe(false);
  expect(() => scalars.exports(file)).toThrow("family unavailable: exports");
  expect(() => scalars.references(node)).toThrow("family unavailable: references");
  expect(() => scalars.runtimeExports(file, "tsconfig.json")).toThrow("family unavailable: runtime-exports");
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partition = readInventoryGeneration(database, scalars.generation)[0];
  if (partition === undefined || partition.workerPid === undefined) {
    throw new Error("missing worker identity");
  }
  const workerPid = partition.workerPid;
  expect(workerPid).not.toBe(process.pid);
  expect(() => process.kill(workerPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  expect(() => [...readInventoryReferences(database, partition.id)]).toThrow("family unavailable: references");
  using legacy = nativeInventoryFixture({ root: scratch }, { workers: builds });
  expect(legacy.exports(legacy.sourceCorpus().getSourceFile("source.ts") ?? file).has("value")).toBe(true);
  using reused = nativeInventoryFixture({ root: scratch, families: ["declaration-outputs"] }, { workers: builds });
  expect(builds).toEqual(["tsconfig.json", "tsconfig.json"]);
  expect(partition.families).toEqual(["declaration-outputs"]);
  expect(readInventoryGeneration(database, legacy.generation)[0]?.families).toEqual([...DEFAULT_INVENTORY_FAMILIES].toSorted());
  expect(readInventoryGeneration(database, reused.generation).map(({ id }) => id)).toEqual([partition.id]);
  expect(() => reused.declarationOutput(node, "foreign-world")).toThrow("partition is unavailable");
  file.replaceWithText("declare const original:string; export const value=original as number;");
  const changed = file.getVariableDeclarationOrThrow("value");
  expect(() => scalars.declarationOutput(changed, "tsconfig.json")).toThrow("source/epoch");
  reused[Symbol.dispose]();
  expect(() => reused.declarationOutput(changed, "tsconfig.json")).toThrow("disposed");
});

test("family demands and current-source invalidation remain explicit instead of reusing stale scalar facts", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  initialize(scratch);
  expect(() => inventoryFamilies([])).toThrow();
  expect(() => inventoryFamilies(["declaration-outputs", "declaration-outputs"])).toThrow();
  expect(() => inventoryFamilies(["id-brands"])).toThrow();
  expect(() => inventoryFamilies(["missing"])).toThrow();
  const entry = fileURLToPath(new URL("../compiler/native-family-cases.ts", import.meta.url));
  const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
  const result = join(scratch, "drift-result.json");
  const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "scalar-drift", scratch, result]);
  expect(completed.status, completed.stderr).toBe(0);
  expect(JSON.parse(readFileSync(result, "utf8"))).toMatchObject({
    refusal: expect.stringContaining("inputs changed during extraction"),
    interventions: 1,
    latestUnchanged: true,
    pinnedText: expect.stringContaining("number|string"),
  });
});
