import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import type { SemanticInventoryOptions } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

const mode = process.argv[2];
const implementation = process.argv[3];
const root = process.argv[4];
const resultPath = process.argv[5];
const helper = process.argv[6];
if ((mode !== "cold" && mode !== "overlay") || implementation === undefined || root === undefined || resultPath === undefined || helper === undefined) {
  throw new Error("native controller fixture requires its parent-owned mode and paths");
}
const moduleURL = (relative: string): string => new URL(relative, pathToFileURL(`${implementation}/tooling/src/floor/`)).href;
const { createSemanticInventory } = (await import(
  moduleURL("code-facts/semantic-inventory.ts")
)) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
const { openInventoryDatabase, readInventoryGeneration } = (await import(
  moduleURL("code-facts/semantic-inventory-database.ts")
)) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
const { readInventoryRuntime } = (await import(
  moduleURL("code-facts/semantic-inventory-runtime-query.ts")
)) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts");
const { inputVersion } = (await import(
  moduleURL("code-facts/semantic-inventory-inputs.ts")
)) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts");
let options: SemanticInventoryOptions = { root, families: ["bindings"] };
if (mode === "overlay") {
  const sdk = createRequire(moduleURL("compiler/semantic-inventory-extract.ts")).resolve("ts-morph");
  const { Project } = (await import(pathToFileURL(sdk).href)) as typeof import("ts-morph");
  const { inventoryFileSystem } = (await import(
    moduleURL("compiler/semantic-inventory-filesystem.ts")
  )) as typeof import("../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts");
  const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
    root,
    files: [{ path: helper, text: "module.exports=2;\n" }],
    deleted: [],
  });
  options = { ...options, fileSystem, overlay: { addedPaths: [], deletedPaths: [] } };
}
const prepare = DatabaseSync.prototype.prepare;
const observed: { path?: ReturnType<DatabaseSync["location"]> } = {};
Object.defineProperty(DatabaseSync.prototype, "prepare", {
  value(this: DatabaseSync, ...args: Parameters<DatabaseSync["prepare"]>): ReturnType<DatabaseSync["prepare"]> {
    observed.path = this.location();
    return prepare.apply(this, args);
  },
});
try {
  using inventory = createSemanticInventory(options);
  const text = inventory
    .sourceCorpus()
    .getSourceFile(mode === "overlay" ? helper : "base.ts")
    ?.getFullText();
  const databasePath = observed.path;
  if (typeof databasePath !== "string") {
    throw new Error("native controller fixture did not observe its owned SQLite location");
  }
  using database = openInventoryDatabase(databasePath);
  const partition = readInventoryGeneration(database, inventory.generation)[0];
  if (partition === undefined) {
    throw new Error("native controller fixture partition missing");
  }
  const controller = readInventoryRuntime(database, partition.id, "controller");
  const worker = readInventoryRuntime(database, partition.id, "worker");
  const source = controller.sources.find((value) => value.path === helper);
  writeFileSync(
    resultPath,
    JSON.stringify({
      nodeVersion: process.version,
      generation: inventory.generation,
      controllerLoadedHelper: source !== undefined,
      workerDidNotLoadHelper: !worker.sources.some((value) => value.path === helper),
      executingVersion: source?.version,
      physicalVersion: inputVersion(helper, "file"),
      text,
      physicalText: readFileSync(helper, "utf8"),
    }),
  );
} finally {
  Object.defineProperty(DatabaseSync.prototype, "prepare", { value: prepare });
}
