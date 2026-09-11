// The sole adapter onto chrome-devtools-mcp's bundled browser-free HeapSnapshotManager. Nothing else in
// Orbweaver may deep-import that package: this file validates the exact pin and converts every private
// DevTools object into our bounded JSON-safe heap contract.
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { errorMessage } from "@orb/kit/error-message";
import type {
  HeapClassSummary,
  HeapDominatorNode,
  HeapNodeSummary,
  HeapOutgoingEdge,
  HeapRetainerSelector,
  HeapRetainingEdge,
  HeapSnapshotReceipt,
} from "../contract/heap.ts";
import {
  HEAP_DETACHED_NODE_CAP,
  HEAP_NATIVE_CONTEXT_CAP,
  HEAP_OUTGOING_EDGE_CAP,
  HEAP_PARSER_PROBLEM_CAP,
  HEAP_RETAINER_DEPTH,
  HEAP_RETAINER_NODE_CAP,
  HEAP_RETAINER_SIBLING_CAP,
  HEAP_TOP_CLASS_CAP,
} from "../contract/heap.ts";
import { loadHeapParserManager, withHeapParserProblemSink } from "./heap-parser-loader.ts";

export interface HeapParsedSnapshot
  extends Pick<HeapSnapshotReceipt, "statistics" | "population" | "nativeContexts" | "retainedByContext" | "topClasses" | "detached" | "parserProblems"> {
  /** Full browser-free class population for comparisons. Never serialized into the bounded sidecar. */
  readonly allClasses: readonly HeapClassSummary[];
}

export interface HeapParsedClassDiff {
  readonly className: string;
  readonly addedCount: number;
  readonly removedCount: number;
  readonly countDelta: number;
  readonly addedSize: number;
  readonly removedSize: number;
  readonly sizeDelta: number;
}

export interface HeapParsedRetainers {
  readonly candidates: number;
  readonly selected: HeapNodeSummary;
  readonly paths: readonly HeapRetainingEdge[];
  readonly dominators: readonly HeapDominatorNode[];
  readonly outgoing: readonly HeapOutgoingEdge[];
  readonly outgoingTotal: number;
  readonly pathLimits: { readonly depth: boolean; readonly nodes: boolean; readonly siblings: boolean };
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`HEAP PARSER ERROR: ${label} is not an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`HEAP PARSER ERROR: ${label} is not an array`);
  }
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`HEAP PARSER ERROR: ${label} is not a finite number`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  const parsed = finite(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`HEAP PARSER ERROR: ${label} is not a non-negative integer`);
  }
  return parsed;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`HEAP PARSER ERROR: ${label} is not a string`);
  }
  return value;
}

function optionalBoolean(value: unknown): boolean {
  return value === true;
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null ? Reflect.get(error, "code") : null;
}

function managerCall(manager: object, method: string, args: readonly unknown[] = []): Promise<unknown> {
  const candidate: unknown = Reflect.get(manager, method);
  if (typeof candidate !== "function") {
    throw new Error(`HEAP PARSER COMPATIBILITY ERROR: HeapSnapshotManager omitted ${method}()`);
  }
  return Promise.resolve(Reflect.apply(candidate, manager, [...args]));
}

function disposeManager(manager: object): void {
  const candidate: unknown = Reflect.get(manager, "dispose");
  if (typeof candidate !== "function") {
    throw new Error("HEAP PARSER COMPATIBILITY ERROR: HeapSnapshotManager omitted dispose()");
  }
  Reflect.apply(candidate, manager, []);
}

function nodeSummary(value: unknown, label: string): HeapNodeSummary {
  const row = record(value, label);
  const detachedness = row["detachedness"];
  return {
    nodeId: integer(row["id"], `${label}.id`),
    name: text(row["name"], `${label}.name`),
    type: text(row["type"], `${label}.type`),
    distance: finite(row["distance"], `${label}.distance`),
    selfSize: integer(row["selfSize"], `${label}.selfSize`),
    retainedSize: integer(row["retainedSize"], `${label}.retainedSize`),
    detached: optionalBoolean(row["detachedDOMTreeNode"]) || detachedness === 2,
  };
}

function classSummary(value: unknown, label: string): HeapClassSummary {
  const row = record(value, label);
  return {
    className: text(row["name"], `${label}.name`),
    count: integer(row["count"], `${label}.count`),
    selfSize: integer(row["self"], `${label}.self`),
    maxRetainedSize: integer(row["maxRet"], `${label}.maxRet`),
  };
}

function retainingEdge(value: unknown, label: string): HeapRetainingEdge {
  const row = record(value, label);
  return {
    nodeId: integer(row["nodeId"], `${label}.nodeId`),
    nodeName: text(row["nodeName"], `${label}.nodeName`),
    edgeName: String(row["edgeName"] ?? ""),
    edgeType: text(row["edgeType"], `${label}.edgeType`),
    distance: finite(row["distance"], `${label}.distance`),
    children: array(row["children"], `${label}.children`).map((child, index) => retainingEdge(child, `${label}.children[${String(index)}]`)),
  };
}

function dominator(value: unknown, label: string): HeapDominatorNode {
  const row = record(value, label);
  return {
    nodeId: integer(row["nodeId"], `${label}.nodeId`),
    nodeName: text(row["nodeName"], `${label}.nodeName`),
    selfSize: integer(row["selfSize"], `${label}.selfSize`),
    retainedSize: integer(row["retainedSize"], `${label}.retainedSize`),
  };
}

function outgoingEdge(value: unknown, label: string): HeapOutgoingEdge {
  const row = record(value, label);
  return {
    name: String(row["name"] ?? ""),
    type: text(row["type"], `${label}.type`),
    node: nodeSummary(row["node"], `${label}.node`),
  };
}

function rangeItems(value: unknown, label: string): { readonly total: number; readonly items: readonly unknown[] } {
  const row = record(value, label);
  return { total: integer(row["totalLength"], `${label}.totalLength`), items: array(row["items"], `${label}.items`) };
}

function exactClassPattern(className: string): string {
  return `^${className.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`;
}

async function parsedSnapshot(manager: object, path: string): Promise<HeapParsedSnapshot> {
  // Prime HeapSnapshotManager's path cache before concurrent reads. Its getSnapshot() cache does not
  // memoize an in-flight load: six first reads in Promise.all create six workers and dispose only the
  // last map entry. The initial stats read makes every parallel query below hit the one loaded proxy.
  const problemPath = join(dirname(path), `.heap-parser-${basename(path)}-${randomUUID()}.jsonl`);
  const statsValue = await withHeapParserProblemSink(problemPath, async () => await managerCall(manager, "getStats", [path]));
  const [staticValue, nativeValue, retainedValue, aggregatesValue, detachedValue] = await Promise.all([
    managerCall(manager, "getStaticData", [path]),
    managerCall(manager, "getNativeContextSizes", [path]),
    managerCall(manager, "getRetainedByContextSummary", [path]),
    managerCall(manager, "getAggregates", [path]),
    managerCall(manager, "queryObjects", [path, { isDetached: true, sortBy: "retainedSize" }]),
  ]);
  const stats = record(statsValue, "statistics");
  const nativeStats = record(stats["native"], "statistics.native");
  const v8 = record(stats["v8heap"], "statistics.v8heap");
  const staticData = record(staticValue, "static data");
  const aggregates = record(aggregatesValue, "aggregates");
  const aggregateRows = record(aggregates["aggregates"], "aggregates.rows");
  const classes = Object.values(aggregateRows)
    .map((value, index) => classSummary(value, `aggregates[${String(index)}]`))
    .toSorted((left, right) => right.maxRetainedSize - left.maxRetainedSize || right.selfSize - left.selfSize);
  const detachedRange = rangeItems(detachedValue, "detached nodes");
  const detachedRows = detachedRange.items
    .map((value, index) => nodeSummary(value, `detached[${String(index)}]`))
    .toSorted((left, right) => right.retainedSize - left.retainedSize);
  const nativeSizes = record(nativeValue, "native contexts");
  const nativeRows = array(nativeSizes["nativeContexts"], "native contexts.rows")
    .map((value, index) => {
      const row = record(value, `native contexts[${String(index)}]`);
      return {
        nodeId: integer(row["nodeId"], "native context nodeId"),
        name: text(row["nodeName"], "native context nodeName"),
        selfSize: integer(row["selfSize"], "native context selfSize"),
        retainedSize: integer(row["retainedSize"], "native context retainedSize"),
        attributedSize: integer(row["attributedSize"], "native context attributedSize"),
      };
    })
    .toSorted((left, right) => right.attributedSize - left.attributedSize);
  const retained = record(retainedValue, "retained by context");
  let parserProblemRows: string[] = [];
  // @orb-waive caught-failure-ownership(error): ENOENT means the official worker emitted no problem report; every other read/parse failure rethrows. Ends if the error-code check or rethrow is removed.
  try {
    const source = await readFile(problemPath, "utf8");
    parserProblemRows = source
      .split("\n")
      .filter((line) => line !== "")
      .flatMap((line) => {
        const parsed = record(JSON.parse(line), "DevTools heap problem report");
        return text(parsed["message"], "DevTools heap problem message").split("\n");
      });
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  } finally {
    await rm(problemPath, { force: true });
  }
  return {
    statistics: {
      total: integer(stats["total"], "statistics.total"),
      nativeTotal: integer(nativeStats["total"], "statistics.native.total"),
      typedArrays: integer(nativeStats["typedArrays"], "statistics.native.typedArrays"),
      v8Total: integer(v8["total"], "statistics.v8heap.total"),
      code: integer(v8["code"], "statistics.v8heap.code"),
      jsArrays: integer(v8["jsArrays"], "statistics.v8heap.jsArrays"),
      strings: integer(v8["strings"], "statistics.v8heap.strings"),
      system: integer(v8["system"], "statistics.v8heap.system"),
    },
    population: {
      nodes: integer(staticData["nodeCount"], "staticData.nodeCount"),
      objects: integer(aggregates["objectCount"], "aggregates.objectCount"),
      totalSelfSize: integer(aggregates["totalSelfSize"], "aggregates.totalSelfSize"),
      rootNodeIndex: integer(staticData["rootNodeIndex"], "staticData.rootNodeIndex"),
      maxJsObjectId: integer(staticData["maxJSObjectId"], "staticData.maxJSObjectId"),
    },
    nativeContexts: {
      total: nativeRows.length,
      shown: Math.min(nativeRows.length, HEAP_NATIVE_CONTEXT_CAP),
      omitted: Math.max(0, nativeRows.length - HEAP_NATIVE_CONTEXT_CAP),
      sharedSize: integer(nativeSizes["sharedSize"], "native contexts.sharedSize"),
      unattributedSize: integer(nativeSizes["noAttributionSize"], "native contexts.noAttributionSize"),
      rows: nativeRows.slice(0, HEAP_NATIVE_CONTEXT_CAP),
    },
    retainedByContext: {
      contextCount: integer(retained["contextCount"], "retained.contextCount"),
      retainedSize: integer(retained["retainedByContextSize"], "retained.retainedByContextSize"),
      retainedCount: integer(retained["retainedByContextCount"], "retained.retainedByContextCount"),
      notRetainedSize: integer(retained["notRetainedByContextSize"], "retained.notRetainedByContextSize"),
      notRetainedCount: integer(retained["notRetainedByContextCount"], "retained.notRetainedByContextCount"),
      totalSize: integer(retained["totalSize"], "retained.totalSize"),
    },
    topClasses: {
      total: classes.length,
      shown: Math.min(classes.length, HEAP_TOP_CLASS_CAP),
      omitted: Math.max(0, classes.length - HEAP_TOP_CLASS_CAP),
      rows: classes.slice(0, HEAP_TOP_CLASS_CAP),
    },
    allClasses: classes,
    detached: {
      count: detachedRange.total,
      shown: Math.min(detachedRows.length, HEAP_DETACHED_NODE_CAP),
      omitted: Math.max(0, detachedRange.total - HEAP_DETACHED_NODE_CAP),
      totalSelfSize: detachedRows.reduce((sum, row) => sum + row.selfSize, 0),
      totalRetainedSize: detachedRows.reduce((sum, row) => sum + row.retainedSize, 0),
      rows: detachedRows.slice(0, HEAP_DETACHED_NODE_CAP),
    },
    parserProblems: {
      total: parserProblemRows.length,
      shown: Math.min(parserProblemRows.length, HEAP_PARSER_PROBLEM_CAP),
      omitted: Math.max(0, parserProblemRows.length - HEAP_PARSER_PROBLEM_CAP),
      rows: parserProblemRows.slice(0, HEAP_PARSER_PROBLEM_CAP),
    },
  };
}

function parsedClassDiff(value: unknown, index: number): HeapParsedClassDiff {
  const row = record(value, `class diff[${String(index)}]`);
  return {
    className: text(row["className"], "class diff.className"),
    addedCount: integer(row["addedCount"], "class diff.addedCount"),
    removedCount: integer(row["removedCount"], "class diff.removedCount"),
    countDelta: finite(row["countDelta"], "class diff.countDelta"),
    addedSize: integer(row["addedSize"], "class diff.addedSize"),
    removedSize: integer(row["removedSize"], "class diff.removedSize"),
    sizeDelta: finite(row["sizeDelta"], "class diff.sizeDelta"),
  };
}

export class HeapDevToolsParser {
  readonly #manager: object;
  readonly #snapshots = new Map<string, Promise<HeapParsedSnapshot>>();

  private constructor(manager: object) {
    this.#manager = manager;
  }

  static async create(): Promise<HeapDevToolsParser> {
    return new HeapDevToolsParser(await loadHeapParserManager());
  }

  async snapshot(path: string): Promise<HeapParsedSnapshot> {
    const current = this.#snapshots.get(path);
    if (current !== undefined) {
      return await current;
    }
    const loading = parsedSnapshot(this.#manager, path);
    this.#snapshots.set(path, loading);
    return await loading;
  }

  async classDiffs(left: string, right: string): Promise<readonly HeapParsedClassDiff[]> {
    return array(await managerCall(this.#manager, "getClassDiffs", [left, right]), "class diffs").map(parsedClassDiff);
  }

  async retainers(path: string, selector: HeapRetainerSelector): Promise<HeapParsedRetainers> {
    let candidates: readonly unknown[];
    if (selector.kind === "node-id") {
      candidates = [await managerCall(this.#manager, "getObjectInfo", [path, selector.nodeId])];
    } else {
      const query =
        selector.kind === "detached"
          ? { isDetached: true, sortBy: "retainedSize" }
          : { className: exactClassPattern(selector.className), sortBy: "retainedSize" };
      candidates = rangeItems(await managerCall(this.#manager, "queryObjects", [path, query]), "retainer candidates").items;
    }
    if (candidates.length === 0) {
      throw new Error(`HEAP RETAINER REFUSED: selector matched zero objects (${JSON.stringify(selector)})`);
    }
    const nodes = candidates
      .map((value, index) => nodeSummary(value, `retainer candidate[${String(index)}]`))
      .toSorted((left, right) => right.retainedSize - left.retainedSize);
    const [selected] = nodes;
    if (selected === undefined) {
      throw new Error("HEAP RETAINER REFUSED: normalized selector population became empty");
    }
    const pathsRaw = record(
      await managerCall(this.#manager, "getRetainingPaths", [path, selected.nodeId, HEAP_RETAINER_DEPTH, HEAP_RETAINER_NODE_CAP, HEAP_RETAINER_SIBLING_CAP]),
      "retaining paths",
    );
    const limits = record(pathsRaw["limitsReached"] ?? {}, "retaining path limits");
    const dominators = array(await managerCall(this.#manager, "getDominatorsOf", [path, selected.nodeId]), "dominators").map((value, index) =>
      dominator(value, `dominator[${String(index)}]`),
    );
    const edges = rangeItems(
      await managerCall(this.#manager, "getEdges", [path, selected.nodeId, { sortBy: "retainedSize", excludePrimitives: true }]),
      "outgoing edges",
    );
    return {
      candidates: nodes.length,
      selected,
      paths: array(pathsRaw["paths"], "retaining paths.rows").map((value, index) => retainingEdge(value, `retaining paths[${String(index)}]`)),
      dominators,
      outgoing: edges.items.slice(0, HEAP_OUTGOING_EDGE_CAP).map((value, index) => outgoingEdge(value, `outgoing edge[${String(index)}]`)),
      outgoingTotal: edges.total,
      pathLimits: { depth: limits["depth"] === true, nodes: limits["nodes"] === true, siblings: limits["siblings"] === true },
    };
  }

  dispose(): void {
    disposeManager(this.#manager);
  }
}

export async function withHeapDevToolsParser<T>(run: (parser: HeapDevToolsParser) => Promise<T>): Promise<T> {
  const parser = await HeapDevToolsParser.create();
  try {
    return await run(parser);
  } catch (error) {
    throw new Error(`HEAP PARSER REFUSED: ${errorMessage(error)}`, { cause: error });
  } finally {
    parser.dispose();
  }
}
