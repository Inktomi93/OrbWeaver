// This native startup boundary observes executing bytes before implementation imports, never projected subject text.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import type { LoadFnOutput, LoadHookContext, ResolveFnOutput, ResolveHookSync } from "node:module";
import { createRequire, isBuiltin, registerHooks } from "node:module";
import { resolve as resolvePath } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { InventoryRuntime, InventoryRuntimeResolution, InventoryRuntimeSource } from "../code-facts/semantic-inventory-runtime-contract.ts";

const sources = new Map<string, InventoryRuntimeSource>();
const requests = new Map<string, Map<string, InventoryRuntimeResolution>>();
const failures = new Map<string, string>();
const initialCommonJs = Object.keys(createRequire(import.meta.url).cache);
const origins = new Map<string, Set<string>>();
const startupDirectory = process.cwd();
const startupEntry = process.argv[1] === undefined ? undefined : pathToFileURL(realpathSync(process.argv[1])).href;
let orphanLoad: string | undefined;
let nativeImportResolve: Parameters<ResolveHookSync>[2] | undefined;
let initializing = true;
let observing = false;
let internal = false;
let revision = 0;

function resolutionValue(value: ResolveFnOutput): InventoryRuntimeResolution["outcome"] {
  return {
    kind: "resolved",
    value: {
      url: value.url,
      ...(value.format === undefined ? {} : { format: value.format }),
      ...(value.importAttributes === undefined ? {} : { importAttributes: { ...value.importAttributes } }),
    },
  };
}

function digest(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(url: string, message: string): void {
  if (failures.get(url) !== message) {
    revision++;
  }
  failures.set(url, message);
}

function record(request: InventoryRuntimeResolution): void {
  const parent = requests.get(request.context.parentURL) ?? new Map<string, InventoryRuntimeResolution>();
  const key = JSON.stringify([request.kind, request.mode, request.specifier, request.context]);
  const previous = parent.get(key);
  if (JSON.stringify(previous) === JSON.stringify(request)) {
    return;
  }
  revision++;
  if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(request)) {
    fail(request.context.parentURL, "native implementation resolution changed during its loaded lifetime");
  }
  parent.set(key, request);
  requests.set(request.context.parentURL, parent);
}

function recordFailure(request: Omit<InventoryRuntimeResolution, "outcome">, error: unknown): void {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    record({ ...request, outcome: { kind: "failed", code: error.code, message: error.message } });
  } else {
    fail(request.context.parentURL, "native implementation resolution failed without a closed native error");
  }
}

function observedSource(url: string): InventoryRuntimeSource {
  const failure = failures.get(url);
  if (failure !== undefined) {
    throw new Error(`${failure}: ${url}`);
  }
  const source = sources.get(url);
  if (source === undefined) {
    throw new Error(`native inventory implementation was loaded before observation: ${url}`);
  }
  return source;
}

function observeFormat(url: string, context: LoadHookContext): void {
  const resolve = nativeImportResolve;
  if (resolve === undefined) {
    throw new Error("native implementation format metadata is unavailable");
  }
  // The native resolver sees the executing package cache; a later disk read cannot establish it.
  internal = true;
  try {
    const basis = { parentURL: url, conditions: [...context.conditions], importAttributes: { ...context.importAttributes } };
    const value = resolve(url, basis);
    if (value.url !== url || value.format === undefined) {
      throw new Error("native implementation format basis is unavailable");
    }
    record({ kind: "format", mode: "import", specifier: url, context: basis, outcome: resolutionValue(value) });
  } finally {
    internal = false;
  }
}

/** Synthetic resolution queries are not executing imports; physical load observation remains active. */
export function replayInventoryRuntimeResolution(
  specifier: string,
  context: Parameters<Parameters<ResolveHookSync>[2]>[1],
  nextResolve: Parameters<ResolveHookSync>[2],
): ResolveFnOutput {
  const previous = internal;
  internal = true;
  try {
    return nextResolve(specifier, context);
  } finally {
    internal = previous;
  }
}

function observedBytes(source: NonNullable<LoadFnOutput["source"]>): Buffer {
  if (typeof source === "string") {
    return Buffer.from(source);
  }
  if (ArrayBuffer.isView(source)) {
    return Buffer.from(source.buffer, source.byteOffset, source.byteLength);
  }
  return Buffer.from(source);
}

function assertObservedImporter(url: string): void {
  const admitted =
    url === startupEntry ||
    [...(origins.get(url) ?? [])].some((parent) => parent === import.meta.url || parent === startupEntry || sources.has(parent) || parent.startsWith("node:"));
  if (!admitted) {
    orphanLoad = url;
    throw new Error("native implementation load has an unobserved importing context");
  }
}

function observeLoad(url: string, context: LoadHookContext, result: LoadFnOutput): void {
  assertObservedImporter(url);
  if (
    Object.keys(context).some((key) => !["conditions", "format", "importAttributes"].includes(key)) ||
    Object.keys(result).some((key) => !["format", "responseURL", "source", "shortCircuit"].includes(key))
  ) {
    throw new Error("native implementation load metadata is unsupported");
  }
  if ("responseURL" in result && result.responseURL !== undefined && result.responseURL !== url) {
    throw new Error("native implementation load response identity differs from its native URL");
  }
  if (!url.startsWith("file:") || result.source === null || result.source === undefined || result.format === "addon" || result.format === "wasm") {
    throw new Error("native implementation load has no supported physical source");
  }
  const bytes = observedBytes(result.source);
  const path = fileURLToPath(url);
  const physical = realpathSync(path);
  if (!bytes.equals(readFileSync(path)) || realpathSync(path) !== physical) {
    throw new Error("native implementation source differs from its executing load bytes");
  }
  const entry = { url, path, version: digest(`${physical}\0${digest(bytes)}`), ...(result.format === undefined ? {} : { format: result.format }) };
  const previous = sources.get(url);
  if (previous === undefined || JSON.stringify(previous) !== JSON.stringify(entry)) {
    revision++;
  }
  if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(entry)) {
    throw new Error("native implementation URL loaded different bytes in one process");
  }
  sources.set(url, entry);
  observeFormat(url, context);
}

if (initialCommonJs.length === 0) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (initializing && context.importAttributes !== undefined) {
        nativeImportResolve = nextResolve;
      }
      if (internal || context.parentURL === undefined) {
        return nextResolve(specifier, context);
      }
      if (Object.keys(context).some((key) => !["parentURL", "conditions", "importAttributes"].includes(key))) {
        fail(context.parentURL, "native implementation resolution metadata is unsupported");
      }
      const mode = context.importAttributes === undefined ? "require" : "import";
      const request = {
        kind: "request" as const,
        mode,
        specifier,
        context: {
          parentURL: context.parentURL,
          conditions: [...context.conditions],
          ...(context.importAttributes === undefined ? {} : { importAttributes: { ...context.importAttributes } }),
        },
      };
      try {
        const result = nextResolve(specifier, context);
        if (Object.keys(result).some((key) => !["url", "format", "importAttributes", "shortCircuit"].includes(key))) {
          fail(context.parentURL, "native implementation resolution outcome is unsupported");
        }
        if (observing) {
          record({ ...request, outcome: resolutionValue(result) });
          const parents = origins.get(result.url) ?? new Set<string>();
          parents.add(context.parentURL);
          origins.set(result.url, parents);
        }
        return result;
      } catch (error) {
        if (observing) {
          recordFailure(request, error);
        }
        throw error;
      }
    },
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!observing || isBuiltin(url)) {
        return result;
      }
      try {
        observeLoad(url, context, result);
      } catch (error) {
        fail(url, error instanceof Error ? error.message : "native implementation source observation failed");
      }
      return result;
    },
  });

  await import("node:module");
  observing = true;
}
initializing = false;
const { processEnvValue } = await import("../process/process-env.ts");
const CODE_LOADING_OPTIONS =
  /(?:^|[\s"'])(?:-r|--(?:import|require|(?:experimental[-_])?loader|experimental[-_](?:default[-_])?config[-_]file|env[-_]file(?:[-_]if[-_]exists)?|snapshot[-_]blob|build[-_]snapshot(?:[-_]config)?|experimental[-_]sea[-_]config)(?:[=\s"']|$))/u;

function assertAdmittedPreload(preload: string | undefined): void {
  if (preload === undefined) {
    throw new Error("native inventory startup preload is incomplete");
  }
  const path = preload.startsWith("file:") ? fileURLToPath(preload) : resolvePath(startupDirectory, preload);
  if (realpathSync(path) !== realpathSync(import.meta.filename)) {
    throw new Error("native inventory startup has an unsupported additional preload");
  }
}

/** Preserve native execution flags without recursively starting diagnostic agents or the admitted preload. */
export function inventoryRuntimeArguments(): string[] {
  const args: string[] = [];
  for (let index = 0; index < process.execArgv.length; index++) {
    const argument = process.execArgv[index];
    if (argument === undefined) {
      continue;
    }
    if (/^--(?:inspect(?:-brk|-wait|-port)?|cpu-prof(?:-dir|-name|-interval)?|heap-prof(?:-dir|-name|-interval)?)(?:=|$)/u.test(argument)) {
      continue;
    }
    if (argument === "--import" || argument.startsWith("--import=")) {
      const preload = argument === "--import" ? process.execArgv[++index] : argument.slice("--import=".length);
      assertAdmittedPreload(preload);
      continue;
    }
    if (/^(?:-e|-p|--eval|--print|--input-type|--test|--run|--require|-r|--(?:experimental-)?loader)(?:=|$)/u.test(argument)) {
      throw new Error("native inventory requires an observed native file entry");
    }
    if (CODE_LOADING_OPTIONS.test(argument)) {
      throw new Error("native inventory startup has an unsupported executable configuration");
    }
    args.push(argument);
  }
  return args;
}

/** Native child requests compare the effective startup environment instead of replaying stored command text. */
export function inventoryRuntimeEnvironment(): Pick<InventoryRuntime, "nodeVersion" | "nodeOptions" | "execArgv"> {
  const nodeOptions = processEnvValue("NODE_OPTIONS") ?? "";
  if (CODE_LOADING_OPTIONS.test(nodeOptions)) {
    throw new Error("native inventory cannot observe code-loading NODE_OPTIONS");
  }
  return { nodeVersion: process.version, nodeOptions, execArgv: inventoryRuntimeArguments() };
}

function assertObservedStartup(roots: readonly string[]): void {
  if (nativeImportResolve === undefined || roots.length === 0) {
    throw new Error("native inventory requires pre-import implementation observation");
  }
  if (initialCommonJs.length > 0 || orphanLoad !== undefined) {
    throw new Error(`native inventory startup has unobserved executable code: ${orphanLoad ?? initialCommonJs[0]}`);
  }
}

/** Capture only actual loaded descendants; an earlier unobserved module cannot borrow current disk bytes. */
export function captureInventoryRuntime(roots: readonly string[], pins: InventoryRuntime["pins"] = []): InventoryRuntime {
  assertObservedStartup(roots);
  const visited = new Set<string>();
  const capturedSources: InventoryRuntimeSource[] = [];
  const capturedRequests: InventoryRuntimeResolution[] = [];
  const queue = [...roots];
  for (const url of queue) {
    if (visited.has(url) || isBuiltin(url) || url === import.meta.url) {
      continue;
    }
    visited.add(url);
    capturedSources.push(observedSource(url));
    for (const request of requests.get(url)?.values() ?? []) {
      capturedRequests.push(request);
      if (request.outcome.kind === "resolved" && request.kind === "request") {
        queue.push(request.outcome.value.url);
      }
    }
  }
  const snapshot: InventoryRuntime = {
    version: 1,
    bootstrap: import.meta.url,
    ...inventoryRuntimeEnvironment(),
    roots: [...roots],
    sources: capturedSources.toSorted((left, right) => left.url.localeCompare(right.url)),
    resolutions: capturedRequests.toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    pins: [...pins],
  };
  return structuredClone(snapshot);
}

/** Sealed executions may retain loaded code, but cannot acquire new executable dependencies after handoff. */
export function assertInventoryRuntimeSealed(snapshot: InventoryRuntime): void {
  if (JSON.stringify(captureInventoryRuntime(snapshot.roots, snapshot.pins)) !== JSON.stringify(snapshot)) {
    throw new Error("native inventory implementation graph changed after capture");
  }
}

/** A journal change schedules one closed-graph comparison, not a whole implementation census on each query. */
export function inventoryRuntimeRevision(): number {
  return revision;
}
