// Pure/bounded heap evidence plus raw-sidecar identity validation. Browser/CDP capture belongs to the arm;
// private DevTools objects belong to heap-devtools.ts. This file owns public argv grammar and comparison
// truth so session/scenario callers cannot invent a second interpretation.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { InstrumentArtifactLimitReceipt } from "../../_shared/artifact-out.ts";
import type { SnapAnalyzerProblem } from "../contract/analyzer.ts";
import type {
  HeapBrowserIdentity,
  HeapCaptureRequest,
  HeapCaptureSessionId,
  HeapClassDelta,
  HeapClassSummary,
  HeapComparisonReceipt,
  HeapRetainerReceipt,
  HeapRetainerRequest,
  HeapRetainerSelector,
  HeapSnapshotIdentity,
  HeapSnapshotReceipt,
  HeapTargetIdentity,
} from "../contract/heap.ts";
import {
  HEAP_COMPARISON_CLASS_CAP,
  HEAP_DETACHED_NODE_CAP,
  HEAP_NATIVE_CONTEXT_CAP,
  HEAP_OUTGOING_EDGE_CAP,
  HEAP_PARSER_PACKAGE,
  HEAP_PARSER_PROBLEM_CAP,
  HEAP_PARSER_VERSION,
  HEAP_RETAINER_DEPTH,
  HEAP_RETAINER_NODE_CAP,
  HEAP_RETAINER_SIBLING_CAP,
  HEAP_SNAPSHOT_SCHEMA,
  HEAP_TOP_CLASS_CAP,
  heapSnapshotReceiptSchema,
} from "../contract/heap.ts";
import type { HeapDevToolsParser, HeapParsedClassDiff, HeapParsedSnapshot } from "./heap-devtools.ts";

const HEAP_LABEL_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/iu;
const HEAP_CLASS_NAME_MAX = 160;
const HEAP_GROWTH_PROBLEM_CAP = 20;

export interface HeapIdentityInput {
  readonly label: string;
  readonly rawPath: string;
  readonly summaryPath: string;
  readonly capturedAt: string;
  readonly captureSessionId: HeapCaptureSessionId;
  readonly browser: HeapBrowserIdentity;
  readonly target: HeapTargetIdentity;
}

export interface HeapSnapshotReferenceStore {
  readonly get: (label: string) => HeapSnapshotReceipt | undefined;
}

function splitPair(raw: string, flag: string): { readonly left: string; readonly right: string } {
  const index = raw.indexOf("=");
  if (index <= 0 || index === raw.length - 1) {
    throw new Error(`${flag} expects <left=right>, got ${raw || "(empty)"}`);
  }
  return { left: raw.slice(0, index), right: raw.slice(index + 1) };
}

function validReference(value: string): boolean {
  return HEAP_LABEL_RE.test(value) || (isAbsolute(value) && value.endsWith(".heapsnapshot"));
}

export function parseHeapCapture(raw: string, page: number): HeapCaptureRequest {
  if (!HEAP_LABEL_RE.test(raw)) {
    throw new Error(`--heap expects a label matching ${HEAP_LABEL_RE.source} (artifacts stay in the immutable run slot), got ${raw || "(empty)"}`);
  }
  return { label: raw, page };
}

export function parseHeapComparison(raw: string, page: number): { readonly left: string; readonly right: string; readonly page: number } {
  const pair = splitPair(raw, "--heap-compare");
  if (!(validReference(pair.left) && validReference(pair.right))) {
    throw new Error("--heap-compare operands must be capture labels or absolute .heapsnapshot paths");
  }
  if (pair.left === pair.right) {
    throw new Error("--heap-compare requires two distinct snapshots");
  }
  return { ...pair, page };
}

function parseRetainerSelector(raw: string): HeapRetainerSelector {
  if (raw === "detached") {
    return { kind: "detached" };
  }
  if (/^@\d+$/u.test(raw)) {
    return { kind: "node-id", nodeId: Number(raw.slice(1)) };
  }
  if (raw.startsWith("class:")) {
    const className = raw.slice("class:".length);
    if (className === "" || className.length > HEAP_CLASS_NAME_MAX) {
      throw new Error(`--heap-retainers class selector must contain 1-${String(HEAP_CLASS_NAME_MAX)} characters`);
    }
    return { kind: "class", className };
  }
  throw new Error("--heap-retainers selector expects @<node-id>, detached, or class:<exact-class-name>");
}

export function parseHeapRetainer(raw: string, page: number): HeapRetainerRequest {
  const pair = splitPair(raw, "--heap-retainers");
  if (!validReference(pair.left)) {
    throw new Error("--heap-retainers snapshot must be a capture label or absolute .heapsnapshot path");
  }
  return { snapshot: pair.left, selector: parseRetainerSelector(pair.right), page };
}

function heapLimit(source: string, total: number, shown: number, cap: number): InstrumentArtifactLimitReceipt {
  const omitted = Math.max(0, total - shown);
  return {
    source,
    complete: omitted === 0,
    policy: { cap },
    events: omitted === 0 ? [] : [{ kind: "rows", path: source, original: total, retained: shown, omitted }],
  };
}

function detachedProblem(receipt: Pick<HeapSnapshotReceipt, "detached">): readonly SnapAnalyzerProblem[] {
  if (receipt.detached.count === 0) {
    return [];
  }
  return [
    {
      arm: "heap",
      kind: "failure",
      metric: "detached-dom",
      subject: "garbage-collected snapshot",
      observed: `${String(receipt.detached.count)} nodes retaining ${String(receipt.detached.totalRetainedSize)} bytes`,
      threshold: "0 detached nodes (diagnostic finding; no exit vote)",
      detail: "detached DOM remains reachable after HeapProfiler.collectGarbage; inspect --heap-retainers <snapshot>=detached",
    },
  ];
}

async function hashPath(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest("hex"), bytes };
}

export async function buildHeapSnapshotReceipt(parser: HeapDevToolsParser, identity: HeapIdentityInput): Promise<HeapSnapshotReceipt> {
  const parsed = await parser.snapshot(identity.rawPath);
  if (parsed.population.nodes === 0 || parsed.population.objects === 0) {
    throw new Error(
      `HEAP SNAPSHOT REFUSED: parser returned nodes=${String(parsed.population.nodes)} objects=${String(parsed.population.objects)}; an empty population is not a clean heap`,
    );
  }
  const raw = await hashPath(identity.rawPath);
  const limits = [
    heapLimit("heap-native-contexts", parsed.nativeContexts.total, parsed.nativeContexts.shown, HEAP_NATIVE_CONTEXT_CAP),
    heapLimit("heap-top-classes", parsed.topClasses.total, parsed.topClasses.shown, HEAP_TOP_CLASS_CAP),
    heapLimit("heap-detached-nodes", parsed.detached.count, parsed.detached.shown, HEAP_DETACHED_NODE_CAP),
    heapLimit("heap-parser-problems", parsed.parserProblems.total, parsed.parserProblems.shown, HEAP_PARSER_PROBLEM_CAP),
  ];
  const receipt: HeapSnapshotReceipt = {
    v: 1,
    kind: "snapshot",
    identity: {
      ...identity,
      ...raw,
      parser: { package: HEAP_PARSER_PACKAGE, version: HEAP_PARSER_VERSION, engine: "HeapSnapshotManager" },
    },
    statistics: parsed.statistics,
    population: parsed.population,
    nativeContexts: parsed.nativeContexts,
    retainedByContext: parsed.retainedByContext,
    topClasses: parsed.topClasses,
    detached: parsed.detached,
    parserProblems: parsed.parserProblems,
    problems: detachedProblem(parsed),
    limits,
  };
  await writeFile(identity.summaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return receipt;
}

function snapshotReceipt(value: unknown, path: string): HeapSnapshotReceipt {
  const parsed = heapSnapshotReceiptSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`HEAP EVIDENCE REFUSED: ${path} is not ${HEAP_SNAPSHOT_SCHEMA}`);
  }
  if (parsed.data.population.nodes <= 0 || parsed.data.population.objects <= 0) {
    throw new Error(`HEAP EVIDENCE REFUSED: ${path} has an empty population`);
  }
  return parsed.data;
}

export async function loadHeapSnapshotReceipt(rawPath: string): Promise<HeapSnapshotReceipt> {
  const absolute = resolve(rawPath);
  const sidecar = `${absolute}.json`;
  const parsed = snapshotReceipt(JSON.parse(await readFile(sidecar, "utf8")), sidecar);
  if (resolve(parsed.identity.rawPath) !== absolute || resolve(parsed.identity.summaryPath) !== resolve(sidecar)) {
    throw new Error(`HEAP EVIDENCE REFUSED: ${sidecar} names a different raw/sidecar path`);
  }
  const actual = await hashPath(absolute);
  if (actual.sha256 !== parsed.identity.sha256 || actual.bytes !== parsed.identity.bytes) {
    throw new Error(
      `HEAP EVIDENCE REFUSED: raw snapshot bytes disagree with ${sidecar} (expected ${parsed.identity.sha256}/${String(parsed.identity.bytes)}, got ${actual.sha256}/${String(actual.bytes)})`,
    );
  }
  return parsed;
}

export async function resolveHeapSnapshotReference(reference: string, store: HeapSnapshotReferenceStore): Promise<HeapSnapshotReceipt> {
  const labelled = store.get(reference);
  if (labelled !== undefined) {
    return await loadHeapSnapshotReceipt(labelled.identity.rawPath);
  }
  if (!isAbsolute(reference)) {
    throw new Error(`HEAP EVIDENCE REFUSED: unknown heap label ${JSON.stringify(reference)} in this browser context`);
  }
  return await loadHeapSnapshotReceipt(reference);
}

function sameBrowser(left: HeapSnapshotIdentity, right: HeapSnapshotIdentity): boolean {
  return JSON.stringify(left.browser) === JSON.stringify(right.browser);
}

export function assertComparableHeapSnapshots(left: HeapSnapshotReceipt, right: HeapSnapshotReceipt): void {
  const conflicts = [
    ...(left.identity.captureSessionId === right.identity.captureSessionId ? [] : ["capture-session"]),
    ...(left.identity.target.targetId === right.identity.target.targetId ? [] : ["target"]),
    ...(left.identity.target.browserContextId === right.identity.target.browserContextId ? [] : ["browser-context"]),
    ...(left.identity.target.pageIndex === right.identity.target.pageIndex ? [] : ["page"]),
    ...(left.identity.target.contextIndex === right.identity.target.contextIndex ? [] : ["context"]),
    ...(sameBrowser(left.identity, right.identity) ? [] : ["browser-version"]),
  ];
  if (conflicts.length > 0) {
    throw new Error(`HEAP COMPARISON REFUSED: incompatible provenance (${conflicts.join(", ")}); compare captures from the same Snap page/browser lifetime`);
  }
}

function classMap(parsed: HeapParsedSnapshot): ReadonlyMap<string, HeapClassSummary> {
  return new Map(parsed.allClasses.map((row) => [row.className, row]));
}

function classDelta(diff: HeapParsedClassDiff, left: ReadonlyMap<string, HeapClassSummary>, right: ReadonlyMap<string, HeapClassSummary>): HeapClassDelta {
  const before = left.get(diff.className) ?? null;
  const after = right.get(diff.className) ?? null;
  return {
    ...diff,
    before,
    after,
    maxRetainedSizeDelta: (after?.maxRetainedSize ?? 0) - (before?.maxRetainedSize ?? 0),
  };
}

function selectClassDeltas(rows: readonly HeapClassDelta[]): readonly HeapClassDelta[] {
  const half = Math.floor(HEAP_COMPARISON_CLASS_CAP / 2);
  const growth = rows.filter((row) => row.sizeDelta > 0 || row.countDelta > 0).toSorted((a, b) => b.sizeDelta - a.sizeDelta || b.countDelta - a.countDelta);
  const released = rows.filter((row) => row.sizeDelta < 0 || row.countDelta < 0).toSorted((a, b) => a.sizeDelta - b.sizeDelta || a.countDelta - b.countDelta);
  const selected = [...growth.slice(0, half), ...released.slice(0, half)];
  if (selected.length < HEAP_COMPARISON_CLASS_CAP) {
    const used = new Set(selected.map((row) => row.className));
    selected.push(...rows.filter((row) => !used.has(row.className)).slice(0, HEAP_COMPARISON_CLASS_CAP - selected.length));
  }
  return selected;
}

function comparisonProblems(
  rows: readonly HeapClassDelta[],
  detachedDelta: number,
  detachedRetainedDelta: number,
): { readonly rows: readonly SnapAnalyzerProblem[]; readonly total: number } {
  const problems: SnapAnalyzerProblem[] = [];
  if (detachedDelta > 0 || detachedRetainedDelta > 0) {
    problems.push({
      arm: "heap",
      kind: "failure",
      metric: "detached-dom-growth",
      subject: "same-page before/after comparison",
      observed: `count ${detachedDelta >= 0 ? "+" : ""}${String(detachedDelta)}, retained ${detachedRetainedDelta >= 0 ? "+" : ""}${String(detachedRetainedDelta)} bytes`,
      threshold: "no positive detached growth (diagnostic finding; no exit vote)",
      detail: "detached DOM grew after forced garbage collection; query the later snapshot with --heap-retainers <snapshot>=detached",
    });
  }
  const growth = rows
    .filter((value) => value.sizeDelta > 0 || value.countDelta > 0 || (value.maxRetainedSizeDelta ?? 0) > 0)
    .toSorted(
      (left, right) =>
        (right.maxRetainedSizeDelta ?? 0) - (left.maxRetainedSizeDelta ?? 0) || right.sizeDelta - left.sizeDelta || right.countDelta - left.countDelta,
    );
  for (const row of growth.slice(0, HEAP_GROWTH_PROBLEM_CAP)) {
    problems.push({
      arm: "heap",
      kind: "threshold",
      metric: "class-growth",
      subject: row.className,
      observed: `count ${row.countDelta >= 0 ? "+" : ""}${String(row.countDelta)}, self ${row.sizeDelta >= 0 ? "+" : ""}${String(row.sizeDelta)} bytes`,
      threshold: "delta > 0 (informational; no exit vote)",
      detail: `added=${String(row.addedCount)} removed=${String(row.removedCount)} max-retained-delta=${String(row.maxRetainedSizeDelta ?? "unavailable")}`,
    });
  }
  return { rows: problems, total: growth.length + (detachedDelta > 0 || detachedRetainedDelta > 0 ? 1 : 0) };
}

export async function buildHeapComparisonReceipt(
  parser: HeapDevToolsParser,
  left: HeapSnapshotReceipt,
  right: HeapSnapshotReceipt,
): Promise<HeapComparisonReceipt> {
  assertComparableHeapSnapshots(left, right);
  // Load both proxies before asking the official diff engine to reuse them. HeapSnapshotManager does not
  // deduplicate concurrent first loads for one path, so this ordering is worker-lifetime correctness.
  const leftParsed = await parser.snapshot(left.identity.rawPath);
  const rightParsed = await parser.snapshot(right.identity.rawPath);
  const rawDiffs = await parser.classDiffs(left.identity.rawPath, right.identity.rawPath);
  const allRows = rawDiffs.map((diff) => classDelta(diff, classMap(leftParsed), classMap(rightParsed)));
  const rows = selectClassDeltas(allRows);
  const detachedCount = right.detached.count - left.detached.count;
  const detachedRetained = right.detached.totalRetainedSize - left.detached.totalRetainedSize;
  const problems = comparisonProblems(allRows, detachedCount, detachedRetained);
  const limits = [
    heapLimit("heap-comparison-classes", allRows.length, rows.length, HEAP_COMPARISON_CLASS_CAP),
    heapLimit("heap-comparison-problems", problems.total, problems.rows.length, HEAP_GROWTH_PROBLEM_CAP + 1),
  ];
  return {
    v: 1,
    kind: "comparison",
    left: left.identity,
    right: right.identity,
    deltas: {
      total: right.statistics.total - left.statistics.total,
      nativeTotal: right.statistics.nativeTotal - left.statistics.nativeTotal,
      v8Total: right.statistics.v8Total - left.statistics.v8Total,
      nodes: right.population.nodes - left.population.nodes,
      objects: right.population.objects - left.population.objects,
      totalSelfSize: right.population.totalSelfSize - left.population.totalSelfSize,
      detachedCount,
      detachedSelfSize: right.detached.totalSelfSize - left.detached.totalSelfSize,
      detachedRetainedSize: detachedRetained,
    },
    classes: { total: allRows.length, shown: rows.length, omitted: Math.max(0, allRows.length - rows.length), rows },
    problems: problems.rows,
    limits,
  };
}

export async function buildHeapRetainerReceipt(
  parser: HeapDevToolsParser,
  snapshot: HeapSnapshotReceipt,
  selector: HeapRetainerSelector,
): Promise<HeapRetainerReceipt> {
  const parsed = await parser.retainers(snapshot.identity.rawPath, selector);
  const outgoingShown = parsed.outgoing.length;
  const limits = [
    // The cap argument is the POLICY, never the observation: passing `outgoingShown` made the receipt
    // report its own truncation limit as whatever it happened to keep, so a reader could not tell a
    // 3-edge object from a 3-edge TRUNCATION (#1509).
    heapLimit("heap-retainer-outgoing", parsed.outgoingTotal, outgoingShown, HEAP_OUTGOING_EDGE_CAP),
    {
      source: "heap-retaining-paths",
      complete: !(parsed.pathLimits.depth || parsed.pathLimits.nodes || parsed.pathLimits.siblings),
      policy: { depth: HEAP_RETAINER_DEPTH, nodes: HEAP_RETAINER_NODE_CAP, siblings: HEAP_RETAINER_SIBLING_CAP },
      events: [
        ...(parsed.pathLimits.depth ? [{ kind: "depth", path: "retaining-paths", original: null, retained: HEAP_RETAINER_DEPTH, omitted: null }] : []),
        ...(parsed.pathLimits.nodes ? [{ kind: "nodes", path: "retaining-paths", original: null, retained: HEAP_RETAINER_NODE_CAP, omitted: null }] : []),
        ...(parsed.pathLimits.siblings
          ? [{ kind: "siblings", path: "retaining-paths", original: null, retained: HEAP_RETAINER_SIBLING_CAP, omitted: null }]
          : []),
      ],
    },
  ] satisfies readonly InstrumentArtifactLimitReceipt[];
  const problems: SnapAnalyzerProblem[] = parsed.selected.detached
    ? [
        {
          arm: "heap",
          kind: "failure",
          metric: "detached-dom-retainer",
          subject: `@${String(parsed.selected.nodeId)} ${parsed.selected.name}`,
          observed: `${String(parsed.selected.retainedSize)} retained bytes across ${String(parsed.paths.length)} root path(s)`,
          threshold: "detached object is reachable (diagnostic finding; no exit vote)",
          detail: "the retained artifact contains bounded paths and the full returned dominator chain",
        },
      ]
    : [];
  return {
    v: 1,
    kind: "retainers",
    snapshot: snapshot.identity,
    selector,
    candidates: parsed.candidates,
    selected: parsed.selected,
    paths: parsed.paths,
    dominators: parsed.dominators,
    outgoing: { total: parsed.outgoingTotal, shown: outgoingShown, omitted: Math.max(0, parsed.outgoingTotal - outgoingShown), rows: parsed.outgoing },
    pathLimits: parsed.pathLimits,
    problems,
    limits,
  };
}

export async function writeHeapJson(path: string, value: HeapComparisonReceipt | HeapRetainerReceipt): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

export async function heapRawFileBytes(path: string): Promise<number> {
  return (await stat(path)).size;
}
