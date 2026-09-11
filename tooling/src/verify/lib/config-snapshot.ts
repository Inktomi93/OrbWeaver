// Synchronous client for the private native-config snapshot worker. Gates remain synchronous; executable
// runner config is evaluated only in the narrow niced child, and the parent accepts no malformed/partial JSON.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type {
  ConfigSelectorSnapshot,
  ConfigSnapshot,
  ConfigSnapshotByRunner,
  ConfigSnapshotReadOptions,
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
import { DEPCRUISE_CONFIG_SNAPSHOT_FIELDS, VITEST_CONFIG_SNAPSHOT_FIELDS } from "../contract/config-snapshot.ts";
import { materializeConfigSnapshotTransaction } from "../ops/config-snapshot-transaction.ts";
import { readPolicyRepositoryInventory } from "./policy-repo-inventory.ts";

const SNAPSHOT_ENTRY = fileURLToPath(new URL("../ops/config-snapshot-entry.ts", import.meta.url));
const SNAPSHOT_TIMEOUT_MS = 30_000;
const SNAPSHOT_MAX_BUFFER = 16_777_216;

export type ConfigSnapshotRead<R extends ConfigSnapshotRunner> =
  | { readonly kind: "ok"; readonly snapshot: ConfigSnapshotByRunner[R] }
  | { readonly kind: "unreadable"; readonly detail: string };

function deletedByOverlay(path: string, overlay: Readonly<Record<string, string | null>>): boolean {
  return Object.entries(overlay).some(([entry, value]) => value === null && (path === entry || path.startsWith(`${entry}/`)));
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string");
}

function parseSelector(value: unknown): ConfigSelectorSnapshot | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const row = value as { readonly owner?: unknown; readonly field?: unknown; readonly values?: unknown };
  if (typeof row.owner !== "string" || row.owner === "" || !oneOf<VitestConfigSnapshotField>(row.field, VITEST_CONFIG_SNAPSHOT_FIELDS)) {
    return;
  }
  return isStringArray(row.values) ? { owner: row.owner, field: row.field, values: row.values } : undefined;
}

function isEslintSelectorValue(value: unknown): value is EslintSelectorValue {
  return typeof value === "string" || (isStringArray(value) && value.length > 0);
}

function parseEslintSelector(value: unknown): EslintSelectorSnapshot | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const row = value as {
    readonly field?: unknown;
    readonly members?: unknown;
    readonly owner?: unknown;
    readonly position?: unknown;
    readonly scope?: unknown;
    readonly value?: unknown;
  };
  if (
    typeof row.owner !== "string" ||
    row.owner === "" ||
    (row.field !== "files" && row.field !== "ignores") ||
    !Number.isSafeInteger(row.position) ||
    (row.position as number) < 0 ||
    !isEslintSelectorValue(row.value) ||
    (row.scope !== "files" && row.scope !== "local-ignore" && row.scope !== "global-ignore") ||
    !Number.isSafeInteger(row.members) ||
    (row.members as number) < 0
  ) {
    return;
  }
  return row as EslintSelectorSnapshot;
}

function parseVitestSnapshot(snapshot: Record<string, unknown>, config: string): VitestConfigSnapshot | undefined {
  const values = snapshot["selectors"];
  if (!Array.isArray(values)) {
    return;
  }
  const selectors = values.map(parseSelector);
  if (selectors.length === 0 || selectors.some((row) => row === undefined)) {
    return;
  }
  return { version: 1, runner: "vitest", config, selectors: selectors as ConfigSelectorSnapshot[] };
}

function parseEslintSnapshot(snapshot: Record<string, unknown>, config: string): EslintConfigSnapshot | undefined {
  const trackedFiles = snapshot["trackedFiles"];
  const entries = snapshot["entries"];
  const values = snapshot["selectors"];
  if (
    !Number.isSafeInteger(trackedFiles) ||
    (trackedFiles as number) <= 0 ||
    !Number.isSafeInteger(entries) ||
    (entries as number) <= 0 ||
    !Array.isArray(values)
  ) {
    return;
  }
  const selectors = values.map(parseEslintSelector);
  if (selectors.length === 0 || selectors.some((row) => row === undefined)) {
    return;
  }
  return {
    version: 1,
    runner: "eslint",
    config,
    trackedFiles: trackedFiles as number,
    entries: entries as number,
    selectors: selectors as EslintSelectorSnapshot[],
  };
}

function parseDepcruiseSelector(value: unknown): DepcruiseSelectorSnapshot | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const row = value as { readonly field?: unknown; readonly owner?: unknown; readonly position?: unknown; readonly value?: unknown };
  if (
    typeof row.owner !== "string" ||
    row.owner === "" ||
    !oneOf<DepcruiseConfigSnapshotField>(row.field, DEPCRUISE_CONFIG_SNAPSHOT_FIELDS) ||
    !Number.isSafeInteger(row.position) ||
    (row.position as number) < 0 ||
    typeof row.value !== "string" ||
    row.value === ""
  ) {
    return;
  }
  return row as DepcruiseSelectorSnapshot;
}

function parseDepcruiseSnapshot(snapshot: Record<string, unknown>, config: string): DepcruiseConfigSnapshot | undefined {
  const effectiveRules = snapshot["effectiveRules"];
  const values = snapshot["selectors"];
  if (!Number.isSafeInteger(effectiveRules) || (effectiveRules as number) <= 0 || !Array.isArray(values)) {
    return;
  }
  const selectors = values.map(parseDepcruiseSelector);
  if (selectors.length === 0 || selectors.some((row) => row === undefined)) {
    return;
  }
  return {
    version: 1,
    runner: "depcruise",
    config,
    effectiveRules: effectiveRules as number,
    selectors: selectors as DepcruiseSelectorSnapshot[],
  };
}

function parseSnapshot(text: string, runner: ConfigSnapshotRunner, config: string): ConfigSnapshot | undefined {
  let value: unknown;
  // @orb-gate-ignore caught-failure-ownership(default:catch): readConfigSnapshot turns undefined into an explicit unreadable result that the liveness gate reports. Ends if malformed JSON can produce an ok snapshot.
  try {
    value = JSON.parse(text);
  } catch {
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const snapshot = value as Record<string, unknown>;
  if (snapshot["version"] !== 1 || snapshot["runner"] !== runner || snapshot["config"] !== config) {
    return;
  }
  if (runner === "vitest") {
    return parseVitestSnapshot(snapshot, config);
  }
  if (runner === "eslint") {
    return parseEslintSnapshot(snapshot, config);
  }
  return parseDepcruiseSnapshot(snapshot, config);
}

export function readConfigSnapshot(root: string, runner: "vitest", config: string, options?: ConfigSnapshotReadOptions): ConfigSnapshotRead<"vitest">;
export function readConfigSnapshot(root: string, runner: "eslint", config: string, options?: ConfigSnapshotReadOptions): ConfigSnapshotRead<"eslint">;
export function readConfigSnapshot(root: string, runner: "depcruise", config: string, options?: ConfigSnapshotReadOptions): ConfigSnapshotRead<"depcruise">;
export function readConfigSnapshot(
  root: string,
  runner: ConfigSnapshotRunner,
  config: string,
  options: ConfigSnapshotReadOptions = {},
): ConfigSnapshotRead<ConfigSnapshotRunner> {
  const overlay = options.overlay ?? {};
  const cache = join(root, ".cache");
  let transaction: ReturnType<typeof materializeConfigSnapshotTransaction> | undefined;
  let requestDirectory: string | undefined;
  let child: ReturnType<typeof runNicedSync>;
  try {
    transaction = Object.keys(overlay).length === 0 ? undefined : materializeConfigSnapshotTransaction({ root, overlay });
    const args = [SNAPSHOT_ENTRY, runner, config];
    if (transaction !== undefined && runner === "eslint") {
      const population = readPolicyRepositoryInventory(root).trackedPaths.filter((path) => !deletedByOverlay(path, overlay));
      mkdirSync(cache, { recursive: true });
      requestDirectory = mkdtempSync(join(cache, "config-snapshot-request-"));
      const manifest = join(requestDirectory, "eslint-population.json");
      writeFileSync(manifest, JSON.stringify(population));
      args.push("--eslint-population", manifest);
    }
    child = runNicedSync(process.execPath, args, {
      cwd: transaction === undefined ? root : transaction.root,
      maxBuffer: SNAPSHOT_MAX_BUFFER,
      timeout: SNAPSHOT_TIMEOUT_MS,
    });
  } catch (error) {
    return { kind: "unreadable", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    transaction?.cleanup();
    if (requestDirectory !== undefined) {
      rmSync(requestDirectory, { recursive: true, force: true });
    }
  }
  if (child.status !== 0) {
    const detail = child.stderr.trim() || child.stdout.trim() || `child exited ${String(child.status)}`;
    return { kind: "unreadable", detail };
  }
  const snapshot = parseSnapshot(child.stdout.trim(), runner, config);
  return snapshot === undefined ? { kind: "unreadable", detail: "config-snapshot emitted malformed or empty JSON" } : { kind: "ok", snapshot };
}
