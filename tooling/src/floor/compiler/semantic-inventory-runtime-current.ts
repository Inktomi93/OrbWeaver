import { isDeepStrictEqual } from "node:util";
import { inputVersion } from "../code-facts/semantic-inventory-inputs.ts";
import type { InventoryRuntime } from "../code-facts/semantic-inventory-runtime-contract.ts";
import { inventoryRuntimeSchema } from "../code-facts/semantic-inventory-runtime-contract.ts";
import { inventoryRuntimeEnvironment } from "./semantic-inventory-runtime.ts";
import { replayInventoryRuntime } from "./semantic-inventory-runtime-replay.ts";

/** Executable reads never borrow a transaction's projected subject filesystem. */
export function inventoryRuntimeSourcesCurrent(snapshot: InventoryRuntime): boolean {
  const environment = inventoryRuntimeEnvironment();
  return (
    snapshot.nodeVersion === environment.nodeVersion &&
    snapshot.nodeOptions === environment.nodeOptions &&
    isDeepStrictEqual(snapshot.execArgv, environment.execArgv) &&
    [...snapshot.sources, ...snapshot.pins].every((source) => inputVersion(source.path, "file") === source.version)
  );
}

/** Native caches belong to their process; a cold resolver rechecks every recorded request without target execution. */
export function inventoryRuntimeCurrent(rawSnapshot: InventoryRuntime): boolean {
  const snapshot = inventoryRuntimeSchema.parse(rawSnapshot);
  if (!inventoryRuntimeSourcesCurrent(snapshot)) {
    return false;
  }
  const outcomes = replayInventoryRuntime(snapshot.resolutions);
  return (
    outcomes.length === snapshot.resolutions.length &&
    outcomes.every((outcome, index) => isDeepStrictEqual(outcome, snapshot.resolutions[index]?.outcome)) &&
    inventoryRuntimeSourcesCurrent(snapshot)
  );
}
