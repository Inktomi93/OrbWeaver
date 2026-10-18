import { isDeepStrictEqual } from "node:util";
import { inputVersion } from "../code-facts/semantic-inventory-inputs.ts";
import type { InventoryRuntime, InventoryRuntimeResolution } from "../code-facts/semantic-inventory-runtime-contract.ts";
import { inventoryRuntimeSchema } from "../code-facts/semantic-inventory-runtime-contract.ts";
import { inventoryRuntimeEnvironment } from "./semantic-inventory-runtime.ts";
import { replayInventoryRuntime } from "./semantic-inventory-runtime-replay.ts";

/** Executable reads never borrow a transaction's projected subject filesystem. */
export function inventoryRuntimeSourcesCurrent(snapshot: InventoryRuntime): boolean {
  return sourcesCurrent(snapshot, new Map());
}

function sourcesCurrent(snapshot: InventoryRuntime, versions: Map<string, string>): boolean {
  const environment = inventoryRuntimeEnvironment();
  return (
    snapshot.nodeVersion === environment.nodeVersion &&
    snapshot.nodeOptions === environment.nodeOptions &&
    isDeepStrictEqual(snapshot.execArgv, environment.execArgv) &&
    [...snapshot.sources, ...snapshot.pins].every((source) => {
      let version = versions.get(source.path);
      if (version === undefined) {
        version = inputVersion(source.path, "file");
        versions.set(source.path, version);
      }
      return version === source.version;
    })
  );
}

/** Native caches belong to their process; every scalar check is its own uncached fence. */
export function inventoryRuntimeCurrent(snapshot: InventoryRuntime): boolean {
  return inventoryRuntimesCurrent([snapshot])[0] === true;
}

/** Each original receipt keeps its own verdict and before/after fences; only compatible cold resolution is shared. */
export function inventoryRuntimesCurrent(rawSnapshots: readonly InventoryRuntime[]): boolean[] {
  const snapshots = rawSnapshots.map((snapshot) => inventoryRuntimeSchema.parse(snapshot));
  const before = new Map<string, string>();
  const current = snapshots.map((snapshot) => sourcesCurrent(snapshot, before));
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
    replayGroup(group, current);
  }
  // Resolution can intervene in executable bytes; no observation crosses into the after-phase or next fence.
  const after = new Map<string, string>();
  return snapshots.map((snapshot, index) => current[index] === true && sourcesCurrent(snapshot, after));
}

function replayGroup(group: readonly (readonly [number, InventoryRuntime])[], current: boolean[]): void {
  const requests: InventoryRuntimeResolution[] = [];
  const buckets = new Map<string, (readonly [InventoryRuntimeResolution, number])[]>();
  const positions = new Map<number, number[]>();
  for (const [index, snapshot] of group) {
    const selected = snapshot.resolutions.map((request) => {
      const key = JSON.stringify([request.kind, request.mode, request.specifier, request.context.parentURL]);
      const bucket = buckets.get(key) ?? [];
      const match = bucket.find(
        ([previous]) =>
          previous.kind === request.kind &&
          previous.mode === request.mode &&
          previous.specifier === request.specifier &&
          isDeepStrictEqual(previous.context, request.context),
      );
      if (match !== undefined) {
        return match[1];
      }
      const ordinal = requests.length;
      requests.push(request);
      bucket.push([request, ordinal]);
      buckets.set(key, bucket);
      return ordinal;
    });
    positions.set(index, selected);
  }
  const outcomes = replayInventoryRuntime(requests);
  for (const [index, snapshot] of group) {
    const selected = positions.get(index);
    current[index] =
      outcomes.length === requests.length &&
      snapshot.resolutions.every((request, ordinal) => {
        const position = selected?.[ordinal];
        return position !== undefined && isDeepStrictEqual(outcomes[position], request.outcome);
      });
  }
}
