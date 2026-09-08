// Synchronous client for the verify CLI's native config snapshot. Gates remain synchronous; executable
// runner config is evaluated only in the niced child, and the parent accepts no malformed/partial JSON.
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { ConfigSelectorSnapshot, ConfigSnapshot, ConfigSnapshotField, ConfigSnapshotRunner } from "../contract/config-snapshot.ts";
import { CONFIG_SNAPSHOT_FIELDS, CONFIG_SNAPSHOT_RUNNERS } from "../contract/config-snapshot.ts";

const CLI = fileURLToPath(new URL("../cli.ts", import.meta.url));
const SNAPSHOT_TIMEOUT_MS = 30_000;
const SNAPSHOT_MAX_BUFFER = 16_777_216;

export type ConfigSnapshotRead = { readonly kind: "ok"; readonly snapshot: ConfigSnapshot } | { readonly kind: "unreadable"; readonly detail: string };

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
  if (typeof row.owner !== "string" || row.owner === "" || !oneOf<ConfigSnapshotField>(row.field, CONFIG_SNAPSHOT_FIELDS)) {
    return;
  }
  if (!isStringArray(row.values)) {
    return;
  }
  return { owner: row.owner, field: row.field, values: row.values };
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
  const snapshot = value as { readonly version?: unknown; readonly runner?: unknown; readonly config?: unknown; readonly selectors?: unknown };
  if (snapshot.version !== 1 || snapshot.runner !== runner || snapshot.config !== config || !Array.isArray(snapshot.selectors)) {
    return;
  }
  const selectors: ConfigSelectorSnapshot[] = [];
  for (const selectorValue of snapshot.selectors) {
    const row = parseSelector(selectorValue);
    if (row === undefined) {
      return;
    }
    selectors.push(row);
  }
  if (selectors.length === 0) {
    return;
  }
  return { version: 1, runner, config, selectors };
}

export function readConfigSnapshot(root: string, runner: ConfigSnapshotRunner, config: string): ConfigSnapshotRead {
  const child = runNicedSync(process.execPath, [CLI, "config-snapshot", runner, config], {
    cwd: root,
    maxBuffer: SNAPSHOT_MAX_BUFFER,
    timeout: SNAPSHOT_TIMEOUT_MS,
  });
  if (child.status !== 0) {
    const detail = child.stderr.trim() || child.stdout.trim() || `child exited ${String(child.status)}`;
    return { kind: "unreadable", detail };
  }
  const snapshot = parseSnapshot(child.stdout.trim(), runner, config);
  return snapshot === undefined ? { kind: "unreadable", detail: "config-snapshot emitted malformed or empty JSON" } : { kind: "ok", snapshot };
}

export function isConfigSnapshotRunner(value: string): value is ConfigSnapshotRunner {
  return oneOf(value, CONFIG_SNAPSHOT_RUNNERS);
}
