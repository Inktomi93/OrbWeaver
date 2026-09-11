// Native config observation for synchronous structural gates. The private worker process is the async
// boundary; the public verify CLI delegates here too. Each runner loads through its public API, then emits data only.
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
  EslintSelectorSnapshot,
  EslintSelectorValue,
  VitestConfigSnapshot,
  VitestConfigSnapshotField,
} from "../contract/config-snapshot.ts";
import { CONFIG_SNAPSHOT_RUNNERS } from "../contract/config-snapshot.ts";
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string");
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

type NativeEslintConfig = Record<string, unknown> & {
  basePath?: unknown;
  files?: unknown;
  ignores?: unknown;
  name?: unknown;
};

const MARKER_KEY = "__orbConfigSnapshotMarker";
const MARKER_SCHEMA = {
  [MARKER_KEY]: {
    merge(first: unknown, second: unknown): unknown {
      return [...((first as readonly string[] | undefined) ?? []), ...((second as readonly string[] | undefined) ?? [])];
    },
    validate(value: unknown): void {
      if (!isStringArray(value)) {
        throw new TypeError("config-snapshot marker must be a string array");
      }
    },
  },
};

function eslintSelectorValues(value: unknown, identity: string): readonly EslintSelectorValue[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${identity} resolved to an empty or non-array selector`);
  }
  return value.map((entry, position) => {
    if (typeof entry === "string" && entry !== "") {
      return entry;
    }
    if (Array.isArray(entry) && entry.length > 0 && entry.every((part): part is string => typeof part === "string" && part !== "")) {
      return entry;
    }
    throw new Error(`${identity}[${String(position)}] resolved to an unsupported selector value`);
  });
}

function eslintOwner(config: NativeEslintConfig, index: number): string {
  const name = config.name;
  return typeof name === "string" && name !== "" ? `config[${String(index)}]:${name}` : `config[${String(index)}]`;
}

function projected(
  config: NativeEslintConfig,
  marker: string,
  files: readonly EslintSelectorValue[] | undefined,
  ignores: readonly EslintSelectorValue[] | undefined,
): NativeEslintConfig {
  const row: NativeEslintConfig = { [MARKER_KEY]: [marker] };
  if (config.basePath !== undefined) {
    row.basePath = config.basePath;
  }
  if (files !== undefined) {
    row.files = files;
  }
  if (ignores !== undefined) {
    row.ignores = ignores;
  }
  return row;
}

function projectedGlobal(config: NativeEslintConfig, ignores: readonly EslintSelectorValue[]): NativeEslintConfig {
  const row: NativeEslintConfig = { ignores };
  if (config.basePath !== undefined) {
    row.basePath = config.basePath;
  }
  return row;
}

function projectedBaseSelection(config: NativeEslintConfig): NativeEslintConfig {
  const row: NativeEslintConfig = { files: config.files };
  if (config.ignores !== undefined) {
    row.ignores = config.ignores;
  }
  if (config.basePath !== undefined) {
    row.basePath = config.basePath;
  }
  return row;
}

function markerSet(array: ConfigArray, root: string, rel: string): ReadonlySet<string> {
  const value = Reflect.get(array.getConfig(resolve(root, rel)) ?? {}, MARKER_KEY);
  return new Set(isStringArray(value) ? value : []);
}

function changedGlobalPopulation(root: string, paths: readonly string[], before: ConfigArray, after: ConfigArray): number {
  let members = 0;
  for (const path of paths) {
    const absolute = resolve(root, path);
    if (before.isFileIgnored(absolute) !== after.isFileIgnored(absolute)) {
      members += 1;
    }
  }
  return members;
}

function globalPopulation(root: string, paths: readonly string[], array: ConfigArray): number {
  let members = 0;
  for (const path of paths) {
    if (array.isFileIgnored(resolve(root, path))) {
      members += 1;
    }
  }
  return members;
}

interface GlobalPrefixInput {
  readonly root: string;
  readonly configs: readonly NativeEslintConfig[];
  readonly global: ReadonlySet<NativeEslintConfig>;
  readonly endIndex: number;
  readonly endValues?: readonly EslintSelectorValue[];
  readonly baseGlobals: readonly NativeEslintConfig[];
}

function globalPrefix(input: GlobalPrefixInput): ConfigArray {
  const rows: NativeEslintConfig[] = [...input.baseGlobals];
  for (let index = 0; index <= input.endIndex; index += 1) {
    const config = input.configs[index];
    if (config === undefined || !input.global.has(config)) {
      continue;
    }
    const values =
      index === input.endIndex && input.endValues !== undefined
        ? input.endValues
        : eslintSelectorValues(config.ignores, `${eslintOwner(config, index)}.ignores`);
    if (values.length > 0) {
      rows.push(projectedGlobal(config, values));
    }
  }
  return new ConfigArray(rows, { basePath: input.root }).normalizeSync();
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

interface NativeEslintModel {
  readonly configs: readonly NativeEslintConfig[];
  readonly global: ReadonlySet<NativeEslintConfig>;
  readonly globals: readonly NativeEslintConfig[];
  readonly defaultGlobals: readonly NativeEslintConfig[];
  readonly baseSelection: readonly NativeEslintConfig[];
}

function configObjects(native: ConfigArray, label: string): readonly NativeEslintConfig[] {
  return native.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${label}[${String(index)}] did not resolve to an object`);
    }
    return entry as NativeEslintConfig;
  });
}

function nativeEslintModel(root: string, loaded: unknown, defaultConfig: unknown, config: string): NativeEslintModel {
  const native = new ConfigArray(loaded, { basePath: root, extraConfigTypes: ["array", "function"] }).normalizeSync();
  if (native.length === 0) {
    throw new Error(`${config} resolved zero config entries`);
  }
  const configs = configObjects(native, "config");
  const global = new Set(native.ignores as NativeEslintConfig[]);
  const authoredGlobals = configs
    .filter((entry) => global.has(entry))
    .map((entry, index) => projectedGlobal(entry, eslintSelectorValues(entry.ignores, `${eslintOwner(entry, index)}.ignores`)));
  const defaults = new ConfigArray(defaultConfig, { basePath: root, extraConfigTypes: ["array", "function"] }).normalizeSync();
  const defaultObjects = configObjects(defaults, "ESLint.defaultConfig");
  const defaultGlobal = new Set(defaults.ignores as NativeEslintConfig[]);
  const defaultGlobals = defaultObjects
    .filter((entry) => defaultGlobal.has(entry))
    .map((entry, index) => projectedGlobal(entry, eslintSelectorValues(entry.ignores, `ESLint.defaultConfig[${String(index)}].ignores`)));
  const globals = [...defaultGlobals, ...authoredGlobals];
  const baseSelection = [
    ...defaultObjects.filter((entry) => entry.files !== undefined).map(projectedBaseSelection),
    ...configs.filter((entry) => !global.has(entry) && entry.files !== undefined).map(projectedBaseSelection),
  ];
  return { configs, global, globals, defaultGlobals, baseSelection };
}

function globalSelectorSnapshots(root: string, trackedPaths: readonly string[], model: NativeEslintModel): readonly EslintSelectorSnapshot[] {
  const selectors: EslintSelectorSnapshot[] = [];
  for (const [index, entry] of model.configs.entries()) {
    if (!model.global.has(entry)) {
      continue;
    }
    const owner = eslintOwner(entry, index);
    const ignores = eslintSelectorValues(entry.ignores, `${owner}.ignores`);
    for (const [position, value] of ignores.entries()) {
      const negative = typeof value === "string" && value.startsWith("!");
      const after = negative
        ? globalPrefix({
            root,
            configs: model.configs,
            global: model.global,
            endIndex: index,
            endValues: ignores.slice(0, position + 1),
            baseGlobals: model.defaultGlobals,
          })
        : new ConfigArray([...model.defaultGlobals, projectedGlobal(entry, [value])], { basePath: root }).normalizeSync();
      const members = negative
        ? changedGlobalPopulation(
            root,
            trackedPaths,
            globalPrefix({
              root,
              configs: model.configs,
              global: model.global,
              endIndex: index,
              endValues: ignores.slice(0, position),
              baseGlobals: model.defaultGlobals,
            }),
            after,
          )
        : globalPopulation(root, trackedPaths, after);
      selectors.push({ owner, field: "ignores", position, value, scope: "global-ignore", members });
    }
  }
  return selectors;
}

interface LocalObservation {
  readonly snapshot: Omit<EslintSelectorSnapshot, "members">;
  readonly before: string | null;
  readonly after: string;
}

interface LocalPlan {
  readonly fileRows: readonly NativeEslintConfig[];
  readonly fileObservations: readonly LocalObservation[];
  readonly ignorePlans: readonly IgnoreObservationPlan[];
}

interface MutableLocalPlan {
  readonly fileRows: NativeEslintConfig[];
  readonly fileObservations: LocalObservation[];
  readonly ignorePlans: IgnoreObservationPlan[];
}

interface IgnoreObservationPlan {
  readonly observation: LocalObservation;
  readonly rows: readonly NativeEslintConfig[];
}

interface LocalEntryInput {
  readonly entry: NativeEslintConfig;
  readonly owner: string;
  readonly files: readonly EslintSelectorValue[];
  readonly ignores: readonly EslintSelectorValue[] | undefined;
  readonly plan: MutableLocalPlan;
}

interface LocalIgnoreInput {
  readonly entry: NativeEslintConfig;
  readonly owner: string;
  readonly files: readonly EslintSelectorValue[] | undefined;
  readonly ignores: readonly EslintSelectorValue[];
  readonly plan: MutableLocalPlan;
}

function appendFileObservations(input: LocalEntryInput): void {
  for (const [position, value] of input.files.entries()) {
    const id = `${input.owner}.files[${String(position)}]`;
    const negative = typeof value === "string" && value.startsWith("!");
    const before = negative ? `${id}:before` : null;
    const after = `${id}:after`;
    if (before !== null) {
      input.plan.fileRows.push(projected(input.entry, before, input.files.slice(0, position), input.ignores));
    }
    input.plan.fileRows.push(projected(input.entry, after, negative ? input.files.slice(0, position + 1) : [value], input.ignores));
    input.plan.fileObservations.push({ snapshot: { owner: input.owner, field: "files", position, value, scope: "files" }, before, after });
  }
}

function appendIgnoreObservations(input: LocalIgnoreInput): void {
  for (const [position, value] of input.ignores.entries()) {
    const id = `${input.owner}.ignores[${String(position)}]`;
    const before = `${id}:before`;
    const after = `${id}:after`;
    input.plan.ignorePlans.push({
      observation: { snapshot: { owner: input.owner, field: "ignores", position, value, scope: "local-ignore" }, before, after },
      rows: [
        projected(input.entry, before, input.files, position === 0 ? undefined : input.ignores.slice(0, position)),
        projected(input.entry, after, input.files, input.ignores.slice(0, position + 1)),
      ],
    });
  }
}

function localPlan(model: NativeEslintModel): LocalPlan {
  const plan: MutableLocalPlan = { fileRows: [], fileObservations: [], ignorePlans: [] };
  for (const [index, entry] of model.configs.entries()) {
    const owner = eslintOwner(entry, index);
    const files = entry.files === undefined ? undefined : eslintSelectorValues(entry.files, `${owner}.files`);
    const ignores = entry.ignores === undefined ? undefined : eslintSelectorValues(entry.ignores, `${owner}.ignores`);
    if (model.global.has(entry)) {
      continue;
    }
    if (files !== undefined) {
      const input = { entry, owner, files, ignores, plan };
      appendFileObservations(input);
    }
    if (ignores !== undefined) {
      appendIgnoreObservations({ entry, owner, files, ignores, plan });
    }
  }
  return plan;
}

function observedPopulations(
  root: string,
  trackedPaths: readonly string[],
  configs: readonly NativeEslintConfig[],
  observations: readonly LocalObservation[],
): readonly EslintSelectorSnapshot[] {
  const populations = new Map(observations.map(({ after }) => [after, 0]));
  const markerConfigs = new ConfigArray(configs, { basePath: root, schema: MARKER_SCHEMA }).normalizeSync();
  for (const path of trackedPaths) {
    const markers = markerSet(markerConfigs, root, path);
    for (const observation of observations) {
      const beforeMatches = observation.before === null ? false : markers.has(observation.before);
      if (beforeMatches !== markers.has(observation.after)) {
        populations.set(observation.after, (populations.get(observation.after) ?? 0) + 1);
      }
    }
  }
  return observations.map((observation) => ({ ...observation.snapshot, members: populations.get(observation.after) ?? 0 }));
}

function localSelectorSnapshots(root: string, trackedPaths: readonly string[], model: NativeEslintModel): readonly EslintSelectorSnapshot[] {
  const plan = localPlan(model);
  const baseConfig = new ConfigArray([...model.globals, ...model.baseSelection], { basePath: root }).normalizeSync();
  const selected = new Set(trackedPaths.map((path) => resolve(root, path)).filter((path) => baseConfig.getConfig(path) !== undefined));
  // Native selection is invariant across local counterfactuals; keep each counterfactual's own rows separate.
  const base: readonly NativeEslintConfig[] = [...model.globals, { files: [(path: string): boolean => selected.has(path)] }];
  const files = observedPopulations(root, trackedPaths, [...base, ...plan.fileRows], plan.fileObservations);
  const ignores = plan.ignorePlans.flatMap(({ observation, rows }) => observedPopulations(root, trackedPaths, [...base, ...rows], [observation]));
  return [...files, ...ignores];
}

function eslintTrackedPaths(root: string, supplied?: readonly string[]): readonly string[] {
  if (supplied === undefined) {
    return readPolicyRepositoryInventory(root).trackedPaths;
  }
  return supplied.map((path) => {
    assertPolicyRepoPath(path, "config-snapshot ESLint tracked path");
    const target = resolve(root, path);
    if (!existsSync(target)) {
      throw new Error(`config-snapshot ESLint tracked path is absent from the transaction: ${path}`);
    }
    const canonical = realpathSync(target);
    const rel = relative(root, canonical);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !statSync(canonical).isFile()) {
      throw new Error(`config-snapshot ESLint tracked path is not a contained transaction file: ${path}`);
    }
    return path;
  });
}

export async function snapshotEslintConfig(root: string, config: string, suppliedTrackedPaths?: readonly string[]): Promise<EslintConfigSnapshot> {
  const [loaded, defaultConfig] = await Promise.all([loadEslintConfig(root, config), loadEslintDefaultConfig()]);
  const model = nativeEslintModel(root, loaded, defaultConfig, config);
  const trackedPaths = eslintTrackedPaths(root, suppliedTrackedPaths);
  if (trackedPaths.length === 0) {
    throw new Error("ESLint selector population has zero tracked files");
  }
  const selectors = [...globalSelectorSnapshots(root, trackedPaths, model), ...localSelectorSnapshots(root, trackedPaths, model)];
  if (selectors.length === 0) {
    throw new Error(`${config} resolved zero ESLint selector values`);
  }
  return { version: 1, runner: "eslint", config, trackedFiles: trackedPaths.length, entries: model.configs.length, selectors };
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
