import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import type { Profiler } from "node:inspector";
import { Session } from "node:inspector/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, ts } from "ts-morph";
import { vi } from "vitest";
import { parseFlags } from "../../../../tooling/src/ast/lib/emit.ts";
import { respellNearCandidatesFor } from "../../../../tooling/src/ast/lib/respell-near-analysis.ts";
import { assignabilityChecker, respellHitsFor, shapesUnder } from "../../../../tooling/src/ast/lib/respell-shapes.ts";
import { cmdRespell, prepareRespellInventory } from "../../../../tooling/src/ast/ops/respell.ts";
import { installOutputSink } from "../../../../tooling/src/floor/cli/log.ts";
import { declarationTypesAgree, fieldTypesAgree } from "../../../../tooling/src/floor/code-facts/assignability.ts";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import type { InventoryBuildRequest, InventoryShapeQuery, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { readShapeFields } from "../../../../tooling/src/floor/code-facts/shape-facts.ts";
import { bindShapeInventory } from "../../../../tooling/src/floor/code-facts/shape-inventory-scope.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

const LEFT = "packages/server/src/left.ts";
const RIGHT = "packages/contracts/src/right.ts";
const EXCLUDED = "tooling/src/excluded.ts";
function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function setup(root: string, repoRoot: string): readonly [InventoryShapeQuery, ...InventoryShapeQuery[]] {
  write(root, ".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const options = { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["es2022"], types: [], skipLibCheck: true };
  write(root, "packages/server/tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["src/left.ts", "../contracts/src/right.ts"] }));
  write(root, "packages/contracts/tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["src/right.ts"] }));
  write(root, "tooling/tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["src/excluded.ts"] }));
  write(root, LEFT, "type Alias<T>={readonly nested:readonly T[]}; export interface Left {a:Alias<string>;b?:{readonly value?:string};next?:Left}");
  write(root, RIGHT, "type Alias<T>={nested:T[]}; export type Right={a:Alias<string>;b:{value:string};next?:Right};");
  write(root, EXCLUDED, "export const excluded=1;");
  write(root, "tsconfig.added.json", JSON.stringify({ files: [] }));
  execFixtureGit(root, ["init", "-q"]);
  const project = new Project({ skipLoadingLibFiles: true, skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: true });
  const left = project.createSourceFile(join(root, LEFT), readFileSync(join(root, LEFT), "utf8")).getInterfaceOrThrow("Left");
  const right = project.createSourceFile(join(root, RIGHT), readFileSync(join(root, RIGHT), "utf8")).getTypeAliasOrThrow("Right");
  const span = (node: typeof left | typeof right): InventorySpan => ({
    file: node.getSourceFile().getFilePath(),
    start: node.getStart(),
    end: node.getEnd(),
    kind: node.getKind(),
  });
  const base = { left: span(left), right: span(right), leftField: "a", rightField: "a", projection: "mutual" as const };
  return [
    { ...base, lenient: false },
    { ...base, lenient: true },
    { ...base, leftField: "b", rightField: "b", lenient: false },
    { ...base, leftField: "b", rightField: "b", lenient: true },
    { ...base, leftField: "missing", rightField: "a", lenient: false },
    { ...base, leftField: "missing", rightField: "a", projection: "relation", lenient: false },
  ];
}

test("canonical membership avoids language-service synchronization and native checker reads", ({ scratch, repoRoot }) => {
  setup(scratch, repoRoot);
  const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "packages/server/tsconfig.json");
  if (descriptor === undefined) {
    throw new Error("missing descriptor");
  }
  const original = Project.prototype.getProgram;
  const observed = new Set<object>();
  const restores: (() => void)[] = [];
  const program = vi.spyOn(Project.prototype, "getProgram").mockImplementation(function (this: Project) {
    const result = original.call(this);
    const native = result.compilerObject;
    if (!observed.has(native)) {
      observed.add(native);
      const checker = vi.spyOn(native, "getTypeChecker").mockImplementation(() => {
        throw new Error("native checker forbidden in membership");
      });
      restores.push(() => checker.mockRestore());
    }
    return result;
  });
  const service = vi.spyOn(Project.prototype, "getLanguageService").mockImplementation(() => {
    throw new Error("language service forbidden in membership");
  });
  try {
    const partition = extractInventoryPartition({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite"), intent: "membership", families: [] });
    expect(partition.intent).toBe("membership");
    expect(partition.families).toEqual([]);
    expect(partition.available).toContain(join(scratch, RIGHT));
    expect(partition.nativeRoots).toContain(join(scratch, LEFT));
    expect([partition.exports, partition.shapes, partition.pairs, partition.references]).toEqual([[], [], [], []]);
    expect(observed.size).toBeGreaterThan(0);
    expect(service).not.toHaveBeenCalled();
    expect(() => extractInventoryPartition({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite"), families: ["shape-catalog"] })).toThrow(
      "language service forbidden",
    );
  } finally {
    service.mockRestore();
    program.mockRestore();
    for (const restore of restores) {
      restore();
    }
  }
});

test(
  "closed membership excludes unrelated typed workers, preserves strict/lenient/undefined and caches exact query coverage",
  ({ scratch, repoRoot }) => {
    const queries = setup(scratch, repoRoot);
    const builds: InventoryBuildRequest[] = [];
    const buildPartition = (request: InventoryBuildRequest): void => {
      builds.push(request);
      runInventoryPartitionWorker(request);
    };
    const options = { root: scratch, buildPartition, shapePlan: { sources: [], prepare: () => queries } };
    using inventory = createSemanticInventory(options);
    expect(queries.map((query) => inventory.shapePair(query).map(({ result }) => result))).toEqual([
      [{ kind: "answer", values: [false] }],
      [{ kind: "answer", values: [true] }],
      [{ kind: "answer", values: [false] }],
      [{ kind: "answer", values: [true] }],
      [{ kind: "answer", values: [false] }],
      [{ kind: "no-comparable" }],
    ]);
    expect(builds.filter(({ intent }) => intent !== "membership").map(({ descriptor: requested }) => requested.id)).toEqual(["packages/server/tsconfig.json"]);
    expect(inventory.shapePair({ ...queries[0], right: { ...queries[0].right, file: join(scratch, EXCLUDED) } })).toEqual([]);
    expect(() => inventory.shapePair({ ...queries[0], right: { ...queries[0].right, file: join(scratch, "absent.ts") } })).toThrow("source is unavailable");
    const count = builds.length;
    using reused = createSemanticInventory(options);
    expect(builds).toHaveLength(count);
    expect(reused.generation).toBe(inventory.generation);
    const first = inventory.sourceCorpus().getSourceFile(queries[0].left.file)?.getInterfaceOrThrow("Left");
    const second = reused.sourceCorpus().getSourceFile(queries[0].right.file)?.getTypeAliasOrThrow("Right");
    if (first === undefined || second === undefined) {
      throw new Error("missing mixed context sources");
    }
    expect(() =>
      declarationTypesAgree(
        {
          refuse: (kind): never => {
            throw new Error(kind);
          },
        },
        first,
        second,
      ),
    ).toThrow("contexts differ");
    const missing: InventoryShapeQuery = { ...queries[0], leftField: "next", rightField: "next", lenient: true };
    expect(() => inventory.shapePair(missing)).toThrow("coverage is unavailable");
    using extended = createSemanticInventory({ ...options, shapePlan: { sources: [], prepare: () => [...queries, missing] } });
    expect(builds).toHaveLength(count + 1);
    expect(extended.shapePair(missing)).toEqual([{ program: "packages/server/tsconfig.json", result: { kind: "answer", values: [true] } }]);
    inventory[Symbol.dispose]();
    expect(() => inventory.shapePair(queries[0])).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "excluded-world mutation and new descriptor races cannot publish a partial pair generation",
  ({ scratch, repoRoot }) => {
    const queries = setup(scratch, repoRoot);
    using previous = createSemanticInventory({ root: scratch, shapePlan: { sources: [], prepare: () => queries } });
    const extra: InventoryShapeQuery = { ...queries[0], leftField: "next", rightField: "next", lenient: true };
    const during = (request: InventoryBuildRequest): void => {
      runInventoryPartitionWorker(request);
      if ((request.shapeQueries?.length ?? 0) > 0) {
        write(scratch, EXCLUDED, `import '../../${LEFT}'; import '../../${RIGHT}';`);
      }
    };
    expect(() => createSemanticInventory({ root: scratch, shapePlan: { sources: [], prepare: () => [...queries, extra] }, buildPartition: during })).toThrow(
      "inputs changed",
    );
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(db)).toBe(previous.generation);
    using changed = createSemanticInventory({ root: scratch, shapePlan: { sources: [], prepare: () => queries } });
    expect(changed.shapePair(queries[0]).map(({ program }) => program)).toEqual(["packages/server/tsconfig.json", "tooling/tsconfig.json"]);
    expect(readInventoryGeneration(db, changed.generation).map(({ program }) => program)).toEqual([
      "packages/contracts/tsconfig.json",
      "packages/server/tsconfig.json",
      "tooling/tsconfig.json",
    ]);
    const addDescriptor = (request: InventoryBuildRequest): void => {
      runInventoryPartitionWorker(request);
      write(scratch, "tsconfig.added.json", JSON.stringify({ compilerOptions: { noLib: true, types: [] }, files: [LEFT, RIGHT] }));
    };
    expect(() =>
      createSemanticInventory({ root: scratch, shapePlan: { sources: [], prepare: () => [...queries, extra] }, buildPartition: addDescriptor }),
    ).toThrow("descriptor population changed");
    expect(latestInventoryGeneration(db)).toBe(changed.generation);
    const incomplete = (request: InventoryBuildRequest): void => {
      runInventoryPartitionWorker(request);
      if ((request.shapeQueries?.length ?? 0) > 0) {
        using staging = openInventoryDatabase(request.destination);
        staging.exec("DELETE FROM inventory_pair");
      }
    };
    expect(() =>
      createSemanticInventory({ root: scratch, shapePlan: { sources: [], prepare: () => [...queries, extra] }, buildPartition: incomplete }),
    ).toThrow("incomplete pair coverage");
    expect(latestInventoryGeneration(db)).toBe(changed.generation);
  },
  scaledBudget(60_000),
);

test(
  "AST exact and near share native mapped catalogs and closed renamed-field demand without a syntax checker",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const contract = "packages/contracts/src/chat/rows.ts";
    const domain = "packages/server/src/domain/chat/contract/rows.ts";
    const wire = "export interface Wire {a:string;b:number;c:boolean;d:string;e:number}; export type Mapped = {[K in keyof Wire]:Wire[K]};";
    const own =
      "import type {Wire} from '../../../../../contracts/src/chat/rows'; export type Derived=Wire; export interface Exact{a:string;b:number;c:boolean;d:string;e:number}; export interface Drift{a:string;b:number;c:boolean;d:string;renamed:number};";
    write(scratch, contract, wire);
    write(scratch, domain, own);
    const options = { strict: true, types: [], lib: ["es2022"], moduleResolution: "Bundler", module: "ESNext" };
    write(scratch, "packages/contracts/tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["src/chat/rows.ts"] }));
    write(scratch, "packages/server/tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["src/domain/chat/contract/rows.ts"] }));
    const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
    const contracts = project.createSourceFile(join(scratch, contract), wire);
    const server = project.createSourceFile(join(scratch, domain), own);
    const sources = [contracts, server];
    const checker = vi.spyOn(project, "getTypeChecker").mockImplementation(() => {
      throw new Error("syntax checker forbidden");
    });
    using inventory = prepareRespellInventory(scratch, project, "chat", parseFlags(["--near", "60"]));
    if (inventory === undefined) {
      throw new Error("missing requested native shape witness");
    }
    using _scope = bindShapeInventory(sources, inventory);
    expect(readShapeFields(contracts.getTypeAliasOrThrow("Mapped"), "respell")?.map(({ name }) => name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(respellHitsFor(project, undefined, "chat").map(({ text }) => text)).toEqual([
      "Derived  ≡  @orb/contracts/chat::Mapped",
      "Exact  ≡  @orb/contracts/chat::Wire",
      "Exact  ≡  @orb/contracts/chat::Mapped",
    ]);
    expect(
      respellNearCandidatesFor(project, undefined, "chat", 60).map(({ domainName, contractsName, diff }) => ({
        domainName,
        contractsName,
        renamed: diff.renamed,
      })),
    ).toEqual([
      { domainName: "Drift", contractsName: "Wire", renamed: [{ from: "renamed", to: "e", type: "number" }] },
      { domainName: "Drift", contractsName: "Mapped", renamed: [{ from: "renamed", to: "e", type: "number" }] },
    ]);
    expect(() => cmdRespell(project, "chat", parseFlags(["--near", "60"]))).not.toThrow();
    expect(checker).not.toHaveBeenCalled();
    server.insertText(0, "// changed\n");
    expect(() => respellHitsFor(project, undefined, "chat")).toThrow("source/epoch");
    inventory[Symbol.dispose]();
    expect(() => readShapeFields(server.getInterfaceOrThrow("Exact"), "copy")).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "scalar-only owners retain their closed demand beside a complete pair membership cohort",
  ({ scratch, repoRoot }) => {
    const queries = setup(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tooling/tsconfig.json");
    if (descriptor === undefined) {
      throw new Error("missing scalar descriptor");
    }
    const requests: InventoryBuildRequest[] = [];
    using inventory = createSemanticInventory({
      root: scratch,
      programs: [descriptor],
      families: ["runtime-exports"],
      shapePlan: { sources: [], prepare: () => queries },
      buildPartition: (request) => {
        requests.push(request);
        runInventoryPartitionWorker(request);
      },
    });
    const source = inventory.sourceCorpus().getSourceFile(join(scratch, EXCLUDED));
    if (source === undefined) {
      throw new Error("missing scalar source");
    }
    expect(inventory.runtimeExports(source, descriptor.id).map(({ name }) => name)).toEqual(["excluded"]);
    expect(requests.filter(({ families }) => families?.includes("runtime-exports") === true).map(({ descriptor: requested }) => requested.id)).toEqual([
      descriptor.id,
    ]);
    expect(requests.filter(({ families }) => families?.includes("shape-pairs") === true).map(({ descriptor: requested }) => requested.id)).toEqual([
      "packages/server/tsconfig.json",
    ]);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    for (const partition of readInventoryGeneration(db, inventory.generation)) {
      if (partition.workerPid === undefined) {
        throw new Error("missing worker identity");
      }
      expect(partition.workerPid).not.toBe(process.pid);
      expect(() => process.kill(partition.workerPid ?? process.pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
    }
    using scalar = createSemanticInventory({ root: scratch, programs: [descriptor], families: ["runtime-exports"] });
    expect(() => scalar.shapePair(queries[0])).toThrow("membership cohort is unavailable");
  },
  scaledBudget(60_000),
);

test(
  "membership construction has no implicit native checker creation, with a real checker positive control",
  async ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch)[0];
    if (descriptor === undefined) {
      throw new Error("missing descriptor");
    }
    const profiler = new Session();
    profiler.connect();
    const calls = (coverage: Profiler.TakePreciseCoverageReturnType): number[] =>
      coverage.result
        .filter(({ url }) => url.endsWith(ts.sys.getExecutingFilePath()))
        .flatMap(({ functions }) => functions)
        .filter(({ functionName }) => functionName === "createTypeChecker")
        .map(({ ranges }) => ranges[0]?.count ?? 0);
    try {
      await profiler.post("Profiler.enable");
      await profiler.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
      extractInventoryPartition({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite"), intent: "membership", families: [] });
      const membership = await profiler.post("Profiler.takePreciseCoverage");
      expect(calls(membership).reduce((sum, count) => sum + count, 0)).toBe(0);
      const positive = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
      positive.createSourceFile("/positive.ts", "export const positive=1;");
      expect(positive.getTypeChecker().compilerObject.getSymbolAtLocation).toBeTypeOf("function");
      expect(calls(await profiler.post("Profiler.takePreciseCoverage")).some((count) => count > 0)).toBe(true);
    } finally {
      await profiler.post("Profiler.stopPreciseCoverage");
      await profiler.post("Profiler.disable");
      profiler.disconnect();
    }
  },
  scaledBudget(10_000),
);

test("programmatic respell never acquires repository inventory and explicit foreign demand refuses before workers", async ({ scratch, repoRoot }) => {
  setup(scratch, repoRoot);
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/isolated/packages/contracts/src/chat/rows.ts", "export interface Wire {a:string;b:number;c:boolean;d:string}");
  const source = project.createSourceFile(
    "/isolated/packages/server/src/domain/chat/contract/rows.ts",
    "export interface Copy {a:string;b:number;c:boolean;d:string}",
  );
  const request = vi.fn();
  expect(() => createSemanticInventory({ root: scratch, shapePlan: { sources: [source], prepare: () => [] }, buildPartition: request })).toThrow(
    "outside its explicit repository",
  );
  expect(request).not.toHaveBeenCalled();
  const inventoryModule = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const acquire = vi.spyOn(inventoryModule, "createSemanticInventory").mockImplementation(() => {
    throw new Error("repository acquisition forbidden");
  });
  try {
    expect(() => cmdRespell(project, "chat", parseFlags([]))).not.toThrow();
    expect(acquire).not.toHaveBeenCalled();
  } finally {
    acquire.mockRestore();
  }
});

test(
  "stored shape consumers refuse missing native primitives and no-shared worlds without a false answer",
  async ({ scratch, repoRoot }) => {
    const queries = setup(scratch, repoRoot);
    const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
    const sources = [LEFT, RIGHT, EXCLUDED].map((path) => project.createSourceFile(join(scratch, path), readFileSync(join(scratch, path), "utf8")));
    const assignability = await import("../../../../tooling/src/floor/code-facts/assignability.ts");
    const primitive = vi.spyOn(assignability, "readAssignabilityChecker").mockReturnValue(undefined);
    try {
      const descriptors = readCompilerPrograms(scratch);
      const server = descriptors.find(({ id }) => id === "packages/server/tsconfig.json");
      const tooling = descriptors.find(({ id }) => id === "tooling/tsconfig.json");
      if (server === undefined || tooling === undefined) {
        throw new Error("missing refusal worlds");
      }
      const demands: ReadonlyMap<string, Pick<InventoryBuildRequest, "families" | "shapeQueries" | "intent">> = new Map([
        [server.id, { families: ["exports", "shape-catalog", "shape-pairs"], shapeQueries: queries }],
        [tooling.id, { families: ["exports", "shape-catalog"] }],
      ]);
      const partitions = descriptors.map((descriptor) =>
        extractInventoryPartition({
          root: scratch,
          descriptor,
          destination: join(scratch, "unused.sqlite"),
          ...(demands.get(descriptor.id) ?? { intent: "membership", families: [] }),
        }),
      );
      {
        using seed = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
        publishInventoryGeneration(seed, partitions);
      }
      const acquire = vi.fn(() => {
        throw new Error("covered native refusal fixture must not reacquire Programs");
      });
      const owners = new Map(sources.map((source) => [source, source.getFilePath() === join(scratch, EXCLUDED) ? tooling : server]));
      using inventory = createSemanticInventory({ root: scratch, shapePlan: { sources, owners, prepare: () => queries }, buildPartition: acquire });
      using _scope = bindShapeInventory(sources, inventory);
      expect(acquire).not.toHaveBeenCalled();
      expect(inventory.shapePair(queries[0])).toEqual([
        { program: "packages/server/tsconfig.json", result: { kind: "unavailable", reason: "primitive-absent" } },
      ]);
      const left = project.getSourceFileOrThrow(join(scratch, LEFT)).getInterfaceOrThrow("Left");
      const right = project.getSourceFileOrThrow(join(scratch, RIGHT)).getTypeAliasOrThrow("Right");
      const excluded = project.getSourceFileOrThrow(join(scratch, EXCLUDED)).getVariableDeclarationOrThrow("excluded");
      const context = {
        refuse: (kind: string): never => {
          throw new Error(`refused: ${kind}`);
        },
      };
      expect(() => fieldTypesAgree(context, { decl: left, name: "a" }, { decl: right, name: "a" })).toThrow("refused: primitive-absent");
      expect(() => fieldTypesAgree(context, { decl: left, name: "a" }, { decl: excluded, name: "a" })).toThrow("refused: no-shared-program");
    } finally {
      primitive.mockRestore();
    }
  },
  scaledBudget(10_000),
);

test(
  "native exported binding origins preserve object and non-object catalogs through AST exact and near",
  ({ scratch }) => {
    const contract = "packages/contracts/src/chat/rows.ts";
    const domain = "packages/server/src/domain/chat/contract/rows.ts";
    write(scratch, ".gitignore", ".cache\n");
    write(scratch, "tsconfig.json", JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true }, files: [contract, domain] }));
    write(
      scratch,
      contract,
      'export const ordinary={a:"a",b:1,c:true,d:"d",e:0}; export const {destructured,scalar}={destructured:{a:"a",b:1,c:true,d:"d",e:0},scalar:1};',
    );
    write(scratch, domain, 'export const {exact,near,scalar}={exact:{a:"a",b:1,c:true,d:"d",e:0},near:{a:"a",b:1,c:true,d:"d",renamed:0},scalar:1};');
    execFixtureGit(scratch, ["init", "-q"]);
    const owner = createSemanticWorkspace({ root: scratch }).program("tsconfig.json");
    if (owner === undefined) {
      throw new Error("missing bounded native owner");
    }
    const project = owner.project();
    const sources = [project.getSourceFileOrThrow(join(scratch, contract)), project.getSourceFileOrThrow(join(scratch, domain))];
    const catalog = (): Pick<ReturnType<typeof shapesUnder>[number], "name" | "fields">[] =>
      shapesUnder(project, "/packages/contracts/src/chat/").map(({ name, fields }) => ({ name, fields }));
    const nativeCatalog = catalog();
    expect(nativeCatalog.map(({ name }) => name)).toEqual(["ordinary", "destructured"]);
    const checker = assignabilityChecker(project);
    const nativeExact = respellHitsFor(project, checker, "chat").map(({ text }) => text);
    const nativeNear = respellNearCandidatesFor(project, checker, "chat", 60).map(({ domainName, contractsName, diff }) => ({
      domainName,
      contractsName,
      diff,
    }));
    expect(nativeExact).toHaveLength(2);
    expect(nativeNear).toHaveLength(2);
    {
      using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
      const partition = extractInventoryPartition({
        root: scratch,
        descriptor: owner.descriptor,
        destination: join(scratch, "unused.sqlite"),
        families: ["exports", "shape-catalog"],
      });
      const generation = publishInventoryGeneration(db, [partition]);
      using stored = inventoryReader(scratch, generation, readInventoryGeneration(db, generation), {
        db,
        shapeOwners: new Map(sources.map((source) => [source, owner.descriptor.id])),
        dispose: () => undefined,
      });
      using _binding = bindShapeInventory(sources, stored);
      expect(catalog()).toEqual(nativeCatalog);
      for (const source of sources) {
        const scalar = source.getExportedDeclarations().get("scalar")?.[0];
        if (scalar === undefined) {
          throw new Error("missing non-object native binding origin");
        }
        expect(stored.shape(scalar)).toMatchObject({ copy: null, respell: null });
      }
    }
    using inventory = prepareRespellInventory(scratch, project, "chat", parseFlags(["--near", "60"]));
    if (inventory === undefined) {
      throw new Error("missing closed native AST witness");
    }
    using _binding = bindShapeInventory(sources, inventory);
    expect(respellHitsFor(project, undefined, "chat").map(({ text }) => text)).toEqual(nativeExact);
    expect(
      respellNearCandidatesFor(project, undefined, "chat", 60).map(({ domainName, contractsName, diff }) => ({ domainName, contractsName, diff })),
    ).toEqual(nativeNear);
    const lines: string[] = [];
    const release = installOutputSink({ line: (line) => lines.push(line), warn: () => undefined });
    try {
      cmdRespell(project, "chat", parseFlags(["--near", "60", "--json"]));
    } finally {
      release();
    }
    expect(lines.map((line) => JSON.parse(line))).toMatchObject([
      { label: "respell chat", total: 2, hits: nativeExact.map((text) => ({ text })) },
      { label: "respell --near>=60 chat", total: 2 },
    ]);
  },
  scaledBudget(10_000),
);
