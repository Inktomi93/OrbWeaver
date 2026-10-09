import type { ApplicationPartition } from "../contract/application-partitions.ts";
import { APPLICATION_PARTITIONS, APPLICATION_SHARD_COUNTS } from "../contract/application-partitions.ts";
import type { StageDef, Tier } from "../contract/stage.ts";
import { stagesForTier } from "./registry.ts";

const RUNTIME_PARTITIONS = new Map<string, ApplicationPartition>([
  ["tests:node", "node"],
  ["browser:ct", "ct"],
  ["browser:e2e-smoke", "smoke"],
  ["browser:e2e", "e2e"],
]);

/** Partition the registry, not a copied stage roster. Static exclusions remain explicit native rows. */
export function applicationPartitionStages(tier: Tier, partition: ApplicationPartition): readonly StageDef[] {
  return stagesForTier(tier).filter((stage) => {
    const home = RUNTIME_PARTITIONS.get(stage.name) ?? (stage.group === "quality" ? "quality" : "static");
    return home === partition;
  });
}

/** The exact expected receipt keys for the native tier, including every runtime shard. */
export function applicationPartitionKeys(tier: Tier): readonly string[] {
  return APPLICATION_PARTITIONS.flatMap((name) => {
    if (applicationPartitionStages(tier, name).length === 0) {
      return [];
    }
    return APPLICATION_SHARD_COUNTS[name] > 1
      ? Array.from({ length: APPLICATION_SHARD_COUNTS[name] }, (_, index) => `${name}:${index + 1}/${APPLICATION_SHARD_COUNTS[name]}`)
      : [name];
  });
}
