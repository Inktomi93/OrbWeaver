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

/** Native caches belong to their process; every scalar check is its own uncached fence. */
export function inventoryRuntimeCurrent(snapshot: InventoryRuntime): boolean {
  return inventoryRuntimesCurrent([snapshot])[0] === true;
}

/** Each original receipt keeps its own verdict and before/after fences; only compatible cold resolution is shared. */
export function inventoryRuntimesCurrent(rawSnapshots: readonly InventoryRuntime[]): boolean[] {
  const snapshots = rawSnapshots.map((snapshot) => inventoryRuntimeSchema.parse(snapshot));
  const current = snapshots.map(inventoryRuntimeSourcesCurrent);
  const groups = new Map<string, (readonly [number, InventoryRuntime])[]>();
  for (const [index, snapshot] of snapshots.entries()) {
    if (current[index] !== true) {
      continue;
    }
    const context = JSON.stringify([snapshot.version, snapshot.bootstrap, snapshot.nodeVersion, snapshot.nodeOptions, snapshot.execArgv]);
    const group = groups.get(context) ?? [];
    group.push([index, snapshot]);
    groups.set(context, group);
  }
  for (const group of groups.values()) {
    const requests = group.flatMap(([, snapshot]) => snapshot.resolutions);
    const outcomes = replayInventoryRuntime(requests);
    let offset = 0;
    for (const [index, snapshot] of group) {
      const end = offset + snapshot.resolutions.length;
      current[index] =
        outcomes.length === requests.length &&
        outcomes.slice(offset, end).every((outcome, ordinal) => isDeepStrictEqual(outcome, snapshot.resolutions[ordinal]?.outcome));
      offset = end;
    }
  }
  return snapshots.map((snapshot, index) => current[index] === true && inventoryRuntimeSourcesCurrent(snapshot));
}
