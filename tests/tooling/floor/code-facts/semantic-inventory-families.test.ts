import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { canonicalIdBrand, nativeIdBrand } from "@orb/tooling/floor/code-facts/id-brand";
import { DEFAULT_INVENTORY_FAMILIES, inventoryFamilies } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { openInventoryDatabase, publishInventoryGeneration, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { createSemanticWorkspace, nativeCompilerSourceFiles } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { LanguageService } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { readInventoryReferences } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { idBrandProofModule } from "../../../../tooling/src/verify/gates/_proof/id-brand.ts";
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

test("scalar-only extraction requests no reference pass while default inventory keeps its existing families", ({ scratch }) => {
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
    expect([casts.exports, casts.modules, casts.bindings, casts.witnesses, casts.references, casts.brands]).toEqual([[], [], [], [], [], []]);
    const brands = extractInventoryPartition({ ...request, families: ["id-brands"] });
    expect(passes).toBe(0);
    expect(brands.brands.map(({ brand }) => brand)).toEqual([null]);
    expect([brands.casts, brands.exports, brands.modules, brands.bindings, brands.witnesses, brands.references]).toEqual([[], [], [], [], [], []]);
    const runtime = extractInventoryPartition({ ...request, families: ["runtime-exports"] });
    expect(passes).toBe(0);
    expect(runtime.runtimeExports).toMatchObject([{ name: "value", callable: false, initializer: { callable: false } }]);
    expect([runtime.casts, runtime.brands, runtime.exports, runtime.modules, runtime.bindings, runtime.witnesses, runtime.references]).toEqual([
      [],
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
    expect([legacy.casts, legacy.brands, legacy.runtimeExports]).toEqual([[], [], []]);
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
  const builds: string[] = [];
  using casts = nativeInventoryFixture({ root: scratch, families: ["cast-relations"] }, { workers: builds });
  const file = casts.sourceCorpus().getSourceFile("source.ts");
  if (file === undefined) {
    throw new Error("missing source");
  }
  const node = file.getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
  expect(casts.castRelation(node, "tsconfig.json")).toMatchObject({ kind: "resolved", value: { leftToRight: false } });
  expect(() => casts.exports(file)).toThrow("family unavailable: exports");
  expect(() => casts.references(node)).toThrow("family unavailable: references");
  expect(() => casts.idBrand(node, "tsconfig.json")).toThrow("family unavailable: id-brands");
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partition = readInventoryGeneration(database, casts.generation)[0];
  if (partition === undefined || partition.workerPid === undefined) {
    throw new Error("missing worker identity");
  }
  const workerPid = partition.workerPid;
  expect(workerPid).not.toBe(process.pid);
  expect(() => process.kill(workerPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  expect(() => [...readInventoryReferences(database, partition.id)]).toThrow("family unavailable: references");
  using legacy = nativeInventoryFixture({ root: scratch }, { workers: builds });
  expect(legacy.exports(legacy.sourceCorpus().getSourceFile("source.ts") ?? file).has("value")).toBe(true);
  using reused = nativeInventoryFixture({ root: scratch, families: ["cast-relations"] }, { workers: builds });
  expect(builds).toEqual(["tsconfig.json", "tsconfig.json"]);
  expect(partition.families).toEqual(["cast-relations"]);
  expect(readInventoryGeneration(database, legacy.generation)[0]?.families).toEqual([...DEFAULT_INVENTORY_FAMILIES].toSorted());
  expect(readInventoryGeneration(database, reused.generation).map(({ id }) => id)).toEqual([partition.id]);
  expect(() => reused.castRelation(node, "foreign-world")).toThrow("partition is unavailable");
  file.replaceWithText("declare const original:string; export const value=original as number;");
  const changed = file.getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
  expect(() => casts.castRelation(changed, "tsconfig.json")).toThrow("source/epoch");
  reused[Symbol.dispose]();
  expect(() => reused.castRelation(changed, "tsconfig.json")).toThrow("disposed");
});

test("family demands and current-source invalidation remain explicit instead of reusing stale scalar facts", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  initialize(scratch);
  expect(() => inventoryFamilies([])).toThrow();
  expect(() => inventoryFamilies(["cast-relations", "cast-relations"])).toThrow();
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

test("an unavailable native primitive survives extraction and indexed storage without becoming false assignability", async ({ scratch }) => {
  initialize(scratch);
  const assignability = await import("@orb/tooling/floor/code-facts/assignability");
  const primitive = vi.spyOn(assignability, "readAssignabilityChecker").mockReturnValue(undefined);
  try {
    const descriptor = readCompilerPrograms(scratch)[0];
    if (descriptor === undefined) {
      throw new Error("missing scalar descriptor");
    }
    const partition = extractInventoryPartition({ root: scratch, descriptor, families: ["cast-relations"], destination: join(scratch, "unused.sqlite") });
    expect(partition.casts.map(({ result }) => result)).toEqual([{ kind: "unavailable", reason: "primitive-absent" }]);
    using staging = openInventoryDatabase(join(scratch, "scalar.sqlite"));
    const generation = publishInventoryGeneration(staging, [partition]);
    using inventory = inventoryReader(scratch, generation, readInventoryGeneration(staging, generation), { db: staging, dispose: () => undefined });
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

test("native brand scalar preserves the public checker reader over aliases, unions, plain and counterfeit types", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  initialize(scratch);
  write(
    scratch,
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true }, files: ["source.ts", "packages/kit/src/ids/index.ts"] }),
  );
  write(scratch, "packages/kit/src/ids/index.ts", idBrandProofModule('export type ChatId = TypeIdOf<"chat">;'));
  write(
    scratch,
    "source.ts",
    `
import type {Branded, ChatId} from './packages/kit/src/ids/index';
type Original=ChatId;
type Alias=Original;
type Plain=string;
declare const brand:unique symbol;
type Counterfeit=string & {readonly [brand]:"chat"};
type Nullable=Original|undefined;
type Union=Original|Branded<"other">;
type Generic<T extends string>=Branded<T>;
`,
  );
  const owner = createSemanticWorkspace({ root: scratch }).program("tsconfig.json");
  if (owner === undefined) {
    throw new Error("missing canonical native fixture owner");
  }
  const project = owner.project();
  const source = project.getSourceFileOrThrow(join(scratch, "source.ts"));
  const before = new Map(
    source.getTypeAliases().map((alias) => {
      const target = alias.getTypeNodeOrThrow();
      return [alias.getName(), canonicalIdBrand(target.getType(), target, project.getTypeChecker())];
    }),
  );
  const wrapped = nativeCompilerSourceFiles(project.getProgram().compilerObject);
  try {
    const admitted = wrapped.find((file) => file.getFilePath() === source.getFilePath());
    if (admitted === undefined) {
      throw new Error("missing admitted native wrapper");
    }
    const after = new Map(admitted.getTypeAliases().map((alias) => [alias.getName(), nativeIdBrand(alias.getTypeNodeOrThrow())]));
    expect(after).toEqual(before);
    expect(["Original", "Alias"].map((name) => after.get(name))).toEqual(['"chat"', '"chat"']);
    expect(["Plain", "Counterfeit", "Nullable"].map((name) => after.get(name))).toEqual([null, null, null]);
    using stored = nativeInventoryFixture({ root: scratch, families: ["id-brands"] });
    const carrier = stored.sourceCorpus().getSourceFile("source.ts");
    if (carrier === undefined) {
      throw new Error("missing stored brand source");
    }
    expect(new Map(carrier.getTypeAliases().map((alias) => [alias.getName(), stored.idBrand(alias.getTypeNodeOrThrow(), "tsconfig.json")]))).toEqual(before);
    expect(() => stored.idBrand(carrier.getTypeAliasOrThrow("Original").getNameNode(), "tsconfig.json")).toThrow("brand span is unavailable");
    expect(() => stored.castRelation(carrier.getTypeAliasOrThrow("Original"), "tsconfig.json")).toThrow("family unavailable: cast-relations");
    expect(() => stored.idBrand(carrier.getTypeAliasOrThrow("Plain").getTypeNodeOrThrow(), "foreign-world")).toThrow("partition is unavailable");
    carrier.replaceWithText("type Original=string;");
    const changed = carrier.getTypeAliasOrThrow("Original").getTypeNodeOrThrow();
    expect(() => stored.idBrand(changed, "tsconfig.json")).toThrow("source/epoch");
    stored[Symbol.dispose]();
    expect(() => stored.idBrand(changed, "tsconfig.json")).toThrow("disposed");
  } finally {
    for (const file of wrapped) {
      file.forget();
    }
  }
});
