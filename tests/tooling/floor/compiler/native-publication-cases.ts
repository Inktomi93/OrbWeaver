import childProcess from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type {
  InventoryBuildRequest,
  SemanticInventoryOptions,
  StoredInventoryPartition,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

export const NATIVE_PUBLICATION_CASES = [
  "independent-worlds",
  "wrong-worker",
  "reused-world-drift",
  "malformed-stage",
  "mixed-stage",
  "post-pin",
  "post-metadata",
  "post-inputs",
  "member-duplicate",
  "member-swapped",
  "concurrent-publisher",
  "shape-writer",
  "lazy-reference-metadata",
] as const;

async function run(mode: string, implementation: string, root: string): Promise<object> {
  const moduleURL = (relative: string): string => pathToFileURL(join(implementation, "tooling/src/floor", relative)).href;
  const path = join(root, ".cache/semantic-inventory.sqlite");
  const a = join(root, "a.ts");
  const b = join(root, "b.ts");
  const workerStarts: string[] = [];
  let active = false;
  let injections = 0;
  const mutateStage = (request: InventoryBuildRequest): void => {
    if (mode === "reused-world-drift") {
      writeFileSync(a, "export const changedA=4;\n");
      injections++;
    }
    if (mode === "malformed-stage" || mode === "mixed-stage") {
      using staging = new DatabaseSync(request.destination);
      if (mode === "malformed-stage") {
        staging.exec("PRAGMA ignore_check_constraints=ON;UPDATE inventory_source SET authored=2;");
      } else {
        staging.prepare("UPDATE inventory_source SET file=?").run(JSON.stringify(a));
      }
      injections++;
    }
  };
  const spawn = childProcess.spawnSync;
  Object.defineProperty(childProcess, "spawnSync", {
    value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
      const worker = args[1]?.findIndex((value) => value.endsWith("semantic-inventory-worker.ts")) ?? -1;
      const requestPath = worker < 0 ? undefined : args[1]?.[worker + 1];
      if (requestPath === undefined) {
        return spawn(...args);
      }
      const request = JSON.parse(readFileSync(requestPath, "utf8")) as InventoryBuildRequest;
      workerStarts.push(request.descriptor.id);
      if (active && mode === "wrong-worker") {
        writeFileSync(requestPath, JSON.stringify({ ...request, descriptor: { ...request.descriptor, id: "wrong" } }));
        injections++;
      }
      const result = spawn(...args);
      if (active && result.status === 0) {
        mutateStage(request);
      }
      return result;
    },
  });
  syncBuiltinESMExports();
  const { createSemanticInventory } = (await import(
    moduleURL("code-facts/semantic-inventory.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const {
    openInventoryDatabase,
    latestInventoryGeneration,
    readInventoryGeneration,
    beginInventoryWrite,
    importInventoryPartition,
    publishInventoryGeneration,
  } = (await import(
    moduleURL("code-facts/semantic-inventory-database.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
  const { readCompilerPrograms } = (await import(
    moduleURL("compiler/compiler-programs.ts")
  )) as typeof import("../../../../tooling/src/floor/compiler/compiler-programs.ts");
  const { runInventoryPartitionWorker } = (await import(
    moduleURL("compiler/semantic-inventory-worker-run.ts")
  )) as typeof import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const { ownedInventoryReader } = (await import(
    moduleURL("code-facts/semantic-inventory-reader.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts");
  const { acquireInventoryReadLease } = (await import(
    moduleURL("code-facts/semantic-inventory-queries.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts");
  const options: SemanticInventoryOptions = { root, families: ["exports"] };
  const connections = new Set<DatabaseSync>();
  let published = false;
  let pinned = false;
  let accepted: readonly StoredInventoryPartition[] = [];
  const execute = DatabaseSync.prototype.exec;
  const prepare = DatabaseSync.prototype.prepare;
  const corruptMembership = (db: DatabaseSync): void => {
    accepted = readInventoryGeneration(db, 1);
    const [first, second] = accepted;
    if (first === undefined || second === undefined) {
      throw new Error("native handoff control requires two accepted worlds");
    }
    injections++;
    using writer = openInventoryDatabase(path);
    beginInventoryWrite(writer);
    writer.prepare("UPDATE inventory_member SET partition=? WHERE generation=1 AND partition=?").run(first.id, second.id);
    if (mode === "member-swapped") {
      writer.prepare("UPDATE inventory_member SET partition=? WHERE generation=1 AND program=?").run(second.id, JSON.stringify(first.program));
    }
    writer.exec("COMMIT");
  };
  const concurrentPublication = (): void => {
    injections++;
    using writer = openInventoryDatabase(path);
    beginInventoryWrite(writer);
    const members = readCompilerPrograms(root).map((descriptor) => {
      const destination = join(root, `.cache/membership-${descriptor.id}.sqlite`);
      runInventoryPartitionWorker({ root, descriptor, destination, intent: "membership", families: [] });
      using staging = openInventoryDatabase(destination);
      const partition = readInventoryGeneration(staging, latestInventoryGeneration(staging))[0];
      if (partition === undefined) {
        throw new Error("native racing membership partition missing");
      }
      importInventoryPartition(writer, destination, partition.id);
      return partition;
    });
    publishInventoryGeneration(writer, members);
    writer.exec("COMMIT");
  };
  const afterPublication = (db: DatabaseSync): void => {
    published = true;
    if (mode === "post-inputs") {
      injections++;
      writeFileSync(a, "export const gapMutation=3;\n");
    }
    if (mode === "member-duplicate" || mode === "member-swapped") {
      corruptMembership(db);
    }
    if (mode === "concurrent-publisher") {
      concurrentPublication();
    }
  };
  Object.defineProperty(DatabaseSync.prototype, "exec", {
    value(this: DatabaseSync, sql: string): void {
      if (!(active && this.location() === path)) {
        execute.call(this, sql);
        return;
      }
      if (injections === 0) {
        connections.add(this);
      }
      if (published && sql === "BEGIN" && mode === "post-pin") {
        injections++;
        throw new Error("injected read pin failure");
      }
      execute.call(this, sql);
      if (published && sql === "BEGIN") {
        pinned = true;
      }
      if (sql !== "COMMIT" || published || this.prepare("SELECT id FROM inventory_generation LIMIT 1").get() === undefined) {
        return;
      }
      afterPublication(this);
    },
  });
  Object.defineProperty(DatabaseSync.prototype, "prepare", {
    value(this: DatabaseSync, ...args: Parameters<DatabaseSync["prepare"]>): ReturnType<DatabaseSync["prepare"]> {
      if (active && this.location() === path && pinned && mode === "post-metadata" && args[0].includes("SELECT ordinal,file,path,consumerClass")) {
        injections++;
        throw new Error("injected pinned metadata failure");
      }
      return prepare.apply(this, args);
    },
  });
  const restoreMembership = (observer: DatabaseSync): object => {
    if (!(mode === "member-duplicate" || mode === "member-swapped")) {
      return {};
    }
    let membershipError: string | null = null;
    try {
      readInventoryGeneration(observer, 1);
    } catch (failure) {
      membershipError = String(failure);
    }
    beginInventoryWrite(observer);
    for (const partition of accepted) {
      observer.prepare("UPDATE inventory_member SET partition=? WHERE generation=1 AND program=?").run(partition.id, JSON.stringify(partition.program));
    }
    observer.exec("COMMIT");
    const restoredSame = isDeepStrictEqual(readInventoryGeneration(observer, 1), accepted);
    let restoredFiles: string[];
    {
      using restored = ownedInventoryReader(root, 1, acquireInventoryReadLease(observer, 1, accepted), { db: observer, dispose: () => undefined });
      restoredFiles = restored
        .sourceCorpus()
        .getSourceFiles()
        .map((source) => source.getBaseName())
        .toSorted();
    }
    return { membershipError, restoredSame, restoredFiles };
  };
  try {
    if (mode === "lazy-reference-metadata") {
      writeFileSync(a, "export const a=1;export const use=a;\n");
      let queries = 0;
      const observe = (statement: StatementSync): void => {
        if (statement.sourceSQL.includes("inventory_reference r")) {
          queries++;
          if (!statement.sourceSQL.includes("r.declaration=")) {
            throw new Error("parent attempted whole-reference materialization");
          }
        }
      };
      const all = StatementSync.prototype.all;
      const iterate = StatementSync.prototype.iterate;
      Object.defineProperty(StatementSync.prototype, "all", {
        value(this: StatementSync, ...args: Parameters<StatementSync["all"]>): ReturnType<StatementSync["all"]> {
          observe(this);
          return all.apply(this, args);
        },
      });
      Object.defineProperty(StatementSync.prototype, "iterate", {
        value(this: StatementSync, ...args: Parameters<StatementSync["iterate"]>): ReturnType<StatementSync["iterate"]> {
          observe(this);
          return iterate.apply(this, args);
        },
      });
      try {
        using current = createSemanticInventory({ root });
        const before = queries;
        const declaration = current.sourceCorpus().getSourceFile(a)?.getVariableDeclarationOrThrow("a");
        if (declaration === undefined) {
          throw new Error("native lazy-reference declaration missing");
        }
        const count = current.references(declaration).length;
        current[Symbol.dispose]();
        let disposed: string | null = null;
        try {
          current.sourceCorpus().getSourceFiles();
        } catch (failure) {
          disposed = String(failure);
        }
        current[Symbol.dispose]();
        return { mode, before, count, nonempty: count > 0, after: queries, queried: queries > 0, disposed };
      } finally {
        Object.defineProperty(StatementSync.prototype, "all", { value: all });
        Object.defineProperty(StatementSync.prototype, "iterate", { value: iterate });
      }
    }
    if (mode === "shape-writer") {
      const sdk = createRequire(moduleURL("compiler/semantic-inventory-extract.ts")).resolve("ts-morph");
      const { Project } = (await import(pathToFileURL(sdk).href)) as typeof import("ts-morph");
      const source = new Project({ useInMemoryFileSystem: true }).createSourceFile(a, readFileSync(a, "utf8"));
      let called = false;
      let writerTransaction = false;
      let writerQueryOnly: object | undefined;
      let catalogText: string | undefined;
      active = true;
      using current = createSemanticInventory({
        root,
        shapePlan: {
          sources: [source],
          prepare: (catalog) => {
            called = true;
            const connection = [...connections].find((db) => db.isOpen);
            if (connection === undefined) {
              throw new Error("shape writer connection missing");
            }
            writerTransaction = connection.isTransaction;
            writerQueryOnly = connection.prepare("PRAGMA query_only").get();
            connection.exec("SAVEPOINT shapeCallback");
            catalogText = catalog.sourceCorpus().getSourceFile(a)?.getFullText();
            connection.exec("ROLLBACK TO shapeCallback;RELEASE shapeCallback");
            return [];
          },
        },
      });
      const connection = [...connections].find((db) => db.isOpen);
      return {
        mode,
        called,
        writerTransaction,
        writerQueryOnly,
        catalogText,
        selectedText: current.sourceCorpus().getSourceFile(a)?.getFullText(),
        readerTransaction: connection?.isTransaction,
        readerQueryOnly: connection?.prepare("PRAGMA query_only").get(),
      };
    }
    if (["independent-worlds", "wrong-worker", "reused-world-drift", "malformed-stage", "mixed-stage"].includes(mode)) {
      using previous = createSemanticInventory(options);
      workerStarts.length = 0;
      active = true;
      if (mode === "independent-worlds") {
        using same = createSemanticInventory(options);
        const sameGeneration = same.generation === previous.generation;
        const warmWorkers = [...workerStarts];
        writeFileSync(a, "export const changedA=4;\n");
        using next = createSemanticInventory(options);
        return {
          mode,
          sameGeneration,
          warmWorkers,
          workerStarts,
          changedText: next.sourceCorpus().getSourceFile(a)?.getFullText(),
          pinnedText: previous.sourceCorpus().getSourceFile(a)?.getFullText(),
        };
      }
      writeFileSync(b, "export const changedB=3;\n");
      let error: string | null = null;
      try {
        using _current = createSemanticInventory(options);
      } catch (failure) {
        error = String(failure);
      }
      using observer = openInventoryDatabase(path);
      return {
        mode,
        error,
        injections,
        latestUnchanged: latestInventoryGeneration(observer) === previous.generation,
        pinnedText: previous.sourceCorpus().getSourceFile(a)?.getFullText(),
      };
    }
    active = true;
    let error: string | null = null;
    let selectedGeneration = 0;
    let selectedExport = false;
    try {
      using current = createSemanticInventory(options);
      selectedGeneration = current.generation;
      const source = current.sourceCorpus().getSourceFile(a);
      selectedExport = source !== undefined && current.exports(source).has("a");
    } catch (failure) {
      error = String(failure);
    }
    active = false;
    using observer = openInventoryDatabase(path);
    const latest = latestInventoryGeneration(observer);
    const restored = restoreMembership(observer);
    return {
      mode,
      error,
      injections,
      published,
      pinned,
      selectedGeneration,
      selectedExport,
      latest,
      connections: connections.size,
      closed: [...connections].every((connection) => !connection.isOpen),
      programs: readInventoryGeneration(observer, 1).map((partition) => partition.program),
      acceptedPrograms: accepted.map((partition) => partition.program),
      ...restored,
      checkpointBusy: observer.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()?.busy,
    };
  } finally {
    Object.defineProperty(DatabaseSync.prototype, "prepare", { value: prepare });
    Object.defineProperty(DatabaseSync.prototype, "exec", { value: execute });
  }
}

if (process.argv[1] === import.meta.filename) {
  const mode = process.argv[2];
  const implementation = process.argv[3];
  const root = process.argv[4];
  const result = process.argv[5];
  if (
    mode === undefined ||
    implementation === undefined ||
    root === undefined ||
    result === undefined ||
    !NATIVE_PUBLICATION_CASES.some((value) => value === mode)
  ) {
    throw new Error("native publication case requires its closed case and parent-owned paths");
  }
  writeFileSync(result, JSON.stringify(await run(mode, implementation, root)));
}
