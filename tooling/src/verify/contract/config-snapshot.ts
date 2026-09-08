export const CONFIG_SNAPSHOT_RUNNERS = ["vitest", "eslint"] as const;

export type ConfigSnapshotRunner = (typeof CONFIG_SNAPSHOT_RUNNERS)[number];

export const VITEST_CONFIG_SNAPSHOT_FIELDS = ["test.include", "test.exclude", "test.globalSetup", "typecheck.include", "typecheck.exclude"] as const;

export type VitestConfigSnapshotField = (typeof VITEST_CONFIG_SNAPSHOT_FIELDS)[number];
export type ConfigSnapshotField = VitestConfigSnapshotField;

export interface ConfigSelectorSnapshot {
  readonly owner: string;
  readonly field: VitestConfigSnapshotField;
  readonly values: readonly string[];
}

export interface VitestConfigSnapshot {
  readonly version: 1;
  readonly runner: "vitest";
  readonly config: string;
  readonly selectors: readonly ConfigSelectorSnapshot[];
}

export type EslintSelectorValue = string | readonly string[];

export interface EslintSelectorSnapshot {
  readonly owner: string;
  readonly field: "files" | "ignores";
  readonly position: number;
  readonly value: EslintSelectorValue;
  readonly scope: "files" | "local-ignore" | "global-ignore";
  readonly members: number;
}

export interface EslintConfigSnapshot {
  readonly version: 1;
  readonly runner: "eslint";
  readonly config: string;
  readonly trackedFiles: number;
  readonly entries: number;
  readonly selectors: readonly EslintSelectorSnapshot[];
}

export interface ConfigSnapshotByRunner {
  readonly vitest: VitestConfigSnapshot;
  readonly eslint: EslintConfigSnapshot;
}

export type ConfigSnapshot = ConfigSnapshotByRunner[ConfigSnapshotRunner];
