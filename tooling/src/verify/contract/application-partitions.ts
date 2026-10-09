import type { NativeCtCase, NativeNodeShard } from "./scoped-test.ts";

export const APPLICATION_PARTITIONS = ["static", "node", "ct", "smoke", "e2e", "quality"] as const;
export type ApplicationPartition = (typeof APPLICATION_PARTITIONS)[number];
export const APPLICATION_SHARD_COUNTS = { static: 1, node: 3, ct: 5, smoke: 1, e2e: 3, quality: 1 } as const satisfies Readonly<
  Record<ApplicationPartition, number>
>;
export interface ApplicationPartitionReceipt {
  readonly name: ApplicationPartition;
  readonly shard: string | null;
  readonly head: string;
}
export interface DurationWeight {
  readonly file: string;
  readonly durationMs: number;
}
export interface BalancedShardSelection {
  readonly files: readonly string[];
  readonly shards: readonly (readonly string[])[];
  readonly selected: readonly string[];
  readonly shard: NativeNodeShard;
}

export interface NativeDurationShardCollection {
  readonly files: readonly string[];
  readonly cases: readonly Pick<NativeCtCase, "id" | "file">[] | null;
}
