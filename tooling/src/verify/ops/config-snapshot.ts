// Native config observation for synchronous structural gates. The CLI process is the async boundary:
// it lets Vitest load executable config through its public loader, then emits data only.
import process from "node:process";
import { EXIT } from "../../_shared/exit-contract.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import type { ConfigSelectorSnapshot, ConfigSnapshot, ConfigSnapshotField, ConfigSnapshotRunner } from "../contract/config-snapshot.ts";
import { CONFIG_SNAPSHOT_RUNNERS } from "../contract/config-snapshot.ts";

export const CONFIG_SNAPSHOT_HELP =
  "usage: node tooling/src/verify/cli.ts config-snapshot vitest <repo-relative-config>\n  Emits the runner's natively loaded selector fields as strict JSON.";

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

function selector(owner: string, field: ConfigSnapshotField, value: unknown): ConfigSelectorSnapshot | undefined {
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

export async function snapshotVitestConfig(root: string, config: string): Promise<ConfigSnapshot> {
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

export async function runConfigSnapshot(root: string, rest: readonly string[]): Promise<number> {
  const [runner, config, ...unknown] = rest;
  if (runner === undefined || !isRunner(runner) || config === undefined || unknown.length > 0) {
    throw new UsageError(CONFIG_SNAPSHOT_HELP);
  }
  const snapshot = await snapshotVitestConfig(root, configPath(config));
  process.stdout.write(`${JSON.stringify(snapshot)}\n`);
  return EXIT.clean;
}
