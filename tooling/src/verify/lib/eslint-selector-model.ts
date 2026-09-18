// THE ESLINT FLAT-CONFIG SELECTOR MODEL behind `ops/config-snapshot.ts#snapshotEslintConfig`: the native
// `ConfigArray` normalized once, its global-ignore and per-config selectors, and the COUNTERFACTUAL
// populations each selector value admits (a marker schema stamps which projected row claimed each tracked
// path, so a negated pattern is measured by what it changed). PURE over an already-loaded config — the
// loaders, the tracked-path door and the runner entry points stay in `ops/`. Split out at the size cap
// (2026-09-18); one-way: this module imports nothing from `ops/`.
import { resolve } from "node:path";
import { ConfigArray } from "@eslint/config-array";
import type { EslintSelectorSnapshot, EslintSelectorValue } from "../contract/config-snapshot.ts";

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string");
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

export function nativeEslintModel(root: string, loaded: unknown, defaultConfig: unknown, config: string): NativeEslintModel {
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

export function globalSelectorSnapshots(root: string, trackedPaths: readonly string[], model: NativeEslintModel): readonly EslintSelectorSnapshot[] {
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

export function localSelectorSnapshots(root: string, trackedPaths: readonly string[], model: NativeEslintModel): readonly EslintSelectorSnapshot[] {
  const plan = localPlan(model);
  const baseConfig = new ConfigArray([...model.globals, ...model.baseSelection], { basePath: root }).normalizeSync();
  const selected = new Set(trackedPaths.map((path) => resolve(root, path)).filter((path) => baseConfig.getConfig(path) !== undefined));
  // Native selection is invariant across local counterfactuals; keep each counterfactual's own rows separate.
  const base: readonly NativeEslintConfig[] = [...model.globals, { files: [(path: string): boolean => selected.has(path)] }];
  const files = observedPopulations(root, trackedPaths, [...base, ...plan.fileRows], plan.fileObservations);
  const ignores = plan.ignorePlans.flatMap(({ observation, rows }) => observedPopulations(root, trackedPaths, [...base, ...rows], [observation]));
  return [...files, ...ignores];
}
