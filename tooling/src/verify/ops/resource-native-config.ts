// Executable configs observe the whole authored transaction; their dependency set is not just imports.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ConfigSnapshot, ConfigSnapshotRunner } from "../contract/config-snapshot.ts";
import type { ResourceLoad, ResourceReader, ResourceReaderOptions } from "../contract/resource.ts";
import { NATIVE_CONFIG_RESOURCE_PATHS } from "../contract/resource-config.ts";
import { readConfigSnapshot } from "../lib/config-snapshot.ts";
import { readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

export function loadNativeConfig(reader: ResourceReader, options: ResourceReaderOptions, id: ConfigSnapshotRunner): ResourceLoad<ConfigSnapshot> {
  if (!Object.hasOwn(NATIVE_CONFIG_RESOURCE_PATHS, id)) {
    return { status: "unresolved", paths: [], members: 0, reason: `unknown native config: ${String(id)}` };
  }
  const configPath = NATIVE_CONFIG_RESOURCE_PATHS[id];
  const rootConfig = reader.read(configPath);
  if (rootConfig.status !== "ready") {
    return rootConfig;
  }
  const entries = Object.entries(options.overlay ?? {});
  const deleted = (path: string): boolean => entries.some(([entry, value]) => value === null && (path === entry || path.startsWith(`${entry}/`)));
  const inventory = readPolicyRepositoryInventory(options.root).paths.filter((path) => !deleted(path));
  const paths = [...new Set([...inventory, ...entries.flatMap(([entry, value]) => (value === null ? [] : [entry]))])].toSorted();
  const read = readConfigSnapshot(options.root, id, configPath, options);
  if (read.kind !== "ok") {
    return { status: "unresolved", paths, members: 0, reason: read.detail };
  }
  const members = read.snapshot.selectors.length;
  return members === 0
    ? { status: "empty", paths, members, reason: `native config ${id} produced no selectors` }
    : { status: "ready", paths, members, value: read.snapshot };
}
