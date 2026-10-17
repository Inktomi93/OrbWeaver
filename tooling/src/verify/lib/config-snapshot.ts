// Native config observation: synchronous gates use the existing private snapshot worker; async ESLint
// admission reads its actual effective ConfigArray and native-owner requirements. Neither route creates
// compiler Programs, accepts malformed discovery data, or changes the snapshot-worker wire protocol.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { execNicedSync, runNicedSync } from "@orb/tooling/floor/process/proc";
import type {
  ConfigSelectorSnapshot,
  ConfigSnapshot,
  ConfigSnapshotRead,
  ConfigSnapshotReadOptions,
  ConfigSnapshotRunner,
  DepcruiseConfigSnapshot,
  DepcruiseConfigSnapshotField,
  DepcruiseSelectorSnapshot,
  EslintFileAdmission,
  EslintNativeMetadataFamily,
  VitestConfigSnapshot,
  VitestConfigSnapshotField,
} from "../contract/config-snapshot.ts";
import { DEPCRUISE_CONFIG_SNAPSHOT_FIELDS, VITEST_CONFIG_SNAPSHOT_FIELDS } from "../contract/config-snapshot.ts";
import { readEslintFileAdmissions } from "../ops/config-snapshot.ts";
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

/** The discovery wire reader (#2212). `count` and `files` are serialized from the same producer-owned
 *  enumeration, so equality proves envelope consistency rather than independent completion. Malformed JSON
 *  and inconsistent envelopes both refuse with this discovery site named; neither is evidence of ENOBUFS. */
export function parsedDiscovery(text: string): readonly string[] {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error("ESLint discovery child emitted malformed serialized population data; no lint verdict is available", { cause: error });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("ESLint discovery child emitted a malformed population envelope (expected { count, files })");
  }
  const { count, files } = value as { readonly count?: unknown; readonly files?: unknown };
  if (!(Array.isArray(files) && files.every((path): path is string => typeof path === "string" && path !== ""))) {
    throw new Error("ESLint discovery child emitted a malformed filename list");
  }
  if (!Number.isSafeInteger(count)) {
    throw new Error("ESLint discovery child emitted a malformed population envelope (count must be a safe integer)");
  }
  if (files.length !== count) {
    throw new Error(
      `ESLint discovery envelope is inconsistent: count ${String(count)} does not match ${String(files.length)} filenames; no lint verdict is available`,
    );
  }
  return files;
}

/** #2211: a discovery population once exceeded node's default capture ceiling, which kills the child with
 *  ENOBUFS rather than returning clipped stdout. The current fenced repository measured about 446 KiB on
 *  2026-09-13, so that incident no longer reproduces; 64 MiB remains a named production fuse. */
const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const DISCOVERY_BUFFER_MIB = 64;
export const DISCOVERY_MAX_BUFFER_BYTES = DISCOVERY_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;

/** THE DISCOVERY DOOR, and the ceiling is NAMED HERE rather than left to node (#2211/#2212). The child writes
 *  the whole producer-owned filename population to stdout. Node does not return a clipped value when the
 *  capture ceiling is exceeded; it kills the child with ENOBUFS. The current fenced payload is below node's
 *  default, while the explicit 64 MiB ceiling preserves a stable fuse as the repository grows.
 *
 *  A BLOWN CEILING REFUSES BY NAME. `spawnSync`'s bare "spawnSync nice ENOBUFS" names the wrapper, not the
 *  population that outgrew it, and an operator reading that has no way to know WHICH door died or what to do
 *  — #2211 took a barrier tail plus a stack frame to attribute. The translation below states the site, the
 *  ceiling it was given, and the remedy, so the next occurrence is self-describing at the point of failure.
 *  `maxBuffer` is a parameter so a control can drive the refusal with a deliberately tiny ceiling; a fuse
 *  nobody has ever seen blow is a fuse nobody knows is wired. */
export function readDiscoveredPopulation(root: string, maxBuffer: number = DISCOVERY_MAX_BUFFER_BYTES, patterns: readonly string[] = []): readonly string[] {
  try {
    return parsedDiscovery(execNicedSync("pnpm", ["exec", "node", SNAPSHOT_ENTRY, "eslint-discovery", ...patterns], { cwd: root, maxBuffer }));
  } catch (error) {
    if (!isBufferOverflow(error)) {
      throw error;
    }
    throw new Error(
      `ESLint discovery outgrew its ${String(maxBuffer)}-byte stdout ceiling (tooling/src/verify/ops/eslint.ts, DISCOVERY_BUFFER_MIB): the child was ` +
        "KILLED with ENOBUFS rather than truncated, so the admitted population could not be enumerated and NO lint verdict exists for this run. " +
        "Raise the ceiling, or hand the population over a file instead of stdout.",
      { cause: error },
    );
  }
}

/** ENOBUFS as node reports it from `execFileSync`: the code on the error, with the message as the fallback
 *  for a wrapper that rebuilds the error (`withCapturedStderr` folds captured stderr into `.message`). */
function isBufferOverflow(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, message } = error as { readonly code?: unknown; readonly message?: unknown };
  return code === "ENOBUFS" || (typeof message === "string" && message.includes("ENOBUFS"));
}

/** Native discovery and effective ConfigArray admission must agree on the exact ordered population. */
export async function readAdmittedEslintPopulation(root: string, config: string, discovered: readonly string[]): Promise<readonly EslintFileAdmission[]> {
  const admitted = await readEslintFileAdmissions(root, config, discovered);
  if (admitted.length !== discovered.length || admitted.some(({ path }, index) => path !== discovered[index])) {
    throw new Error("ESLint discovery and native ConfigArray admission resolved different filename populations");
  }
  return admitted;
}

function readActiveTypedInputs(root: string, families: readonly EslintNativeMetadataFamily[], activeRules: ReadonlySet<string>): void {
  for (const family of families) {
    if (family.rules.some((rule) => activeRules.has(rule))) {
      for (const input of family.inputs ?? []) {
        readFileSync(resolve(root, input));
      }
    }
  }
}

export async function readTypedEslintAdmissions(
  root: string,
  configPath: string,
  admissions: readonly EslintFileAdmission[],
  families: readonly EslintNativeMetadataFamily[],
): Promise<readonly EslintFileAdmission[]> {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ cwd: root, overrideConfigFile: resolve(root, configPath) });
  const rules = new Set(families.flatMap((family) => family.rules));
  const activeRules = new Set<string>();
  const selected: EslintFileAdmission[] = [];
  for (const admission of admissions) {
    const config = await eslint.calculateConfigForFile(resolve(root, admission.path));
    const enabled = Object.entries(config?.rules ?? {}).filter(([id, value]) => {
      const severity = Array.isArray(value) ? value[0] : value;
      return rules.has(id) && (severity === "error" || severity === "warn" || severity === 1 || severity === 2);
    });
    if (enabled.length > 0) {
      if (!admission.requiresTypeInformation) {
        throw new Error(`Typed native policy subject ${admission.path} has no native parser compiler owner`);
      }
      selected.push(admission);
      for (const [id] of enabled) {
        activeRules.add(id);
      }
    }
  }
  readActiveTypedInputs(root, families, activeRules);
  return selected;
}
