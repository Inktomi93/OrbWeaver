export const CONFIG_SNAPSHOT_RUNNERS = ["vitest", "depcruise"] as const;

export interface EslintFileAdmission {
  readonly path: string;
  readonly requiresTypeInformation: boolean;
}

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

export const DEPCRUISE_CONFIG_SNAPSHOT_FIELDS = ["path", "pathNot"] as const;

export type DepcruiseConfigSnapshotField = (typeof DEPCRUISE_CONFIG_SNAPSHOT_FIELDS)[number];

export interface DepcruiseSelectorSnapshot {
  readonly owner: string;
  readonly field: DepcruiseConfigSnapshotField;
  readonly position: number;
  readonly value: string;
}

export interface DepcruiseConfigSnapshot {
  readonly version: 1;
  readonly runner: "depcruise";
  readonly config: string;
  readonly effectiveRules: number;
  /** Repository-authored selectors from `config`; inherited package selectors have a separate lifecycle. */
  readonly selectors: readonly DepcruiseSelectorSnapshot[];
}

export interface ConfigSnapshotByRunner {
  readonly vitest: VitestConfigSnapshot;
  readonly depcruise: DepcruiseConfigSnapshot;
}

export type ConfigSnapshot = ConfigSnapshotByRunner[ConfigSnapshotRunner];

export interface ConfigSnapshotReadOptions {
  readonly overlay?: Readonly<Record<string, string | null>>;
}

export interface ConfigSnapshotTransaction {
  readonly root: string;
  readonly paths: readonly string[];
  readonly cleanup: () => void;
}

/** The outcome of one native-config snapshot read (#1988). `lib/config-snapshot.ts` produces it and
 *  `ops/resource-native-config.ts` narrows it into a resource receipt, so it crosses the lib↔ops boundary
 *  and `lib/` is not a type home. `unreadable` carries the detail: a config the runner could not resolve is
 *  a refusal with a reason, never an empty snapshot. */
export type ConfigSnapshotRead<R extends ConfigSnapshotRunner> =
  | { readonly kind: "ok"; readonly snapshot: ConfigSnapshotByRunner[R] }
  | { readonly kind: "unreadable"; readonly detail: string };
