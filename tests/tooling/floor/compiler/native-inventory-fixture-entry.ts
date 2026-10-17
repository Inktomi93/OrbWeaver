import childProcess from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import process from "node:process";
import { backup, DatabaseSync, StatementSync } from "node:sqlite";
import type {
  InventoryBuildRequest,
  InventoryOverlay,
  InventoryShapeQuery,
  InventoryWorkerRequest,
  SemanticInventoryOptions,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import type { NativeInventoryLifetime } from "./native-inventory-fixture.ts";
import type { NativeInventoryFault } from "./native-inventory-stage-fault.ts";

const requestPath = process.argv[2];
const resultPath = process.argv[3];
if (requestPath === undefined || resultPath === undefined) {
  throw new Error("native inventory fixture requires its request and result paths");
}
const request = JSON.parse(readFileSync(requestPath, "utf8")) as {
  readonly options: SemanticInventoryOptions;
  readonly failWorker?: boolean;
  readonly projection?: InventoryOverlay;
  readonly fault?: NativeInventoryFault;
  readonly observeCoverage?: boolean;
  readonly shapeQueries?: readonly InventoryShapeQuery[];
  readonly observeRequests?: boolean;
  readonly shapeSources?: readonly string[];
  readonly handoffFault?: "invalid-source-metadata" | "invalid-shape-generation";
};
const workers: string[] = [];
const faults: string[] = [];
const requests: string[] = [];
const published: number[] = [];
const failed = join(dirname(resultPath), "failed-worker.mjs");
writeFileSync(failed, "process.stderr.write('injected native worker exit');process.exitCode=7;\n");
const spawn = childProcess.spawnSync;
const { mutateNativeInventoryStage } = await import("./native-inventory-stage-fault.ts");
const { openInventoryDatabase, latestInventoryGeneration, readInventoryGeneration } = await import(
  "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts"
);
Object.defineProperty(childProcess, "spawnSync", {
  value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
    const index = args[1]?.findIndex((value) => value.endsWith("semantic-inventory-worker.ts")) ?? -1;
    const workerRequest = index < 0 ? undefined : args[1]?.[index + 1];
    if (workerRequest !== undefined) {
      const { controllerImplementation: _executingController, ...input } = JSON.parse(readFileSync(workerRequest, "utf8")) as InventoryWorkerRequest;
      workers.push(input.descriptor.id);
      if (request.observeRequests === true) {
        requests.push(JSON.stringify(input));
      }
    }
    const completed = spawn(
      args[0],
      args[1]?.map((value) => (request.failWorker === true && value.endsWith("semantic-inventory-worker.ts") ? failed : value)),
      args[2],
    );
    if (workerRequest !== undefined && completed.status === 0 && request.fault !== undefined) {
      const input = JSON.parse(readFileSync(workerRequest, "utf8")) as InventoryBuildRequest;
      using staging = openInventoryDatabase(input.destination);
      const partition = readInventoryGeneration(staging, latestInventoryGeneration(staging))[0];
      if (partition === undefined) {
        throw new Error("native fixture worker did not publish its staging partition");
      }
      using observer = new DatabaseSync(request.options.databasePath ?? join(request.options.root, ".cache/semantic-inventory.sqlite"), { readOnly: true });
      published.push(latestInventoryGeneration(observer));
      const alreadyMutated = (request.fault === "declaration-output-race" || request.fault === "member-world-race") && faults.length > 0;
      if (!alreadyMutated && mutateNativeInventoryStage(request.fault, input, staging, partition.id)) {
        faults.push(request.fault);
      }
    }
    return completed;
  },
});
syncBuiltinESMExports();
const { createSemanticInventory } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
const { SemanticInventoryError } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts");
let options = request.options;
if (request.shapeQueries !== undefined) {
  const queries = request.shapeQueries;
  if (request.projection !== undefined && (request.shapeSources?.length ?? 0) > 0) {
    throw new Error("native verdict fixture has no projected shape-source carrier contract");
  }
  const { getWorkspace } = await import("../../../../tooling/src/floor/compiler/ts-workspace.ts");
  const syntax = getWorkspace({ root: options.root, types: false, globs: request.shapeSources ?? [] });
  const sources = (request.shapeSources ?? []).map((path) => syntax.getSourceFileOrThrow(path));
  options = { ...options, shapePlan: { sources, prepare: (): readonly InventoryShapeQuery[] => queries } };
}
if (request.projection !== undefined) {
  const { inventoryFileSystem } = await import("../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts");
  const { Project } = await import("ts-morph");
  options = {
    ...options,
    fileSystem: inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), request.projection),
    overlay: {
      addedPaths: request.projection.files.filter(({ path }) => !existsSync(path)).map(({ path }) => relative(options.root, path).split(sep).join("/")),
      deletedPaths: request.projection.deleted.map((path) => relative(options.root, path).split(sep).join("/")),
    },
  };
}
const prepare = DatabaseSync.prototype.prepare;
const get = StatementSync.prototype.get;
const iterate = StatementSync.prototype.iterate;
let validating = false;
let enumerations = 0;
let declarationPreparations = 0;
let closureLookups = 0;
const closureKeys = new Set<string>();
let connection: DatabaseSync | undefined;
Object.defineProperty(DatabaseSync.prototype, "prepare", {
  value(this: DatabaseSync, ...args: Parameters<DatabaseSync["prepare"]>): ReturnType<DatabaseSync["prepare"]> {
    connection = this;
    if (validating && args[0].includes("d.kind='bindings'") && args[0].includes("d.role=?")) {
      declarationPreparations++;
    }
    return prepare.apply(this, args);
  },
});
if (request.observeCoverage === true) {
  Object.defineProperty(StatementSync.prototype, "get", {
    value(this: StatementSync, ...args: Parameters<StatementSync["get"]>): ReturnType<StatementSync["get"]> {
      if (validating && this.sourceSQL.includes("kind='available' AND value=?")) {
        closureLookups++;
        closureKeys.add(JSON.stringify(args));
      }
      return get.apply(this, args);
    },
  });
  Object.defineProperty(StatementSync.prototype, "iterate", {
    value(this: StatementSync, ...args: Parameters<StatementSync["iterate"]>): ReturnType<StatementSync["iterate"]> {
      if (validating && this.sourceSQL.includes("b.lexicalCount,b.originCount FROM inventory_global_binding")) {
        enumerations++;
      }
      return iterate.apply(this, args);
    },
  });
}
try {
  validating = request.observeCoverage === true;
  using inventory = createSemanticInventory(options);
  validating = false;
  let shapeCohort: { readonly generation: number; readonly partitions: readonly string[] } | undefined;
  if (options.shapePlan !== undefined) {
    const source = connection;
    if (source === undefined || !source.isTransaction || source.prepare("PRAGMA query_only").get()?.["query_only"] !== 1) {
      throw new Error("native shape fixture did not retain its published generation lease");
    }
    for (const query of request.shapeQueries ?? []) {
      inventory.shapePair(query);
    }
    const partitions = readInventoryGeneration(source, inventory.generation);
    if (JSON.stringify(partitions.map(({ program }) => program).toSorted()) !== JSON.stringify([...inventory.programs].toSorted())) {
      throw new Error("native shape fixture generation membership differs from its published reader");
    }
    shapeCohort = { generation: inventory.generation, partitions: partitions.map(({ id }) => id).toSorted() };
    if (request.handoffFault === "invalid-shape-generation") {
      shapeCohort = { ...shapeCohort, generation: inventory.generation + 1 };
    }
  }
  let databasePath = options.databasePath ?? join(options.root, ".cache/semantic-inventory.sqlite");
  let lifetime: NativeInventoryLifetime | undefined;
  if (request.projection !== undefined) {
    const source = connection;
    if (source === undefined || !source.isTransaction || source.prepare("PRAGMA query_only").get()?.["query_only"] !== 1) {
      throw new Error("native overlay fixture did not retain the exact pinned read connection");
    }
    const sourcePath = source.location();
    if (typeof sourcePath !== "string") {
      throw new Error("native overlay fixture source has no physical storage");
    }
    const transaction = source.isTransaction;
    const existed = existsSync(sourcePath);
    databasePath = join(dirname(resultPath), "overlay.sqlite");
    await backup(source, databasePath);
    inventory[Symbol.dispose]();
    lifetime = { transaction, queryOnly: 1, existed, closed: !source.isOpen, removed: !existsSync(sourcePath) };
    if (request.handoffFault === "invalid-source-metadata") {
      using malformed = new DatabaseSync(databasePath);
      malformed.exec("PRAGMA ignore_check_constraints=ON;UPDATE inventory_source SET authored=2;");
    }
  }
  writeFileSync(
    resultPath,
    JSON.stringify({
      generation: inventory.generation,
      databasePath,
      workers,
      faults,
      requests,
      published,
      lifetime,
      shapeCohort,
      ...(request.observeCoverage === true ? { coverage: { enumerations, declarationPreparations, closureLookups, closureKeys: closureKeys.size } } : {}),
    }),
  );
} catch (error) {
  if (!(error instanceof SemanticInventoryError)) {
    throw error;
  }
  writeFileSync(resultPath, JSON.stringify({ refusal: error.message, workers, faults, requests, published }));
} finally {
  Object.defineProperty(DatabaseSync.prototype, "prepare", { value: prepare });
  Object.defineProperty(StatementSync.prototype, "get", { value: get });
  Object.defineProperty(StatementSync.prototype, "iterate", { value: iterate });
  Object.defineProperty(childProcess, "spawnSync", { value: spawn });
}
