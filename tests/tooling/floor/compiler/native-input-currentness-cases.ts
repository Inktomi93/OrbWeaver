import childProcess from "node:child_process";
import { readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import process from "node:process";
import type { DatabaseSync } from "node:sqlite";
import { StatementSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { plantPrototypeFault } from "@orb/testkit/node/prototype-fault-plant.ts";
import type { InventoryBuildRequest, InventoryInput } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { NATIVE_QUERY_MUTATIONS, NATIVE_QUERY_TRIGGER } from "./native-query-mutation.ts";

async function run(mode: string, implementation: string, root: string): Promise<object> {
  const moduleURL = (file: string): string => pathToFileURL(join(implementation, "tooling/src/floor", file)).href;
  const path = join(root, ".cache/semantic-inventory.sqlite");
  let active = false;
  let workers = 0;
  let workerStages = 0;
  let captured: readonly InventoryInput[] | undefined;
  const spawn = childProcess.spawnSync;
  const corruptSdkPin = (db: DatabaseSync, id: string): void => {
    const row = db.prepare("SELECT payload FROM inventory_runtime_header WHERE partition=? AND role='worker'").get(id);
    if (typeof row?.["payload"] !== "string") {
      throw new Error("actual worker runtime header missing");
    }
    const header = inventoryRuntimeHeaderSchema.parse(JSON.parse(row["payload"]));
    const runtime = ts.sys.getExecutingFilePath();
    if (!header.pins.some((pin) => pin.path === runtime)) {
      throw new Error("actual executing SDK pin missing");
    }
    db.prepare("UPDATE inventory_runtime_header SET payload=? WHERE partition=? AND role='worker'").run(
      JSON.stringify({ ...header, pins: header.pins.map((pin) => (pin.path === runtime ? { ...pin, version: "stale-sdk-fixture" } : pin)) }),
      id,
    );
  };
  let corruptStage = false;
  Object.defineProperty(childProcess, "spawnSync", {
    value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
      const index = args[1]?.findIndex((value) => value.endsWith("semantic-inventory-worker.ts")) ?? -1;
      const requestPath = index < 0 ? undefined : args[1]?.[index + 1];
      if (active && requestPath !== undefined) {
        workers++;
      }
      const completed = spawn(...args);
      if (active && requestPath !== undefined && completed.status === 0) {
        workerStages++;
        const request = JSON.parse(readFileSync(requestPath, "utf8")) as InventoryBuildRequest;
        using staging = openInventoryDatabase(request.destination);
        const partition = readInventoryGeneration(staging, latestInventoryGeneration(staging))[0];
        if (partition === undefined) {
          throw new Error("actual native input-control staging partition missing");
        }
        captured = [...readInventoryInputs(staging, partition.id)];
        if (corruptStage) {
          corruptSdkPin(staging, partition.id);
        }
      }
      return completed;
    },
  });
  syncBuiltinESMExports();
  // proc.ts captures its builtin spawn door at load, so observation precedes that controller import.
  const { createSemanticInventory } = (await import(
    moduleURL("code-facts/semantic-inventory.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const { openInventoryDatabase, latestInventoryGeneration, readInventoryGeneration } = (await import(
    moduleURL("code-facts/semantic-inventory-database.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
  const { readInventoryInputs } = (await import(
    moduleURL("code-facts/semantic-inventory-queries.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts");
  const { inputsCurrent, inventoryAuthoredFiles, inputVersion } = (await import(
    moduleURL("code-facts/semantic-inventory-inputs.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts");
  const { readInventoryRuntime } = (await import(
    moduleURL("code-facts/semantic-inventory-runtime-query.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts");
  const { inventoryRuntimeHeaderSchema } = (await import(
    moduleURL("code-facts/semantic-inventory-runtime-contract.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-contract.ts");
  const { ts } = await import("ts-morph");
  const runStatement = StatementSync.prototype.run;
  let publications = 0;
  let restoreRun: (() => void) | undefined;
  if (mode === "authored-publication-race") {
    restoreRun = plantPrototypeFault(StatementSync.prototype, "run", {
      value(this: StatementSync, ...args: Parameters<StatementSync["run"]>): ReturnType<StatementSync["run"]> {
        const result = runStatement.apply(this, args);
        if (active && this.sourceSQL.startsWith("INSERT INTO inventory_member(")) {
          publications++;
          unlinkSync(join(root, "authored.txt"));
          symlinkSync("deps/other.ts", join(root, "authored.txt"));
        }
        return result;
      },
    });
  }
  const unrelatedDocument = (previous: ReturnType<typeof createSemanticInventory>, database: ReturnType<typeof openInventoryDatabase>): object => {
    const partition = readInventoryGeneration(database, previous.generation)[0];
    if (partition === undefined) {
      throw new Error("unrelated document control partition missing");
    }
    const document = join(root, "notes/unrelated.txt");
    const absentInput = ![...readInventoryInputs(database, partition.id)].some((input) => input.path === document || input.path === join(root, "notes"));
    unlinkSync(document);
    const all = StatementSync.prototype.all;
    const iterate = StatementSync.prototype.iterate;
    let textReads = 0;
    const refuseText = (statement: StatementSync): void => {
      if (statement.sourceSQL.includes("FROM inventory_text")) {
        textReads++;
        throw new Error("membership validation decoded source text");
      }
    };
    const restoreAll = plantPrototypeFault(StatementSync.prototype, "all", {
      value(this: StatementSync, ...args: Parameters<StatementSync["all"]>): ReturnType<StatementSync["all"]> {
        refuseText(this);
        return all.apply(this, args);
      },
    });
    const restoreIterate = plantPrototypeFault(StatementSync.prototype, "iterate", {
      value(this: StatementSync, ...args: Parameters<StatementSync["iterate"]>): ReturnType<StatementSync["iterate"]> {
        refuseText(this);
        return iterate.apply(this, args);
      },
    });
    try {
      active = true;
      using current = createSemanticInventory({ root });
      return { mode, absentInput, workers, textReads, sameGeneration: current.generation === previous.generation };
    } finally {
      restoreAll();
      restoreIterate();
    }
  };
  const sdkPins = (previous: ReturnType<typeof createSemanticInventory>, database: ReturnType<typeof openInventoryDatabase>): object => {
    const first = readInventoryGeneration(database, previous.generation)[0];
    if (first === undefined) {
      throw new Error("SDK pin control partition missing");
    }
    const runtime = readInventoryRuntime(database, first.id, "worker");
    const sdk = ts.sys.getExecutingFilePath();
    const sdkPinned = runtime.pins.some((pin) => pin.path === sdk && pin.version === inputVersion(sdk, "file"));
    const owners = [
      "authored-repository.ts",
      "semantic-inventory-database.ts",
      "semantic-inventory-records.ts",
      "semantic-inventory-queries.ts",
      "semantic-inventory-reader.ts",
      "semantic-inventory.ts",
    ];
    const sources = [...runtime.sources, ...readInventoryRuntime(database, first.id, "controller").sources];
    const versionedOwners = owners.filter((name) =>
      sources.some((source) => source.path.endsWith(`/${name}`) && source.version === inputVersion(source.path, "file")),
    );
    corruptSdkPin(database, first.id);
    active = true;
    using rebuilt = createSemanticInventory({ root });
    const rebuiltAfterStalePin = rebuilt.generation > previous.generation;
    const before = workers;
    corruptStage = true;
    writeFileSync(join(root, "base.ts"), `${readFileSync(join(root, "base.ts"), "utf8")}\nexport const selectNewWorker=1;`);
    let refusal: string | null = null;
    try {
      using _current = createSemanticInventory({ root });
    } catch (error) {
      refusal = String(error);
    }
    return {
      mode,
      sdkPinned,
      versionedOwners,
      rebuiltAfterStalePin,
      refusal,
      publicationWorkers: workers - before,
      latestUnchanged: latestInventoryGeneration(database) === rebuilt.generation,
      pinnedText: previous.sourceCorpus().getSourceFile("base.ts")?.getFullText(),
    };
  };
  const capturedInputRefusal = (): string | null => {
    let inputRefusal: string | null = null;
    if (captured !== undefined) {
      try {
        if (!inputsCurrent(captured, { authored: inventoryAuthoredFiles(root) })) {
          throw new Error("recorded native dependency changed");
        }
      } catch (error) {
        inputRefusal = String(error);
      }
    }
    return inputRefusal;
  };
  const queryRace = (previous: ReturnType<typeof createSemanticInventory>, database: ReturnType<typeof openInventoryDatabase>): object => {
    const consumer = join(root, "consumer.ts");
    const original = readFileSync(consumer, "utf8");
    const directory = mode === "directory-retarget";
    let dependencyName = directory ? "linked/dep.ts" : "dep.ts";
    if (mode === "authored-alias-retarget") {
      dependencyName = "authored-alias.txt";
    }
    if (mode === "appear") {
      dependencyName = "missing.ts";
    }
    const dependency = join(root, dependencyName);
    const firstIdentity = inputVersion(dependency, "exists");
    writeFileSync(consumer, `${original}${NATIVE_QUERY_TRIGGER}\n`);
    active = true;
    let refusal: string | null = null;
    try {
      using _current = createSemanticInventory({ root, referenceDemand: { mode: "complete", queries: [] } });
    } catch (error) {
      refusal = String(error);
    }
    const inputRefusal = capturedInputRefusal();
    let pinnedReferences: number | undefined;
    if (mode === "authored-publication-race") {
      const value = previous.sourceCorpus().getSourceFile("deps/value.ts")?.getVariableDeclarationOrThrow("value");
      if (value === undefined) {
        throw new Error("pinned authored alias declaration missing");
      }
      pinnedReferences = previous.references(value).length;
    }
    return {
      mode,
      refusal,
      inputRefusal,
      captured,
      firstIdentity,
      workerStages,
      publications,
      latestUnchanged: latestInventoryGeneration(database) === previous.generation,
      pinnedText: previous.sourceCorpus().getSourceFile(consumer)?.getFullText(),
      mutation: mode === "authored-publication-race" ? publications > 0 : JSON.parse(readFileSync(join(root, ".cache/native-query-mutation.json"), "utf8")),
      pinnedReferences,
    };
  };
  try {
    using previous = createSemanticInventory({
      root,
      ...(mode !== "unrelated-document" && mode !== "sdk-pins" ? { referenceDemand: { mode: "complete" as const, queries: [] } } : {}),
    });
    using database = openInventoryDatabase(path);
    if (mode === "unrelated-document") {
      return unrelatedDocument(previous, database);
    }
    if (mode === "sdk-pins") {
      return sdkPins(previous, database);
    }
    return queryRace(previous, database);
  } finally {
    restoreRun?.();
    Object.defineProperty(childProcess, "spawnSync", { value: spawn });
  }
}

const selectedMode = process.argv[2];
const selectedImplementation = process.argv[3];
const selectedRoot = process.argv[4];
const result = process.argv[5];
if (
  selectedMode === undefined ||
  ![...NATIVE_QUERY_MUTATIONS, "unrelated-document", "authored-publication-race", "sdk-pins"].some((value) => value === selectedMode) ||
  selectedImplementation === undefined ||
  selectedRoot === undefined ||
  result === undefined
) {
  throw new Error("native input-currentness case requires its closed mode and fixture paths");
}
writeFileSync(result, JSON.stringify(await run(selectedMode, selectedImplementation, selectedRoot)));
