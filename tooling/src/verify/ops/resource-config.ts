import type { SourceFile } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceReader } from "../contract/resource.ts";
import type {
  PackageDependencyFacts,
  PackageMetadata,
  PackageResourceId,
  PackageStringMap,
  StaticConfigFacts,
  StaticConfigResourceId,
  StaticConfigRow,
  StaticSourceParser,
} from "../contract/resource-config.ts";
import { PACKAGE_RESOURCE_PATHS, STATIC_CONFIG_RESOURCE_PATHS } from "../contract/resource-config.ts";
import { createRowExtractor } from "../lib/config-static-read.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

const STATIC_KEYS: Readonly<Record<StaticConfigResourceId, readonly string[]>> = {
  eslint: ["files", "ignores"],
  depcruise: ["path", "pathNot"],
  vitest: ["include", "exclude", "testDir", "globalSetup"],
  playwright: ["include", "exclude", "testDir", "globalSetup"],
  ct: ["include", "exclude", "testDir", "globalSetup"],
};

function refused<T>(status: "missing" | "empty" | "unresolved", reason: string, paths: readonly string[], members = 0): ResourceLoad<T> {
  return { status, reason, paths, members };
}

function stringMap(value: unknown): PackageStringMap | undefined {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return;
  }
  const entries = Object.entries(value);
  return entries.every((entry) => typeof entry[1] === "string") ? Object.fromEntries(entries) : undefined;
}

function packageFacts(value: unknown, id: PackageResourceId, path: string): PackageMetadata | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return;
  }
  const source = value as Record<string, unknown>;
  const scripts = stringMap(source["scripts"]);
  const runtime = stringMap(source["dependencies"]);
  const development = stringMap(source["devDependencies"]);
  const peer = stringMap(source["peerDependencies"]);
  const optional = stringMap(source["optionalDependencies"]);
  const exports = stringMap(source["exports"]);
  if (
    typeof source["name"] !== "string" ||
    source["name"].trim() === "" ||
    (source["private"] !== undefined && typeof source["private"] !== "boolean") ||
    scripts === undefined ||
    runtime === undefined ||
    development === undefined ||
    peer === undefined ||
    optional === undefined ||
    exports === undefined
  ) {
    return;
  }
  const dependencies: PackageDependencyFacts = { runtime, development, peer, optional };
  return { id, path, name: source["name"], private: source["private"] === true, scripts, dependencies, exports };
}

export function loadPackageMetadata(reader: ResourceReader, id: PackageResourceId): ResourceLoad<PackageMetadata> {
  if (!Object.hasOwn(PACKAGE_RESOURCE_PATHS, id)) {
    return refused("unresolved", `unknown package resource id: ${String(id)}`, []);
  }
  const path = PACKAGE_RESOURCE_PATHS[id];
  const loaded = reader.read(path);
  if (loaded.status !== "ready") {
    return loaded;
  }
  let parsed: unknown;
  // @orb-waive caught-failure-ownership(error): native config resolution: error surfaces as a structured tool-error diagnostic; the broken config is excluded from the resource set
  try {
    parsed = JSON.parse(loaded.value);
  } catch (error) {
    return refused("unresolved", `malformed package metadata: ${error instanceof Error ? error.message : String(error)}`, loaded.paths, loaded.members);
  }
  const value = packageFacts(parsed, id, path);
  return value === undefined
    ? refused("unresolved", `package metadata does not match the closed ${id} package contract`, loaded.paths, loaded.members)
    : { status: "ready", value, paths: loaded.paths, members: 1 };
}

function syntaxError(source: SourceFile): string | undefined {
  const diagnostic = source.getProject().getProgram().getSyntacticDiagnostics(source)[0];
  if (diagnostic === undefined) {
    return;
  }
  const message = diagnostic.getMessageText();
  return typeof message === "string" ? message : message.getMessageText();
}

export function loadStaticConfig(reader: ResourceReader, id: StaticConfigResourceId, parseSource: StaticSourceParser): ResourceLoad<StaticConfigFacts> {
  if (!Object.hasOwn(STATIC_CONFIG_RESOURCE_PATHS, id)) {
    return refused("unresolved", `unknown static config resource id: ${String(id)}`, []);
  }
  const path = STATIC_CONFIG_RESOURCE_PATHS[id];
  const loaded = reader.read(path);
  if (loaded.status !== "ready") {
    return loaded;
  }
  let source: SourceFile;
  // @orb-waive caught-failure-ownership(error): native config resolution: error surfaces as a structured tool-error diagnostic; the broken config is excluded from the resource set
  try {
    source = parseSource(path, loaded.value);
  } catch (error) {
    return refused("unresolved", `static config parser failed: ${error instanceof Error ? error.message : String(error)}`, loaded.paths, loaded.members);
  }
  const parseFailure = syntaxError(source);
  if (parseFailure !== undefined) {
    return refused("unresolved", `static config did not parse: ${parseFailure}`, loaded.paths, loaded.members);
  }
  const sourcePath = source.getFilePath().replaceAll("\\", "/");
  if (source.getFullText() !== loaded.value || !(sourcePath === path || sourcePath.endsWith(`/${path}`))) {
    return refused("unresolved", `static config parser returned a different source identity for ${path}`, loaded.paths, loaded.members);
  }
  const rows: StaticConfigRow[] = [];
  const extractRows = createRowExtractor(source);
  for (const key of STATIC_KEYS[id]) {
    const extracted = extractRows({ rel: path, text: loaded.value, keys: [key], classify: (value) => value });
    if (extracted.unresolved.length > 0) {
      const first = extracted.unresolved[0];
      return refused("unresolved", `static config row is unreadable at ${path}:${first?.line ?? 0} (${first?.kind ?? "unknown"})`, loaded.paths, rows.length);
    }
    rows.push(...extracted.exact.map((row) => ({ key, value: row.path, line: row.line })));
  }
  if (rows.length === 0) {
    return refused("empty", `static config ${id} derived zero selection rows`, loaded.paths);
  }
  return { status: "ready", value: { id, path, rows }, paths: loaded.paths, members: rows.length };
}
