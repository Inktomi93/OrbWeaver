export const CONFIG_SNAPSHOT_RUNNERS = ["vitest"] as const;

export type ConfigSnapshotRunner = (typeof CONFIG_SNAPSHOT_RUNNERS)[number];

export const CONFIG_SNAPSHOT_FIELDS = ["test.include", "test.exclude", "test.globalSetup", "typecheck.include", "typecheck.exclude"] as const;

export type ConfigSnapshotField = (typeof CONFIG_SNAPSHOT_FIELDS)[number];

export interface ConfigSelectorSnapshot {
  readonly owner: string;
  readonly field: ConfigSnapshotField;
  readonly values: readonly string[];
}

export interface ConfigSnapshot {
  readonly version: 1;
  readonly runner: ConfigSnapshotRunner;
  readonly config: string;
  readonly selectors: readonly ConfigSelectorSnapshot[];
}
