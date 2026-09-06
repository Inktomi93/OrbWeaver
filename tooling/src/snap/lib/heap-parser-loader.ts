// Exact-version/runtime fence for the one private chrome-devtools-mcp parser import. The sibling adapter
// owns data normalization; this file owns package provenance and the worker problem-report sink only.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { withProcessEnv } from "../../_shared/process-env.ts";
import { HEAP_PARSER_PACKAGE, HEAP_PARSER_VERSION } from "../contract/heap.ts";

const REQUIRED_METHODS = [
  "getStats",
  "getStaticData",
  "getNativeContextSizes",
  "getRetainedByContextSummary",
  "getAggregates",
  "getClassDiffs",
  "queryObjects",
  "getObjectInfo",
  "getRetainingPaths",
  "getDominatorsOf",
  "getEdges",
  "dispose",
] as const;
const PROBLEM_PATH_ENV = "ORB_HEAP_PARSER_PROBLEM_PATH";
const HEAP_PARSER_MODULE = "chrome-devtools-mcp/build/src/processors/HeapSnapshotManager.js";

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`HEAP PARSER COMPATIBILITY ERROR: ${label} is not an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`HEAP PARSER COMPATIBILITY ERROR: ${label} is not a string`);
  }
  return value;
}

async function assertPackageProvenance(): Promise<void> {
  const path = fileURLToPath(import.meta.resolve(`${HEAP_PARSER_PACKAGE}/package.json`));
  const parsed = record(JSON.parse(await readFile(path, "utf8")), "parser package.json");
  const name = text(parsed["name"], "parser package name");
  const version = text(parsed["version"], "parser package version");
  const license = text(parsed["license"], "parser package license");
  if (name !== HEAP_PARSER_PACKAGE || version !== HEAP_PARSER_VERSION || license !== "Apache-2.0") {
    throw new Error(`HEAP PARSER COMPATIBILITY ERROR: expected ${HEAP_PARSER_PACKAGE}@${HEAP_PARSER_VERSION} Apache-2.0, got ${name}@${version} ${license}`);
  }
}

export async function loadHeapParserManager(): Promise<object> {
  await assertPackageProvenance();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      length: 0,
      clear: (): void => undefined,
      getItem: (): null => null,
      key: (): null => null,
      removeItem: (): void => undefined,
      setItem: (): void => undefined,
    },
  });
  let loaded: unknown;
  try {
    loaded = await import(HEAP_PARSER_MODULE);
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, "localStorage");
    } else {
      Object.defineProperty(globalThis, "localStorage", previous);
    }
  }
  const module = record(loaded, "parser module");
  const managerConstructor: unknown = module["HeapSnapshotManager"];
  if (typeof managerConstructor !== "function") {
    throw new Error("HEAP PARSER COMPATIBILITY ERROR: parser module omitted HeapSnapshotManager");
  }
  const manager: unknown = Reflect.construct(managerConstructor, []);
  if (typeof manager !== "object" || manager === null) {
    throw new Error("HEAP PARSER COMPATIBILITY ERROR: HeapSnapshotManager constructor returned no object");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof Reflect.get(manager, method) !== "function") {
      throw new Error(`HEAP PARSER COMPATIBILITY ERROR: HeapSnapshotManager omitted ${method}()`);
    }
  }
  return manager;
}

export async function withHeapParserProblemSink<T>(path: string, run: () => Promise<T>): Promise<T> {
  return await withProcessEnv(PROBLEM_PATH_ENV, path, run);
}
