import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { InventoryWorkerRequest } from "../code-facts/semantic-inventory-contract.ts";
import { assertInventoryRuntimeSealed, captureInventoryRuntime } from "./semantic-inventory-runtime.ts";

const requestPath = process.argv[2];
if (requestPath === undefined) {
  throw new Error("inventory worker requires its parent-authored request path");
}
const request = JSON.parse(readFileSync(requestPath, "utf8")) as InventoryWorkerRequest;
const { openInventoryDatabase, publishInventoryGeneration } = await import("../code-facts/semantic-inventory-database.ts");
const { extractInventoryPartition } = await import("./semantic-inventory-extract.ts");
const { inventoryRuntimeCurrent } = await import("./semantic-inventory-runtime-current.ts");
const { inputVersion } = await import("../code-facts/semantic-inventory-inputs.ts");
const { inventoryRuntimeSchema } = await import("../code-facts/semantic-inventory-runtime-contract.ts");
const controller = inventoryRuntimeSchema.parse(request.controllerImplementation);
const { ts } = await import("ts-morph");
const pins = [
  ts.sys.getExecutingFilePath(),
  fileURLToPath(import.meta.resolve("ts-morph")),
  createRequire(import.meta.resolve("ts-morph")).resolve("@ts-morph/common"),
  fileURLToPath(new URL("../../../../pnpm-lock.yaml", import.meta.url)),
].map((path) => ({ path, version: inputVersion(path, "file") }));
if (!(inventoryRuntimeCurrent(controller) && inventoryRuntimeCurrent(captureInventoryRuntime([import.meta.url], pins)))) {
  throw new Error("native inventory worker executing implementation is stale");
}
const partition = extractInventoryPartition(request);
const implementation = captureInventoryRuntime([import.meta.url], pins);
if (!(inventoryRuntimeCurrent(controller) && inventoryRuntimeCurrent(implementation))) {
  throw new Error("native inventory worker executing implementation is stale");
}
using database = openInventoryDatabase(request.destination);
database.exec("BEGIN IMMEDIATE");
publishInventoryGeneration(database, [{ ...partition, implementation: { controller, worker: implementation } }]);
assertInventoryRuntimeSealed(implementation);
if (!(inventoryRuntimeCurrent(controller) && inventoryRuntimeCurrent(implementation))) {
  throw new Error("native inventory worker implementation changed during staging");
}
database.exec("COMMIT");
assertInventoryRuntimeSealed(implementation);
