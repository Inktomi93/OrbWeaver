// Browser heap evidence from the exact settled page Snap already owns. Capture is Playwright CDP;
// parsing is the pinned official DevTools HeapSnapshotManager. This arm never launches/attaches/closes a
// browser or context and never turns a byte-size observation into an arbitrary gate.
import { randomUUID } from "node:crypto";
import { errorMessage } from "@orb/kit/error-message";
import type { BrowserContext } from "@playwright/test";
import { artifactKey } from "../../../_shared/artifact-naming.ts";
import type { InstrumentArtifactCompleteness, InstrumentArtifactMetadata } from "../../../_shared/artifact-out.ts";
import { artifactFile, registerInstrumentArtifact } from "../../../_shared/artifact-out.ts";
import { aggregateScope, exactScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmPageContext, ArmPairInput } from "../../contract/arms.ts";
import type {
  HeapCaptureSessionId,
  HeapComparisonReceipt,
  HeapPageEvidence,
  HeapRetainerReceipt,
  HeapSnapshotReceipt,
  HeapTargetIdentity,
} from "../../contract/heap.ts";
import { HEAP_COMPARISON_SCHEMA, HEAP_RETAINERS_SCHEMA, HEAP_SNAPSHOT_SCHEMA, heapCaptureSessionIdSchema } from "../../contract/heap.ts";
import type { Args } from "../../contract/types.ts";
import { captureScope } from "../../lib/capture-scope.ts";
import {
  buildHeapComparisonReceipt,
  buildHeapRetainerReceipt,
  buildHeapSnapshotReceipt,
  heapRawFileBytes,
  parseHeapCapture,
  parseHeapComparison,
  parseHeapRetainer,
  resolveHeapSnapshotReference,
  writeHeapJson,
} from "../../lib/heap-analysis.ts";
import { withHeapDevToolsParser } from "../../lib/heap-devtools.ts";
import { captureRawHeap } from "../heap-capture.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --heap <label>");

interface HeapContextState {
  readonly captureSessionId: HeapCaptureSessionId;
  readonly snapshots: Map<string, HeapSnapshotReceipt>;
}

const HEAP_CONTEXTS = new WeakMap<BrowserContext, HeapContextState>();
const HEAP_SESSION_CALL_BASE_MS = 30_000;

function contextState(context: BrowserContext): HeapContextState {
  const current = HEAP_CONTEXTS.get(context);
  if (current !== undefined) {
    return current;
  }
  const created: HeapContextState = { captureSessionId: heapCaptureSessionIdSchema.parse(randomUUID()), snapshots: new Map() };
  HEAP_CONTEXTS.set(context, created);
  return created;
}

function pageIdentity(ctx: ArmPageContext, target: Omit<HeapTargetIdentity, "contextIndex" | "pageIndex">): HeapTargetIdentity {
  const contextsMode = ctx.opts.contexts > 1;
  return {
    ...target,
    contextIndex: contextsMode ? ctx.pageIndex : 0,
    pageIndex: contextsMode ? 0 : ctx.pageIndex,
  };
}

function completeness(limits: readonly { readonly events: readonly unknown[] }[]): "complete" | "bounded" {
  return limits.some((receipt) => receipt.events.length > 0) ? "bounded" : "complete";
}

function metadata(input: {
  readonly channel: string;
  readonly schema: string;
  readonly detail: string;
  readonly context: number;
  readonly page: number;
  readonly window: string;
  readonly records: number | null;
  readonly limits: InstrumentArtifactMetadata["limits"];
  readonly completeness?: InstrumentArtifactCompleteness;
}): InstrumentArtifactMetadata {
  return {
    producer: "heap",
    producerArm: "heap",
    channel: input.channel,
    mediaType: "application/json",
    schema: input.schema,
    role: "primary",
    completeness: input.completeness ?? completeness(input.limits),
    completenessDetail: input.detail,
    scope: exactScope(input.context, input.page, input.window),
    records: input.records,
    limits: input.limits,
  };
}

function rawMetadata(receipt: HeapSnapshotReceipt): InstrumentArtifactMetadata {
  return {
    ...metadata({
      channel: "heap-snapshot",
      schema: "v8-heap-snapshot",
      detail: "lossless V8 heap snapshot after HeapProfiler.collectGarbage",
      context: receipt.identity.target.contextIndex,
      page: receipt.identity.target.pageIndex,
      window: `heap:${receipt.identity.label}`,
      records: receipt.population.nodes,
      limits: [],
      completeness: "complete",
    }),
    mediaType: "application/json",
  };
}

async function registerPartialRaw(path: string, ctx: ArmPageContext, label: string, detail: string): Promise<void> {
  let bytes: number | null = null;
  // @orb-waive caught-failure-ownership(catch): a failed capture may create no file; the primary error is retained by runHeapPage and exits 2. Ends if the caller stops preserving/printing that primary error.
  try {
    bytes = await heapRawFileBytes(path);
  } catch {
    return;
  }
  await registerInstrumentArtifact(
    "heap",
    path,
    metadata({
      channel: "heap-snapshot",
      schema: "v8-heap-snapshot",
      detail,
      context: ctx.opts.contexts > 1 ? ctx.pageIndex : 0,
      page: ctx.opts.contexts > 1 ? 0 : ctx.pageIndex,
      window: `heap:${label}`,
      records: bytes,
      limits: [],
      completeness: "unknown",
    }),
  );
}

function snapshotLine(receipt: HeapSnapshotReceipt): string {
  return `HEAP         ${receipt.identity.label} nodes=${String(receipt.population.nodes)} objects=${String(receipt.population.objects)} total=${String(receipt.statistics.total)} detached=${String(receipt.detached.count)} raw=${receipt.identity.rawPath} summary=${receipt.identity.summaryPath}`;
}

function comparisonLine(path: string, receipt: HeapComparisonReceipt): string {
  const left = receipt.left.label;
  const right = receipt.right.label;
  return `HEAP COMPARE ${left}->${right} total-delta=${String(receipt.deltas.total)} object-delta=${String(receipt.deltas.objects)} detached-delta=${String(receipt.deltas.detachedCount)} classes=${String(receipt.classes.shown)}/${String(receipt.classes.total)} artifact=${path}`;
}

function retainerLine(path: string, receipt: HeapRetainerReceipt): string {
  return `HEAP RETAIN  ${receipt.snapshot.label} node=@${String(receipt.selected.nodeId)} ${receipt.selected.name} retained=${String(receipt.selected.retainedSize)} paths=${String(receipt.paths.length)} dominators=${String(receipt.dominators.length)} artifact=${path}`;
}

async function captureOne(ctx: ArmPageContext, state: HeapContextState, request: Args["heapCaptures"][number], base: string): Promise<HeapSnapshotReceipt> {
  if (state.snapshots.has(request.label)) {
    throw new Error(`HEAP CAPTURE REFUSED: label ${JSON.stringify(request.label)} already exists in this browser context`);
  }
  const rawPath = await artifactFile("heap", `${base}-heap-${request.label}`, ".heapsnapshot");
  const summaryPath = `${rawPath}.json`;
  try {
    const captured = await captureRawHeap(ctx.page, rawPath);
    const receipt = await withHeapDevToolsParser(
      async (parser) =>
        await buildHeapSnapshotReceipt(parser, {
          label: request.label,
          rawPath,
          summaryPath,
          capturedAt: new Date().toISOString(),
          captureSessionId: state.captureSessionId,
          browser: captured.browser,
          target: pageIdentity(ctx, captured.target),
        }),
    );
    await registerInstrumentArtifact("heap", rawPath, rawMetadata(receipt));
    await registerInstrumentArtifact(
      "heap",
      summaryPath,
      metadata({
        channel: "heap-summary",
        schema: HEAP_SNAPSHOT_SCHEMA,
        detail: "bounded agent-readable projection; raw snapshot remains lossless",
        context: receipt.identity.target.contextIndex,
        page: receipt.identity.target.pageIndex,
        window: `heap:${request.label}`,
        records: receipt.topClasses.total + receipt.detached.count,
        limits: receipt.limits,
      }),
    );
    state.snapshots.set(request.label, receipt);
    print(snapshotLine(receipt));
    return receipt;
  } catch (error) {
    await registerPartialRaw(rawPath, ctx, request.label, `incomplete heap snapshot: ${errorMessage(error)}`);
    throw error;
  }
}

async function compareOne(state: HeapContextState, request: Args["heapComparisons"][number], base: string, index: number): Promise<HeapComparisonReceipt> {
  const [left, right] = await Promise.all([
    resolveHeapSnapshotReference(request.left, { get: (label) => state.snapshots.get(label) }),
    resolveHeapSnapshotReference(request.right, { get: (label) => state.snapshots.get(label) }),
  ]);
  const receipt = await withHeapDevToolsParser(async (parser) => await buildHeapComparisonReceipt(parser, left, right));
  const path = await artifactFile("heap", `${base}-heap-compare-${String(index + 1)}`, ".json");
  await writeHeapJson(path, receipt);
  await registerInstrumentArtifact(
    "heap",
    path,
    metadata({
      channel: "heap-comparison",
      schema: HEAP_COMPARISON_SCHEMA,
      detail: "bounded class diff with exact before/after snapshot provenance",
      context: right.identity.target.contextIndex,
      page: right.identity.target.pageIndex,
      window: `heap:${left.identity.label}->${right.identity.label}`,
      records: receipt.classes.total,
      limits: receipt.limits,
    }),
  );
  print(comparisonLine(path, receipt));
  return receipt;
}

async function retainOne(state: HeapContextState, request: Args["heapRetainers"][number], base: string, index: number): Promise<HeapRetainerReceipt> {
  const snapshot = await resolveHeapSnapshotReference(request.snapshot, { get: (label) => state.snapshots.get(label) });
  const receipt = await withHeapDevToolsParser(async (parser) => await buildHeapRetainerReceipt(parser, snapshot, request.selector));
  const path = await artifactFile("heap", `${base}-heap-retainers-${String(index + 1)}`, ".json");
  await writeHeapJson(path, receipt);
  await registerInstrumentArtifact(
    "heap",
    path,
    metadata({
      channel: "heap-retainers",
      schema: HEAP_RETAINERS_SCHEMA,
      detail: "bounded retaining paths and outgoing edges with full returned dominator chain",
      context: snapshot.identity.target.contextIndex,
      page: snapshot.identity.target.pageIndex,
      window: `heap:${snapshot.identity.label}`,
      records: receipt.paths.length + receipt.dominators.length + receipt.outgoing.total,
      limits: receipt.limits,
    }),
  );
  print(retainerLine(path, receipt));
  return receipt;
}

function pageRequests(
  opts: Args,
  pageIndex: number,
): {
  readonly captures: Args["heapCaptures"];
  readonly comparisons: Args["heapComparisons"];
  readonly retainers: Args["heapRetainers"];
} {
  return {
    captures: opts.heapCaptures.filter((row) => row.page === pageIndex),
    comparisons: opts.heapComparisons.filter((row) => row.page === pageIndex),
    retainers: opts.heapRetainers.filter((row) => row.page === pageIndex),
  };
}

async function runHeapPage(ctx: ArmPageContext): Promise<void> {
  const request = pageRequests(ctx.opts, ctx.pageIndex);
  const snapshots: HeapSnapshotReceipt[] = [];
  const comparisons: HeapComparisonReceipt[] = [];
  const retainers: HeapRetainerReceipt[] = [];
  const errors: string[] = [];
  const state = contextState(ctx.page.context());
  const base = artifactKey(ctx.plan.out);
  for (const capture of request.captures) {
    // @orb-waive caught-failure-ownership(error): every caught capture failure enters errors, prints HEAP REFUSED, persists on CaptureOutcome, and forces page-arm exit 2. Ends if any one of those owners stops reading errors.
    try {
      snapshots.push(await captureOne(ctx, state, capture, base));
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  for (const [index, comparison] of request.comparisons.entries()) {
    // @orb-waive caught-failure-ownership(error): every caught comparison failure enters errors, prints HEAP REFUSED, persists on CaptureOutcome, and forces page-arm exit 2. Ends if any one of those owners stops reading errors.
    try {
      comparisons.push(await compareOne(state, comparison, base, index));
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  for (const [index, retainer] of request.retainers.entries()) {
    // @orb-waive caught-failure-ownership(error): every caught retainer failure enters errors, prints HEAP REFUSED, persists on CaptureOutcome, and forces page-arm exit 2. Ends if any one of those owners stops reading errors.
    try {
      retainers.push(await retainOne(state, retainer, base, index));
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  for (const error of errors) {
    print(`HEAP REFUSED ${error}`);
  }
  const evidence: HeapPageEvidence = { snapshots, comparisons, retainers, errors };
  ctx.outcome.heap = evidence;
}

function heapEvidence(input: ArmPairInput): readonly HeapPageEvidence[] {
  return input.outcomes.flatMap((outcome) => (outcome.heap === null ? [] : [outcome.heap]));
}

function heapRequested(opts: Args): boolean {
  return opts.heapCaptures.length > 0 || opts.heapComparisons.length > 0 || opts.heapRetainers.length > 0;
}

export const HEAP_ARM = {
  flags: [
    {
      flag: "--heap",
      kind: "required-value",
      pageTargetable: true,
      group: "Measure",
      summary: "force GC and capture the settled page's V8 heap plus parsed sidecar",
      handler: (args, rest, page): void => {
        // @orb-waive caught-failure-ownership(error): the caught grammar detail enters Args.errors and the CLI refuses before browser work. Ends if parseSnapArgs stops surfacing Args.errors.
        try {
          args.heapCaptures.push(parseHeapCapture(rest.shift() ?? "", page));
        } catch (error) {
          args.errors.push(errorMessage(error));
        }
      },
    },
    {
      flag: "--heap-compare",
      kind: "required-value",
      pageTargetable: true,
      group: "Measure",
      summary: "left=right — growth/detached findings between two heap labels or snapshot paths (diagnostic, never a budget gate)",
      handler: (args, rest, page): void => {
        // @orb-waive caught-failure-ownership(error): the caught grammar detail enters Args.errors and the CLI refuses before browser work. Ends if parseSnapArgs stops surfacing Args.errors.
        try {
          args.heapComparisons.push(parseHeapComparison(rest.shift() ?? "", page));
        } catch (error) {
          args.errors.push(errorMessage(error));
        }
      },
    },
    {
      flag: "--heap-retainers",
      kind: "required-value",
      pageTargetable: true,
      group: "Measure",
      summary: "snapshot=selector — retaining paths, dominators and outgoing edges for a snapshot node",
      handler: (args, rest, page): void => {
        // @orb-waive caught-failure-ownership(error): the caught grammar detail enters Args.errors and the CLI refuses before browser work. Ends if parseSnapArgs stops surfacing Args.errors.
        try {
          args.heapRetainers.push(parseHeapRetainer(rest.shift() ?? "", page));
        } catch (error) {
          args.errors.push(errorMessage(error));
        }
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (opts): number | null => (heapRequested(opts) ? HEAP_SESSION_CALL_BASE_MS : null),
  defaults: (): Pick<ArmArgs, "heapCaptures" | "heapComparisons" | "heapRetainers"> => ({ heapCaptures: [], heapComparisons: [], heapRetainers: [] }),
  help: `  --heap <label>          force GC and capture the exact settled page's lossless V8 heap plus a
                          bounded parsed sidecar. Repeat or add @N for --pages. Artifacts always stay in
                          this call's immutable run slot; labels persist across calls only inside the same
                          named-session/scenario BrowserContext.
  --heap-compare <left=right>
                          compare two labels (or absolute Snap .heapsnapshot paths with valid sidecars);
                          structured growth/detached findings are diagnostic and NEVER a size budget gate.
  --heap-retainers <snapshot=selector>
                          file bounded retaining paths, dominators and outgoing edges. selector is
                          @<node-id>, detached, or class:<exact-class-name>. Use a session/scenario for
                          meaningful before/after checkpoints; no memory/leak aliases exist.`,
  result: {
    schema: "snap-arm-heap-v1",
    source: "CDP HeapProfiler + official DevTools HeapSnapshotManager",
    lifetime: "one exact settled page checkpoint",
    enabled: heapRequested,
  },
  lifecycle: {
    at: "page",
    enabled: (ctx): boolean => {
      const request = pageRequests(ctx.opts, ctx.pageIndex);
      return request.captures.length > 0 || request.comparisons.length > 0 || request.retainers.length > 0;
    },
    run: runHeapPage,
    pairs: (input): readonly ResultPair[] => {
      if (!heapRequested(input.opts)) {
        return [["heap", "off"]];
      }
      const evidence = heapEvidence(input);
      const errors = evidence.reduce((sum, row) => sum + row.errors.length, 0);
      const snapshots = evidence.reduce((sum, row) => sum + row.snapshots.length, 0);
      const comparisons = evidence.reduce((sum, row) => sum + row.comparisons.length, 0);
      const retainers = evidence.reduce((sum, row) => sum + row.retainers.length, 0);
      const findings = evidence.reduce(
        (sum, row) =>
          sum +
          row.snapshots.reduce((count, receipt) => count + receipt.problems.length, 0) +
          row.comparisons.reduce((count, receipt) => count + receipt.problems.length, 0) +
          row.retainers.reduce((count, receipt) => count + receipt.problems.length, 0),
        0,
      );
      return [
        ["heap", errors === 0 ? "measured" : "REFUSED"],
        ["heap-snapshots", snapshots],
        ["heap-comparisons", comparisons],
        ["heap-retainers", retainers],
        ["heap-findings", findings],
      ];
    },
    // This arm files as it measures — every snapshot, comparison and retainer walk lands as its own
    // declared artifact under `heap` (`artifactFile`/`registerInstrumentArtifact` above), which is what
    // binds them to this fact. Nothing it prints is unfiled (#1342 audit).
    evidence: (): Promise<void> => Promise.resolve(),
    facts: (input): readonly ArmFactEmission<"heap">[] => {
      if (!heapRequested(input.opts)) {
        return [{ scope: aggregateScope(), data: { state: "off", detail: null, snapshots: 0, comparisons: 0, retainers: 0, findings: 0, errors: 0 } }];
      }
      return input.outcomes.flatMap((outcome) => {
        const evidence = outcome.heap;
        if (evidence === null) {
          return [];
        }
        const findings = [...evidence.snapshots, ...evidence.comparisons, ...evidence.retainers].reduce((sum, receipt) => sum + receipt.problems.length, 0);
        return [
          {
            scope: captureScope(input.opts, outcome.pageIndex, "heap-checkpoints"),
            data: {
              state: evidence.errors.length > 0 ? "refused" : "passed",
              detail: evidence.errors[0] ?? null,
              snapshots: evidence.snapshots.length,
              comparisons: evidence.comparisons.length,
              retainers: evidence.retainers.length,
              findings,
              errors: evidence.errors.length,
            },
          },
        ];
      });
    },
    failures: (): ArmFailureCounts => ({}),
    exit: (input, code): number => (heapEvidence(input).some((row) => row.errors.length > 0) ? EXIT.toolError : code),
  },
} satisfies ArmDef<"heap">;
