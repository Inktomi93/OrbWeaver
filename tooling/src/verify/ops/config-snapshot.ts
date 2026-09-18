// Native config observation for synchronous structural gates. The private worker process is the async
// boundary; the public verify CLI delegates here too. Each runner loads through its public API, then emits data only.
// The ESLint flat-config MODEL and its selector counterfactuals are `lib/eslint-selector-model.ts` (split out
// at the size cap 2026-09-18); the three runner entry points, their loaders and the argv door stay here.
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { ConfigArray } from "@eslint/config-array";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "../../_shared/exit-contract.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import type {
  ConfigSelectorSnapshot,
  ConfigSnapshot,
  ConfigSnapshotRunner,
  DepcruiseConfigSnapshot,
  DepcruiseConfigSnapshotField,
  DepcruiseSelectorSnapshot,
  EslintConfigSnapshot,
  EslintTrackedPopulation,
  VitestConfigSnapshot,
  VitestConfigSnapshotField,
} from "../contract/config-snapshot.ts";
import { CONFIG_SNAPSHOT_RUNNERS } from "../contract/config-snapshot.ts";
import { globalSelectorSnapshots, isStringArray, localSelectorSnapshots, nativeEslintModel } from "../lib/eslint-selector-model.ts";
import { assertPolicyRepoPath, readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";

refuseDirectInvocation(import.meta.url, "pnpm exec node tooling/src/verify/cli.ts config-snapshot <vitest|eslint|depcruise> <repo-relative-config>");

export const CONFIG_SNAPSHOT_HELP =
  "usage: node tooling/src/verify/cli.ts config-snapshot <vitest|eslint|depcruise> <repo-relative-config>\n  Emits the runner's natively loaded selector fields as strict JSON.";

function isRunner(value: string): value is ConfigSnapshotRunner {
  return (CONFIG_SNAPSHOT_RUNNERS as readonly string[]).includes(value);
}

function configPath(value: string): string {
  if (value.startsWith("/") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new UsageError(`config-snapshot requires a repo-relative config path, got ${JSON.stringify(value)}`);
  }
  return value;
}

function selector(owner: string, field: VitestConfigSnapshotField, value: unknown): ConfigSelectorSnapshot | undefined {
  if (value === undefined) {
    return;
  }
  if (!isStringArray(value)) {
    throw new Error(`${owner}.${field} resolved to a non-string-array selector`);
  }
  return { owner, field, values: value };
}

function projectOwner(project: { readonly test?: { readonly name?: unknown } }, index: number): string {
  const name = project.test?.name;
  return typeof name === "string" && name !== "" ? `project[${String(index)}]:${name}` : `project[${String(index)}]`;
}

function projectSelectors(project: unknown, index: number): readonly ConfigSelectorSnapshot[] {
  if (typeof project !== "object" || project === null) {
    throw new Error(`project[${String(index)}] did not resolve to an inline native project config`);
  }
  const test = "test" in project ? project.test : undefined;
  if (test !== undefined && (typeof test !== "object" || test === null)) {
    throw new Error(`project[${String(index)}].test resolved to a non-object`);
  }
  const typed = test as
    | {
        readonly exclude?: unknown;
        readonly globalSetup?: unknown;
        readonly include?: unknown;
        readonly name?: unknown;
        readonly typecheck?: { readonly exclude?: unknown; readonly include?: unknown };
      }
    | undefined;
  const owner = projectOwner(project as { readonly test?: { readonly name?: unknown } }, index);
  const rows = [
    selector(owner, "test.include", typed?.include),
    selector(owner, "test.exclude", typed?.exclude),
    selector(owner, "test.globalSetup", typed?.globalSetup),
    selector(owner, "typecheck.include", typed?.typecheck?.include),
    selector(owner, "typecheck.exclude", typed?.typecheck?.exclude),
  ];
  return rows.filter((row): row is ConfigSelectorSnapshot => row !== undefined);
}

interface NativeVitestConfig {
  readonly exclude?: unknown;
  readonly globalSetup?: unknown;
  readonly include?: unknown;
  readonly projects?: unknown;
}

interface NativeVitestResolution {
  readonly vitestConfig: NativeVitestConfig;
}

interface NativeVitestModule {
  readonly resolveConfig: (options: Readonly<Record<string, unknown>>) => Promise<NativeVitestResolution>;
}

function isNativeVitestModule(value: unknown): value is NativeVitestModule {
  return typeof value === "object" && value !== null && "resolveConfig" in value && typeof value.resolveConfig === "function";
}

/** Keep the runner behind the snapshot verb: ordinary verify/help startup does not load Vitest. */
async function loadVitest(): Promise<NativeVitestModule> {
  const loaded: unknown = await import("vitest/node");
  if (!isNativeVitestModule(loaded)) {
    throw new Error("vitest/node does not export resolveConfig");
  }
  return loaded;
}

export async function snapshotVitestConfig(root: string, config: string): Promise<VitestConfigSnapshot> {
  const { resolveConfig } = await loadVitest();
  const resolved = await resolveConfig({ root, config, watch: false, run: true });
  const rootConfig = resolved.vitestConfig;
  const projects = rootConfig.projects;
  if (projects !== undefined && !Array.isArray(projects)) {
    throw new Error(`${config} native projects resolved to a non-array`);
  }
  const selectors = [
    selector("root", "test.include", rootConfig.include),
    selector("root", "test.exclude", rootConfig.exclude),
    selector("root", "test.globalSetup", rootConfig.globalSetup),
    ...(projects ?? []).flatMap(projectSelectors),
  ].filter((row): row is ConfigSelectorSnapshot => row !== undefined);
  if (selectors.length === 0) {
    throw new Error(`${config} resolved zero selector fields`);
  }
  return { version: 1, runner: "vitest", config, selectors };
}

interface NativeDepcruiseConfig {
  readonly forbidden?: unknown;
}

interface NativeDepcruiseModule {
  readonly default: (configFileName: string, alreadyVisited?: Set<string>, baseDirectory?: string) => Promise<NativeDepcruiseConfig>;
}

function isNativeDepcruiseModule(value: unknown): value is NativeDepcruiseModule {
  return typeof value === "object" && value !== null && "default" in value && typeof value.default === "function";
}

/** Keep dependency-cruiser behind the snapshot verb: ordinary verify/help startup stays cheap. */
async function loadDepcruise(): Promise<NativeDepcruiseModule> {
  const loaded: unknown = await import("dependency-cruiser/config-utl/extract-depcruise-config");
  if (!isNativeDepcruiseModule(loaded)) {
    throw new Error("dependency-cruiser does not export extract-depcruise-config");
  }
  return loaded;
}

function depcruiseValues(value: unknown, identity: string): readonly string[] {
  if (typeof value === "string" && value !== "") {
    return [value];
  }
  if (Array.isArray(value) && value.length > 0 && value.every((entry): entry is string => typeof entry === "string" && entry !== "")) {
    return value;
  }
  throw new Error(`${identity} resolved to an empty or non-string selector`);
}

async function loadAuthoredDepcruiseConfig(root: string, config: string): Promise<unknown> {
  const url = pathToFileURL(resolve(root, config));
  const loaded = (await import(url.href)) as { readonly default?: unknown };
  if (!("default" in loaded)) {
    throw new Error(`${config} has no module export`);
  }
  return loaded.default;
}

function collectDepcruiseSelectors(value: unknown, owner: string, selectors: DepcruiseSelectorSnapshot[]): void {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      collectDepcruiseSelectors(entry, `${owner}[${String(index)}]`, selectors);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "path" || key === "pathNot") {
      const field: DepcruiseConfigSnapshotField = key;
      for (const [position, selectorValue] of depcruiseValues(entry, `${owner}.${field}`).entries()) {
        selectors.push({ owner, field, position, value: selectorValue });
      }
    } else {
      collectDepcruiseSelectors(entry, `${owner}.${key}`, selectors);
    }
  }
}

export async function snapshotDepcruiseConfig(root: string, config: string): Promise<DepcruiseConfigSnapshot> {
  const { default: extractDepcruiseConfig } = await loadDepcruise();
  const effective = await extractDepcruiseConfig(`./${config}`, undefined, root);
  if (!Array.isArray(effective.forbidden) || effective.forbidden.length === 0) {
    throw new Error(`${config} resolved zero forbidden rules`);
  }
  const authored = await loadAuthoredDepcruiseConfig(root, config);
  if (typeof authored !== "object" || authored === null || Array.isArray(authored)) {
    throw new Error(`${config} did not resolve to a config object`);
  }
  const selectors: DepcruiseSelectorSnapshot[] = [];
  collectDepcruiseSelectors(authored, "config", selectors);
  if (selectors.length === 0) {
    throw new Error(`${config} resolved zero dependency-cruiser path selectors`);
  }
  return { version: 1, runner: "depcruise", config, effectiveRules: effective.forbidden.length, selectors };
}

/** Keep ESLint and its plugins behind the snapshot verb: ordinary verify/help startup stays cheap. */
let eslintConfigImportSequence = 0;
async function loadEslintConfig(root: string, config: string): Promise<unknown> {
  eslintConfigImportSequence += 1;
  const url = pathToFileURL(resolve(root, config));
  url.searchParams.set("orbConfigSnapshot", String(eslintConfigImportSequence));
  const loaded = (await import(url.href)) as { readonly default?: unknown };
  if (!("default" in loaded)) {
    throw new Error(`${config} has no default export`);
  }
  return loaded.default;
}

async function loadEslintDefaultConfig(): Promise<unknown> {
  const loaded: unknown = await import("eslint");
  const eslintClass = typeof loaded === "object" && loaded !== null ? Reflect.get(loaded, "ESLint") : undefined;
  const defaults = typeof eslintClass === "function" ? Reflect.get(eslintClass, "defaultConfig") : undefined;
  if (!Array.isArray(defaults) || defaults.length === 0) {
    throw new Error("eslint does not expose a non-empty ESLint.defaultConfig");
  }
  return defaults;
}

/** ONE rule for both callers. Git tracks SYMLINKS AS ORDINARY PATHS and `lib/policy-repo-inventory.ts`
 *  admits every one of them (`currentAuthoredFile` returns a symlink's path without asking what it points
 *  at), so a tracked symlink-to-DIRECTORY — `.agents/skills` on this tree — is a legitimate member of the
 *  very list both callers read. It is not a lintable file, so it is EXCLUDED and NAMED in the snapshot; a
 *  path that leaves the transaction still REFUSES, because that is a containment question and not a
 *  file-kind one.
 *
 *  THE TWO BRANCHES USED TO DISAGREE ABOUT THAT ONE LIST (#2302, 2026-09-13): the inventory branch returned
 *  it unvalidated, while the SUPPLIED branch — taken only under an overlay, and built by
 *  `lib/config-snapshot.ts` from the identical `readPolicyRepositoryInventory(root).trackedPaths` call —
 *  threw `is not a contained transaction file` on the symlink. So the overlay door, the only door through
 *  which a counterfactual of the REAL `eslint.config.js` can be observed, was unusable at the real
 *  repository root; nothing noticed because every other overlay caller is a `mode: "resource"` tmpdir
 *  fixture with no symlinks in it. Measured on this tree before unifying: every selector row is
 *  byte-identical either way and `trackedFiles` moves by exactly the excluded count, which is why the
 *  exclusion is REPORTED rather than silently dropped. */
function eslintTrackedPaths(root: string, supplied?: readonly string[]): EslintTrackedPopulation {
  const candidates = supplied ?? readPolicyRepositoryInventory(root).trackedPaths;
  const paths: string[] = [];
  const excludedNonFilePaths: string[] = [];
  for (const path of candidates) {
    assertPolicyRepoPath(path, "config-snapshot ESLint tracked path");
    const target = resolve(root, path);
    if (!existsSync(target)) {
      throw new Error(`config-snapshot ESLint tracked path is absent from the transaction: ${path}`);
    }
    const canonical = realpathSync(target);
    const rel = relative(root, canonical);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`config-snapshot ESLint tracked path is not a contained transaction file: ${path}`);
    }
    (statSync(canonical).isFile() ? paths : excludedNonFilePaths).push(path);
  }
  return { paths, excludedNonFilePaths };
}

export async function snapshotEslintConfig(root: string, config: string, suppliedTrackedPaths?: readonly string[]): Promise<EslintConfigSnapshot> {
  const [loaded, defaultConfig] = await Promise.all([loadEslintConfig(root, config), loadEslintDefaultConfig()]);
  const model = nativeEslintModel(root, loaded, defaultConfig, config);
  const { paths: trackedPaths, excludedNonFilePaths } = eslintTrackedPaths(root, suppliedTrackedPaths);
  if (trackedPaths.length === 0) {
    throw new Error("ESLint selector population has zero tracked files");
  }
  const selectors = [...globalSelectorSnapshots(root, trackedPaths, model), ...localSelectorSnapshots(root, trackedPaths, model)];
  if (selectors.length === 0) {
    throw new Error(`${config} resolved zero ESLint selector values`);
  }
  return { version: 1, runner: "eslint", config, trackedFiles: trackedPaths.length, excludedNonFilePaths, entries: model.configs.length, selectors };
}

/** Resolve an already-enumerated path set through ESLint's native flat-config selectors and ignores. */
export async function eslintConfiguredPaths(root: string, config: string, paths: readonly string[]): Promise<readonly string[]> {
  const [loaded, defaultConfig] = await Promise.all([loadEslintConfig(root, config), loadEslintDefaultConfig()]);
  const model = nativeEslintModel(root, loaded, defaultConfig, config);
  const selection = new ConfigArray([...model.globals, ...model.baseSelection], { basePath: root }).normalizeSync();
  return paths.filter((path) => selection.getConfig(resolve(root, path)) !== undefined);
}

export async function runConfigSnapshot(root: string, rest: readonly string[], eslintPopulation?: readonly string[]): Promise<number> {
  const [runner, config, ...unknown] = rest;
  if (runner === undefined || !isRunner(runner) || config === undefined || unknown.length > 0) {
    throw new UsageError(CONFIG_SNAPSHOT_HELP);
  }
  const safeConfig = configPath(config);
  let snapshot: ConfigSnapshot;
  if (runner === "vitest") {
    snapshot = await snapshotVitestConfig(root, safeConfig);
  } else if (runner === "eslint") {
    snapshot = await snapshotEslintConfig(root, safeConfig, eslintPopulation);
  } else {
    snapshot = await snapshotDepcruiseConfig(root, safeConfig);
  }
  process.stdout.write(`${JSON.stringify(snapshot)}\n`);
  return EXIT.clean;
}
