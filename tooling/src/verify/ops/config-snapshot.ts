// Native config observation for synchronous structural gates. The private worker process is the async
// boundary; the public verify CLI delegates here too. Each runner loads through its public API, then emits data only.
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import type {
  ConfigSelectorSnapshot,
  ConfigSnapshot,
  ConfigSnapshotRunner,
  DepcruiseConfigSnapshot,
  DepcruiseConfigSnapshotField,
  DepcruiseSelectorSnapshot,
  EslintFileAdmission,
  VitestConfigSnapshot,
  VitestConfigSnapshotField,
} from "../contract/config-snapshot.ts";
import { CONFIG_SNAPSHOT_RUNNERS } from "../contract/config-snapshot.ts";

refuseDirectInvocation(import.meta.url, "pnpm exec node tooling/src/verify/cli.ts config-snapshot <vitest|depcruise> <repo-relative-config>");

export const CONFIG_SNAPSHOT_HELP =
  "usage: node tooling/src/verify/cli.ts config-snapshot <vitest|depcruise> <repo-relative-config>\n  Emits the runner's natively loaded selector fields as strict JSON.";

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
  readonly test: NativeVitestConfig;
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
  const rootConfig = resolved.test;
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

function depcruiseArrayOwner(owner: string, index: number, entry: unknown, names: Set<string>): string {
  const positional = `${owner}[${String(index)}]`;
  if (owner !== "config.forbidden") {
    return positional;
  }
  if (typeof entry !== "object" || entry === null || !("name" in entry) || typeof entry.name !== "string" || entry.name === "") {
    throw new Error(`${positional} has no rule name`);
  }
  if (names.has(entry.name)) {
    throw new Error(`${owner} has duplicate rule name ${entry.name}`);
  }
  names.add(entry.name);
  return `${owner}:${entry.name}`;
}

function collectDepcruiseSelectors(value: unknown, owner: string, selectors: DepcruiseSelectorSnapshot[]): void {
  if (Array.isArray(value)) {
    const names = new Set<string>();
    for (const [index, entry] of value.entries()) {
      collectDepcruiseSelectors(entry, depcruiseArrayOwner(owner, index, entry, names), selectors);
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

/** Observe admission and parser program requests through ESLint's effective configuration. */
export async function readEslintFileAdmissions(root: string, config: string, paths: readonly string[]): Promise<readonly EslintFileAdmission[]> {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ cwd: root, overrideConfigFile: resolve(root, config) });
  const admitted: EslintFileAdmission[] = [];
  for (const path of paths) {
    const effective = await eslint.calculateConfigForFile(resolve(root, path));
    if (effective !== undefined) {
      const options = effective.languageOptions?.parserOptions;
      admitted.push({
        path,
        requiresTypeInformation: Boolean(options?.project) || Boolean(options?.projectService) || Boolean(options?.programs),
        hasEnabledRules: Object.values(effective.rules ?? {}).some((setting) => {
          const severity = Array.isArray(setting) ? setting[0] : setting;
          return severity === "error" || severity === "warn" || severity === 1 || severity === 2;
        }),
      });
    }
  }
  return admitted;
}

/** Preserve input order while asking ESLint's native configuration whether each path is selected. */
export async function eslintConfiguredPaths(root: string, config: string, paths: readonly string[]): Promise<readonly string[]> {
  return (await readEslintFileAdmissions(root, config, paths)).map(({ path }) => path);
}

export async function runConfigSnapshot(root: string, rest: readonly string[]): Promise<number> {
  const [runner, config, ...unknown] = rest;
  if (runner === undefined || !isRunner(runner) || config === undefined || unknown.length > 0) {
    throw new UsageError(CONFIG_SNAPSHOT_HELP);
  }
  const safeConfig = configPath(config);
  let snapshot: ConfigSnapshot;
  if (runner === "vitest") {
    snapshot = await snapshotVitestConfig(root, safeConfig);
  } else {
    snapshot = await snapshotDepcruiseConfig(root, safeConfig);
  }
  process.stdout.write(`${JSON.stringify(snapshot)}\n`);
  return EXIT.clean;
}
