export const CONFIG_SNAPSHOT_RUNNERS = ["vitest", "eslint", "depcruise"] as const;

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

/** The ESLint candidate population, split by the ONE rule both of `ops/config-snapshot.ts`'s callers apply.
 *  `excludedNonFilePaths` is the honesty half: a tracked symlink-to-directory is an authored path Git and
 *  the repository inventory both admit, and it is not a lintable file, so it leaves the population BY NAME
 *  rather than by a silent filter (#2302). */
export interface EslintTrackedPopulation {
  readonly paths: readonly string[];
  readonly excludedNonFilePaths: readonly string[];
}

export interface EslintConfigSnapshot {
  readonly version: 1;
  readonly runner: "eslint";
  readonly config: string;
  readonly trackedFiles: number;
  /** Authored paths admitted by the inventory and excluded from the candidate population because they are
   *  not files. Carried across the worker's process boundary so the population claim is readable, never
   *  re-derived: `trackedFiles + excludedNonFilePaths.length` is the list the inventory handed in. */
  readonly excludedNonFilePaths: readonly string[];
  readonly entries: number;
  readonly selectors: readonly EslintSelectorSnapshot[];
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
  readonly eslint: EslintConfigSnapshot;
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
