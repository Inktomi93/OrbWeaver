import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { InventoryBuildRequest } from "../code-facts/semantic-inventory-contract.ts";
import { runNicedSync } from "../process/proc.ts";

/** Return only after the native partition process exits; publication never overlaps its Program. */
export function runInventoryPartitionWorker(request: InventoryBuildRequest): void {
  const scratch = mkdtempSync(join(tmpdir(), "orb-native-inventory-worker-"));
  try {
    const path = join(scratch, "request.json");
    writeFileSync(path, JSON.stringify(request));
    const worker = fileURLToPath(new URL("./semantic-inventory-worker.ts", import.meta.url));
    const result = runNicedSync(process.execPath, [worker, path], { cwd: request.root });
    if (result.status !== 0) {
      throw new Error(`native inventory worker ${request.descriptor.id} failed (${String(result.status)}, ${result.errorCode ?? "exit"}): ${result.stderr}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
