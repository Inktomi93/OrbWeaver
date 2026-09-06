// Snap heap-arm wire/artifact shapes. Raw DevTools objects stop at lib/heap-devtools.ts; every public
// receipt here is bounded, JSON-safe and carries the identity needed to reject cross-target comparisons.

import type { Branded } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import type { InstrumentArtifactLimitReceipt } from "../../_shared/artifact-out.ts";
import { artifactLimitReceiptSchema } from "../../_shared/artifact-out.ts";
import type { SnapAnalyzerProblem } from "./analyzer.ts";
import { SNAP_ANALYZER_PROBLEM_KINDS } from "./analyzer.ts";

export const HEAP_PARSER_PACKAGE = "chrome-devtools-mcp";
export const HEAP_PARSER_VERSION = "1.8.0";
export const HEAP_SNAPSHOT_SCHEMA = "snap-heap-snapshot-v1";
export const HEAP_COMPARISON_SCHEMA = "snap-heap-comparison-v1";
export const HEAP_RETAINERS_SCHEMA = "snap-heap-retainers-v1";

export const HEAP_TOP_CLASS_CAP = 30;
export const HEAP_NATIVE_CONTEXT_CAP = 20;
export const HEAP_DETACHED_NODE_CAP = 20;
export const HEAP_COMPARISON_CLASS_CAP = 40;
export const HEAP_RETAINER_DEPTH = 12;
export const HEAP_RETAINER_NODE_CAP = 200;
export const HEAP_RETAINER_SIBLING_CAP = 8;
export const HEAP_OUTGOING_EDGE_CAP = 30;
export const HEAP_PARSER_PROBLEM_CAP = 20;

export type HeapCaptureSessionId = Branded<"HeapCaptureSessionId">;
export type HeapTargetId = Branded<"HeapTargetId">;
export type HeapBrowserContextId = Branded<"HeapBrowserContextId">;

export const heapCaptureSessionIdSchema = brandedId<HeapCaptureSessionId>();
export const heapTargetIdSchema = brandedId<HeapTargetId>();
export const heapBrowserContextIdSchema = brandedId<HeapBrowserContextId>();

export interface HeapCaptureRequest {
  readonly label: string;
  readonly page: number;
}

export interface HeapComparisonRequest {
  readonly left: string;
  readonly right: string;
  readonly page: number;
}

export type HeapRetainerSelector =
  | { readonly kind: "node-id"; readonly nodeId: number }
  | { readonly kind: "detached" }
  | { readonly kind: "class"; readonly className: string };

export interface HeapRetainerRequest {
  readonly snapshot: string;
  readonly selector: HeapRetainerSelector;
  readonly page: number;
}

export interface HeapBrowserIdentity {
  readonly product: string;
  readonly protocolVersion: string;
  readonly revision: string;
  readonly userAgent: string;
  readonly jsVersion: string;
}

export interface HeapTargetIdentity {
  readonly targetId: HeapTargetId;
  readonly browserContextId: HeapBrowserContextId | null;
  readonly url: string;
  readonly title: string;
  readonly contextIndex: number;
  readonly pageIndex: number;
}

export interface HeapSnapshotIdentity {
  readonly label: string;
  readonly rawPath: string;
  readonly summaryPath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly capturedAt: string;
  readonly captureSessionId: HeapCaptureSessionId;
  readonly browser: HeapBrowserIdentity;
  readonly target: HeapTargetIdentity;
  readonly parser: {
    readonly package: typeof HEAP_PARSER_PACKAGE;
    readonly version: typeof HEAP_PARSER_VERSION;
    readonly engine: "HeapSnapshotManager";
  };
}

export interface HeapNodeSummary {
  readonly nodeId: number;
  readonly name: string;
  readonly type: string;
  readonly distance: number;
  readonly selfSize: number;
  readonly retainedSize: number;
  readonly detached: boolean;
}

export interface HeapClassSummary {
  readonly className: string;
  readonly count: number;
  readonly selfSize: number;
  readonly maxRetainedSize: number;
}

export interface HeapSnapshotReceipt {
  readonly v: 1;
  readonly kind: "snapshot";
  readonly identity: HeapSnapshotIdentity;
  readonly statistics: {
    readonly total: number;
    readonly nativeTotal: number;
    readonly typedArrays: number;
    readonly v8Total: number;
    readonly code: number;
    readonly jsArrays: number;
    readonly strings: number;
    readonly system: number;
  };
  readonly population: {
    readonly nodes: number;
    readonly objects: number;
    readonly totalSelfSize: number;
    readonly rootNodeIndex: number;
    readonly maxJsObjectId: number;
  };
  readonly nativeContexts: {
    readonly total: number;
    readonly shown: number;
    readonly omitted: number;
    readonly sharedSize: number;
    readonly unattributedSize: number;
    readonly rows: readonly {
      readonly nodeId: number;
      readonly name: string;
      readonly selfSize: number;
      readonly retainedSize: number;
      readonly attributedSize: number;
    }[];
  };
  readonly retainedByContext: {
    readonly contextCount: number;
    readonly retainedSize: number;
    readonly retainedCount: number;
    readonly notRetainedSize: number;
    readonly notRetainedCount: number;
    readonly totalSize: number;
  };
  readonly topClasses: {
    readonly total: number;
    readonly shown: number;
    readonly omitted: number;
    readonly rows: readonly HeapClassSummary[];
  };
  readonly detached: {
    readonly count: number;
    readonly shown: number;
    readonly omitted: number;
    readonly totalSelfSize: number;
    readonly totalRetainedSize: number;
    readonly rows: readonly HeapNodeSummary[];
  };
  /** Official DevTools weak-root/problem reports retained instead of dumped to Snap stderr. */
  readonly parserProblems: {
    readonly total: number;
    readonly shown: number;
    readonly omitted: number;
    readonly rows: readonly string[];
  };
  readonly problems: readonly SnapAnalyzerProblem[];
  readonly limits: readonly InstrumentArtifactLimitReceipt[];
}

const finite = z.number();
const nonnegative = z.number().int().nonnegative();
const heapNodeSummarySchema: z.ZodType<HeapNodeSummary> = z.object({
  nodeId: nonnegative,
  name: z.string(),
  type: z.string(),
  distance: finite,
  selfSize: finite.nonnegative(),
  retainedSize: finite.nonnegative(),
  detached: z.boolean(),
});
const heapClassSummarySchema: z.ZodType<HeapClassSummary> = z.object({
  className: z.string(),
  count: nonnegative,
  selfSize: finite.nonnegative(),
  maxRetainedSize: finite.nonnegative(),
});
const heapProblemSchema: z.ZodType<SnapAnalyzerProblem> = z.object({
  arm: z.enum(["motion", "interaction-perf", "heap"]),
  kind: z.enum(SNAP_ANALYZER_PROBLEM_KINDS),
  metric: z.string(),
  subject: z.string(),
  observed: z.string(),
  threshold: z.string(),
  detail: z.string(),
});
// #1652: the limit-receipt shape's ONE home is `_shared/artifact-out.ts` — imported, never re-spelled.
const heapIdentitySchema: z.ZodType<HeapSnapshotIdentity> = z.object({
  label: z.string(),
  rawPath: z.string(),
  summaryPath: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: nonnegative,
  capturedAt: z.string(),
  captureSessionId: heapCaptureSessionIdSchema,
  browser: z.object({
    product: z.string(),
    protocolVersion: z.string(),
    revision: z.string(),
    userAgent: z.string(),
    jsVersion: z.string(),
  }),
  target: z.object({
    targetId: heapTargetIdSchema,
    browserContextId: heapBrowserContextIdSchema.nullable(),
    url: z.string(),
    title: z.string(),
    contextIndex: nonnegative,
    pageIndex: nonnegative,
  }),
  parser: z.object({
    package: z.literal(HEAP_PARSER_PACKAGE),
    version: z.literal(HEAP_PARSER_VERSION),
    engine: z.literal("HeapSnapshotManager"),
  }),
});

export const heapSnapshotReceiptSchema: z.ZodType<HeapSnapshotReceipt> = z.object({
  v: z.literal(1),
  kind: z.literal("snapshot"),
  identity: heapIdentitySchema,
  statistics: z.object({
    total: finite.nonnegative(),
    nativeTotal: finite.nonnegative(),
    typedArrays: finite.nonnegative(),
    v8Total: finite.nonnegative(),
    code: finite.nonnegative(),
    jsArrays: finite.nonnegative(),
    strings: finite.nonnegative(),
    system: finite.nonnegative(),
  }),
  population: z.object({
    nodes: nonnegative,
    objects: nonnegative,
    totalSelfSize: finite.nonnegative(),
    rootNodeIndex: nonnegative,
    maxJsObjectId: nonnegative,
  }),
  nativeContexts: z.object({
    total: nonnegative,
    shown: nonnegative,
    omitted: nonnegative,
    sharedSize: finite.nonnegative(),
    unattributedSize: finite.nonnegative(),
    rows: z.array(
      z.object({
        nodeId: nonnegative,
        name: z.string(),
        selfSize: finite.nonnegative(),
        retainedSize: finite.nonnegative(),
        attributedSize: finite.nonnegative(),
      }),
    ),
  }),
  retainedByContext: z.object({
    contextCount: nonnegative,
    retainedSize: finite.nonnegative(),
    retainedCount: nonnegative,
    notRetainedSize: finite.nonnegative(),
    notRetainedCount: nonnegative,
    totalSize: finite.nonnegative(),
  }),
  topClasses: z.object({ total: nonnegative, shown: nonnegative, omitted: nonnegative, rows: z.array(heapClassSummarySchema) }),
  detached: z.object({
    count: nonnegative,
    shown: nonnegative,
    omitted: nonnegative,
    totalSelfSize: finite.nonnegative(),
    totalRetainedSize: finite.nonnegative(),
    rows: z.array(heapNodeSummarySchema),
  }),
  parserProblems: z.object({ total: nonnegative, shown: nonnegative, omitted: nonnegative, rows: z.array(z.string()) }),
  problems: z.array(heapProblemSchema),
  limits: z.array(artifactLimitReceiptSchema),
});

export interface HeapClassDelta {
  readonly className: string;
  readonly addedCount: number;
  readonly removedCount: number;
  readonly countDelta: number;
  readonly addedSize: number;
  readonly removedSize: number;
  readonly sizeDelta: number;
  readonly before: HeapClassSummary | null;
  readonly after: HeapClassSummary | null;
  readonly maxRetainedSizeDelta: number | null;
}

export interface HeapComparisonReceipt {
  readonly v: 1;
  readonly kind: "comparison";
  readonly left: HeapSnapshotIdentity;
  readonly right: HeapSnapshotIdentity;
  readonly deltas: {
    readonly total: number;
    readonly nativeTotal: number;
    readonly v8Total: number;
    readonly nodes: number;
    readonly objects: number;
    readonly totalSelfSize: number;
    readonly detachedCount: number;
    readonly detachedSelfSize: number;
    readonly detachedRetainedSize: number;
  };
  readonly classes: {
    readonly total: number;
    readonly shown: number;
    readonly omitted: number;
    readonly rows: readonly HeapClassDelta[];
  };
  readonly problems: readonly SnapAnalyzerProblem[];
  readonly limits: readonly InstrumentArtifactLimitReceipt[];
}

export interface HeapRetainingEdge {
  readonly nodeId: number;
  readonly nodeName: string;
  readonly edgeName: string;
  readonly edgeType: string;
  readonly distance: number;
  readonly children: readonly HeapRetainingEdge[];
}

export interface HeapDominatorNode {
  readonly nodeId: number;
  readonly nodeName: string;
  readonly selfSize: number;
  readonly retainedSize: number;
}

export interface HeapOutgoingEdge {
  readonly name: string;
  readonly type: string;
  readonly node: HeapNodeSummary;
}

export interface HeapRetainerReceipt {
  readonly v: 1;
  readonly kind: "retainers";
  readonly snapshot: HeapSnapshotIdentity;
  readonly selector: HeapRetainerSelector;
  readonly candidates: number;
  readonly selected: HeapNodeSummary;
  readonly paths: readonly HeapRetainingEdge[];
  readonly dominators: readonly HeapDominatorNode[];
  readonly outgoing: {
    readonly total: number;
    readonly shown: number;
    readonly omitted: number;
    readonly rows: readonly HeapOutgoingEdge[];
  };
  readonly pathLimits: {
    readonly depth: boolean;
    readonly nodes: boolean;
    readonly siblings: boolean;
  };
  readonly problems: readonly SnapAnalyzerProblem[];
  readonly limits: readonly InstrumentArtifactLimitReceipt[];
}

export interface HeapPageEvidence {
  readonly snapshots: readonly HeapSnapshotReceipt[];
  readonly comparisons: readonly HeapComparisonReceipt[];
  readonly retainers: readonly HeapRetainerReceipt[];
  readonly errors: readonly string[];
}
