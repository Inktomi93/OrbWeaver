import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { InventoryBuildRequest, InventoryWorkerRequest } from "../code-facts/semantic-inventory-contract.ts";
import { runNicedSync } from "../process/proc.ts";
import { assertInventoryRuntimeSealed, captureInventoryRuntime, inventoryRuntimeArguments } from "./semantic-inventory-runtime.ts";
import { inventoryRuntimeCurrent } from "./semantic-inventory-runtime-current.ts";

/** Return only after the native partition process exits; publication never overlaps its Program. */
export function runInventoryPartitionWorker(request: InventoryBuildRequest, factoryScope = false): void {
  const roots = factoryScope ? [import.meta.url, new URL("../code-facts/semantic-inventory.ts", import.meta.url).href] : [import.meta.url];
  const controller = captureInventoryRuntime(roots);
  if (!inventoryRuntimeCurrent(controller)) {
    throw new Error("native inventory worker controller implementation is stale");
  }
  const scratch = mkdtempSync(join(tmpdir(), "orb-native-inventory-worker-"));
  try {
    const path = join(scratch, "request.json");
    const observed: InventoryWorkerRequest = { ...request, controllerImplementation: controller };
    writeFileSync(path, JSON.stringify(observed));
    const worker = fileURLToPath(new URL("./semantic-inventory-worker.ts", import.meta.url));
    const bootstrap = fileURLToPath(new URL("./semantic-inventory-runtime.ts", import.meta.url));
    const result = runNicedSync(process.execPath, [...inventoryRuntimeArguments(), "--import", bootstrap, worker, path], { cwd: request.root });
    if (result.status !== 0) {
      throw new Error(`native inventory worker ${request.descriptor.id} failed (${String(result.status)}, ${result.errorCode ?? "exit"}): ${result.stderr}`);
    }
    assertInventoryRuntimeSealed(controller);
    if (!inventoryRuntimeCurrent(controller)) {
      throw new Error("native inventory worker controller implementation changed before handoff");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
