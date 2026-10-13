// Synchronous client for the private native-config snapshot worker. Gates remain synchronous; executable
// runner config is evaluated only in the narrow niced child, and the parent accepts no malformed/partial JSON.

import process from "node:process";
import { fileURLToPath } from "node:url";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import type {
  ConfigSelectorSnapshot,
  ConfigSnapshot,
  ConfigSnapshotRead,
  ConfigSnapshotReadOptions,
  ConfigSnapshotRunner,
  DepcruiseConfigSnapshot,
  DepcruiseConfigSnapshotField,
  DepcruiseSelectorSnapshot,
  VitestConfigSnapshot,
  VitestConfigSnapshotField,
} from "../contract/config-snapshot.ts";
import { DEPCRUISE_CONFIG_SNAPSHOT_FIELDS, VITEST_CONFIG_SNAPSHOT_FIELDS } from "../contract/config-snapshot.ts";
import { materializeConfigSnapshotTransaction } from "../ops/config-snapshot-transaction.ts";

const SNAPSHOT_ENTRY = fileURLToPath(new URL("../ops/config-snapshot-entry.ts", import.meta.url));
const SNAPSHOT_TIMEOUT_BASE_MS = 30_000;
const SNAPSHOT_TIMEOUT_MS = budget(SNAPSHOT_TIMEOUT_BASE_MS);
const SNAPSHOT_MAX_BUFFER = 16_777_216;

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
  // @orb-waive caught-failure-ownership(catch): readConfigSnapshot turns undefined into an explicit unreadable result that the liveness gate reports. Ends if malformed JSON can produce an ok snapshot.
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
  return parseDepcruiseSnapshot(snapshot, config);
}

export function readConfigSnapshot<R extends ConfigSnapshotRunner>(
  root: string,
  runner: R,
  config: string,
  options?: ConfigSnapshotReadOptions,
): ConfigSnapshotRead<R>;
export function readConfigSnapshot(
  root: string,
  runner: ConfigSnapshotRunner,
  config: string,
  options: ConfigSnapshotReadOptions = {},
): ConfigSnapshotRead<ConfigSnapshotRunner> {
  const overlay = options.overlay ?? {};
  let transaction: ReturnType<typeof materializeConfigSnapshotTransaction> | undefined;
  let child: ReturnType<typeof runNicedSync>;
  // @orb-waive caught-failure-ownership(error): native-config parse error: surfaced as a structured tool-error diagnostic in the config-snapshot report; the broken config is excluded from the snapshot
  try {
    transaction = Object.keys(overlay).length === 0 ? undefined : materializeConfigSnapshotTransaction({ root, overlay });
    const args = [SNAPSHOT_ENTRY, runner, config];
    child = runNicedSync(process.execPath, args, {
      cwd: transaction === undefined ? root : transaction.root,
      maxBuffer: SNAPSHOT_MAX_BUFFER,
      timeout: SNAPSHOT_TIMEOUT_MS,
    });
  } catch (error) {
    return { kind: "unreadable", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    transaction?.cleanup();
  }
  if (child.status !== 0) {
    const detail = child.stderr.trim() || child.stdout.trim() || `child exited ${String(child.status)}`;
    return { kind: "unreadable", detail };
  }
  const snapshot = parseSnapshot(child.stdout.trim(), runner, config);
  return snapshot === undefined ? { kind: "unreadable", detail: "config-snapshot emitted malformed or empty JSON" } : { kind: "ok", snapshot };
}
