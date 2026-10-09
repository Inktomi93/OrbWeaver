import type { BalancedShardSelection, DurationWeight } from "../contract/application-partitions.ts";
import type { NativeNodeShard } from "../contract/scoped-test.ts";

/** Deterministic longest-processing-time placement; native collection is the population authority. */
export function balanceNativeFiles(files: readonly string[], weights: readonly DurationWeight[], shard: NativeNodeShard): BalancedShardSelection {
  if (files.length < shard.count || new Set(files).size !== files.length || shard.index < 1 || shard.index > shard.count || shard.count < 1) {
    throw new Error("native shard population is empty, duplicated or has an invalid shard");
  }
  const durations = new Map(weights.map((weight) => [weight.file, weight.durationMs]));
  if (durations.size !== weights.length || weights.some((weight) => !Number.isFinite(weight.durationMs) || weight.durationMs < 0)) {
    throw new Error("duration baseline contains duplicate files or invalid durations");
  }
  const measured = weights
    .filter((weight) => files.includes(weight.file))
    .map((weight) => weight.durationMs)
    .toSorted((a, b) => a - b);
  if (measured.length === 0) {
    throw new Error("duration baseline has no native population overlap");
  }
  const fallback = measured[Math.floor(measured.length / 2)] ?? 1;
  const duration = (file: string): number => durations.get(file) ?? fallback;
  const shards = Array.from({ length: shard.count }, () => ({ files: [] as string[], durationMs: 0 }));
  for (const file of files.toSorted((a, b) => duration(b) - duration(a) || a.localeCompare(b))) {
    const target = shards.reduce((best, candidate) => (candidate.durationMs < best.durationMs ? candidate : best));
    target.files.push(file);
    target.durationMs += duration(file);
  }
  const selected = shards[shard.index - 1];
  if (selected === undefined || shards.some((part) => part.files.length === 0)) {
    throw new Error("duration sharding produced an empty native partition");
  }
  return { files, shards: shards.map((part) => part.files), selected: selected.files, shard };
}

/** Native re-collection must equal exactly the selected units, not a substring-expanded superset. */
export function requireNativeSelection(expected: readonly string[], collected: readonly string[]): void {
  if (collected.length === 0 || new Set(collected).size !== collected.length || JSON.stringify(expected.toSorted()) !== JSON.stringify(collected.toSorted())) {
    throw new Error("balanced shard native selection overlaps, omits or widens its unit population");
  }
}
